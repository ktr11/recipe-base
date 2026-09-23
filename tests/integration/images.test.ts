import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mediaBucketName, s3 } from './helpers/backend';
import { deleteTeamRecords } from './helpers/cleanup';
import { gql } from './helpers/graphql';
import {
  createTestUser,
  deleteTestUser,
  refreshIdToken,
  type TestUser,
} from './helpers/test-user';

/**
 * レシピ画像の認可の検証（docs/design.md §7.1 / §10.2）
 *
 * Storage のアクセスルールでは動的な teamId グループを表現できないため、
 * S3 の認可は「teamFunction が呼び出し元のグループ所属を検証してから
 * 署名付き URL を発行する」ことだけで成立している。この検証が誤っていた
 * 場合の帰結は「他人の家族のレシピ写真が見える・消せる」であり、
 * モックでは何も証明できない。authorization.test.ts と同じく、
 * 主眼は「できないこと」の確認にある。
 */

const GET_UPLOAD_URL = `
  mutation GetImageUploadUrl {
    getImageUploadUrl { key url }
  }`;

const GET_VIEW_URLS = `
  query GetImageViewUrls($keys: [String!]!) {
    getImageViewUrls(keys: $keys) { key url }
  }`;

const DELETE_IMAGE = `
  mutation DeleteImage($key: String!) {
    deleteImage(key: $key)
  }`;

type PresignedUrl = { key: string; url: string };

/** 中身は S3 にとってはただのバイト列でよい。JPEG の SOI/EOI だけ持たせる */
const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

/** アップロード URL を発行し、実際に PUT してキーを返す */
const uploadImage = async (user: TestUser): Promise<string> => {
  const result = await gql<{ getImageUploadUrl: PresignedUrl }>(
    user.idToken,
    GET_UPLOAD_URL,
  );
  const target = result.data?.getImageUploadUrl;
  if (!target) {
    throw new Error(`アップロード URL を発行できませんでした: ${JSON.stringify(result.errors)}`);
  }

  const response = await fetch(target.url, {
    method: 'PUT',
    body: IMAGE_BYTES,
    // 署名に ContentType が含まれるため、一致させないと拒否される
    headers: { 'Content-Type': 'image/jpeg' },
  });
  if (!response.ok) {
    throw new Error(`PUT に失敗しました: ${response.status}`);
  }
  return target.key;
};

const viewUrls = (user: TestUser, keys: string[]) =>
  gql<{ getImageViewUrls: PresignedUrl[] }>(user.idToken, GET_VIEW_URLS, { keys });

/** バケットにオブジェクトが存在するか（管理者権限での直接確認） */
const objectExists = async (key: string): Promise<boolean> => {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: mediaBucketName(), Key: key }));
    return true;
  } catch {
    return false;
  }
};

describe('画像の署名付き URL がチーム単位で認可されること', () => {
  let alice: TestUser;
  let bob: TestUser;
  let aliceKey: string;

  beforeAll(async () => {
    alice = await createTestUser();
    bob = await createTestUser();
    aliceKey = await uploadImage(alice);
  });

  afterAll(async () => {
    await gql(alice.idToken, DELETE_IMAGE, { key: aliceKey });
    await Promise.all([
      deleteTeamRecords({ teamId: alice.teamId, userId: alice.sub }),
      deleteTeamRecords({ teamId: bob.teamId, userId: bob.sub }),
    ]);
    await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
  });

  it('発行されたキーは自チームのプレフィックスを持つ', () => {
    expect(aliceKey.startsWith(`media/${alice.teamId}/`)).toBe(true);
  });

  it('自チームの画像は閲覧 URL を発行でき、実際に取得できる', async () => {
    const result = await viewUrls(alice, [aliceKey]);
    const url = result.data?.getImageViewUrls?.[0]?.url;
    expect(url).toBeTruthy();

    const response = await fetch(url as string);
    expect(response.ok).toBe(true);
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body).toEqual(IMAGE_BYTES);
  });

  it('他チームのキーでは閲覧 URL を発行できない', async () => {
    // この方式の存在意義そのもの。ここが通ると「URL さえ発行してもらえば
    // 他人の家族の写真が見える」ことになる
    const result = await viewUrls(bob, [aliceKey]);
    expect(result.data?.getImageViewUrls ?? null).toBeNull();
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('他チームのキーでは削除できない', async () => {
    const result = await gql<{ deleteImage: boolean }>(bob.idToken, DELETE_IMAGE, {
      key: aliceKey,
    });
    expect(result.errors?.length).toBeGreaterThan(0);

    // 実際に消えていないことを確認する
    expect(await objectExists(aliceKey)).toBe(true);
  });

  it('キー形式が不正なら拒否される', async () => {
    const result = await viewUrls(alice, ['media/../secret.jpg']);
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('自チームの画像は削除でき、オブジェクトも消える', async () => {
    const key = await uploadImage(alice);

    const result = await gql<{ deleteImage: boolean }>(alice.idToken, DELETE_IMAGE, {
      key,
    });
    expect(result.data?.deleteImage).toBe(true);
    expect(await objectExists(key)).toBe(false);
  });
});

const CREATE_RECIPE = `
  mutation CreateRecipe($input: CreateRecipeInput!) {
    createRecipe(input: $input) { id teamId title imageKey }
  }`;

const GET_RECIPE = `
  query GetRecipe($id: ID!) {
    getRecipe(id: $id) { id teamId imageKey }
  }`;

const DELETE_RECIPE = `
  mutation DeleteRecipe($input: DeleteRecipeInput!) {
    deleteRecipe(input: $input) { id }
  }`;

const ISSUE_INVITE_CODE = `
  mutation IssueInviteCode {
    issueInviteCode { inviteCode expiresAt }
  }`;

const JOIN_TEAM = `
  mutation JoinTeam($inviteCode: String!) {
    joinTeam(inviteCode: $inviteCode) { teamId teamName }
  }`;

type Recipe = { id: string; teamId: string; imageKey: string | null };

describe('チーム参加でレシピと一緒に画像が移送されること', () => {
  let joiner: TestUser;
  let host: TestUser;
  let joinerOldTeamId: string;
  let recipeId: string;
  let oldKey: string;
  let movedKey: string | null = null;

  beforeAll(async () => {
    joiner = await createTestUser();
    host = await createTestUser();
    joinerOldTeamId = joiner.teamId;

    // 1人チームのユーザーが、画像付きレシピを持って別チームに参加する
    oldKey = await uploadImage(joiner);
    const created = await gql<{ createRecipe: Recipe }>(joiner.idToken, CREATE_RECIPE, {
      input: {
        teamId: joiner.teamId,
        title: '画像つき肉じゃが',
        servings: 2,
        imageKey: oldKey,
      },
    });
    if (!created.data?.createRecipe) {
      throw new Error(`レシピを作成できませんでした: ${JSON.stringify(created.errors)}`);
    }
    recipeId = created.data.createRecipe.id;

    const issued = await gql<{ issueInviteCode: { inviteCode: string } }>(
      host.idToken,
      ISSUE_INVITE_CODE,
    );
    const inviteCode = issued.data?.issueInviteCode.inviteCode;
    if (!inviteCode) {
      throw new Error(`招待コードを発行できませんでした: ${JSON.stringify(issued.errors)}`);
    }

    const joined = await gql<{ joinTeam: { teamId: string } }>(
      joiner.idToken,
      JOIN_TEAM,
      { inviteCode },
    );
    if (joined.data?.joinTeam.teamId !== host.teamId) {
      throw new Error(`チームに参加できませんでした: ${JSON.stringify(joined.errors)}`);
    }
    joiner = await refreshIdToken(joiner, host.teamId);
  });

  afterAll(async () => {
    if (movedKey) {
      await gql(joiner.idToken, DELETE_IMAGE, { key: movedKey });
    }
    await gql(joiner.idToken, DELETE_RECIPE, { input: { id: recipeId } });
    await Promise.all([
      // joiner の旧チームは joinTeam の1人チーム畳み込みで削除済み
      deleteTeamRecords({ teamId: host.teamId, userId: host.sub }),
      deleteTeamRecords({ teamId: host.teamId, userId: joiner.sub }),
    ]);
    await Promise.all([deleteTestUser(joiner), deleteTestUser(host)]);
  });

  it('レシピの imageKey が新チームのプレフィックスに書き換わる', async () => {
    const result = await gql<{ getRecipe: Recipe | null }>(joiner.idToken, GET_RECIPE, {
      id: recipeId,
    });
    const recipe = result.data?.getRecipe;
    expect(recipe?.teamId).toBe(host.teamId);
    expect(recipe?.imageKey?.startsWith(`media/${host.teamId}/`)).toBe(true);
    movedKey = recipe?.imageKey ?? null;
  });

  it('受け入れ側のメンバーも移送後の画像を閲覧できる', async () => {
    expect(movedKey).not.toBeNull();
    const result = await viewUrls(host, [movedKey as string]);
    const url = result.data?.getImageViewUrls?.[0]?.url;
    expect(url).toBeTruthy();

    const response = await fetch(url as string);
    expect(response.ok).toBe(true);
  });

  it('旧チームのオブジェクトは削除されている', async () => {
    expect(await objectExists(oldKey)).toBe(false);
    // 移送先には存在する
    expect(await objectExists(movedKey as string)).toBe(true);
  });

  it('旧チームのキーは（チームが消えたため）誰からも発行できない', async () => {
    const result = await viewUrls(joiner, [oldKey]);
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('前提の確認: 旧チーム ID は新チームと異なる', () => {
    expect(joinerOldTeamId).not.toBe(host.teamId);
  });
});
