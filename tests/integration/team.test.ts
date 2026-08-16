import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteTeamRecords } from './helpers/cleanup';
import { gql, isUnauthorized } from './helpers/graphql';
import {
  createTestUser,
  deleteTestUser,
  refreshIdToken,
  type TestUser,
} from './helpers/test-user';

/**
 * チーム操作の検証（docs/design.md §2.3 / §2.5 / §2.6 / §10.2）
 *
 * joinTeam / leaveTeam / issueInviteCode は Cognito グループと DynamoDB を
 * またいで状態を書き換える。モックでは何も証明できないため、デプロイ済みの
 * バックエンドに対して実行する。
 *
 * 特に重要なのは「**できないこと**」の確認:
 *   - 期限切れの招待コードで参加できない（§2.3）
 *   - 離脱したチームのレシピが読めなくなる（§2.6）
 *   - 所属を自分で書き換えられない（§1.7）
 */

const ISSUE_INVITE_CODE = `
  mutation IssueInviteCode {
    issueInviteCode { inviteCode expiresAt }
  }`;

const JOIN_TEAM = `
  mutation JoinTeam($inviteCode: String!) {
    joinTeam(inviteCode: $inviteCode) { teamId teamName }
  }`;

const LEAVE_TEAM = `
  mutation LeaveTeam {
    leaveTeam { teamId }
  }`;

const CREATE_RECIPE = `
  mutation CreateRecipe($input: CreateRecipeInput!) {
    createRecipe(input: $input) { id teamId title }
  }`;

const LIST_RECIPES = `
  query ListRecipes {
    listRecipes { items { id teamId title } }
  }`;

const UPDATE_TEAM = `
  mutation UpdateTeam($input: UpdateTeamInput!) {
    updateTeam(input: $input) { teamId inviteCodeExpiresAt }
  }`;

const GET_PROFILE = `
  query GetUserProfile($userId: ID!) {
    getUserProfile(userId: $userId) { userId teamId displayName }
  }`;

const UPDATE_PROFILE = `
  mutation UpdateUserProfile($input: UpdateUserProfileInput!) {
    updateUserProfile(input: $input) { userId teamId displayName }
  }`;

type Recipe = { id: string; teamId: string; title: string };

const createRecipe = async (user: TestUser, title: string): Promise<Recipe> => {
  const result = await gql<{ createRecipe: Recipe }>(user.idToken, CREATE_RECIPE, {
    input: { teamId: user.teamId, title, servings: 2 },
  });
  if (!result.data?.createRecipe) {
    throw new Error(`レシピを作成できませんでした: ${JSON.stringify(result.errors)}`);
  }
  return result.data.createRecipe;
};

const issueInviteCode = async (user: TestUser): Promise<string> => {
  const result = await gql<{ issueInviteCode: { inviteCode: string } }>(
    user.idToken,
    ISSUE_INVITE_CODE,
  );
  if (!result.data?.issueInviteCode) {
    throw new Error(`招待コードを発行できませんでした: ${JSON.stringify(result.errors)}`);
  }
  return result.data.issueInviteCode.inviteCode;
};

const listRecipeTitles = async (user: TestUser): Promise<string[]> => {
  const result = await gql<{ listRecipes: { items: Recipe[] } }>(
    user.idToken,
    LIST_RECIPES,
  );
  return (result.data?.listRecipes.items ?? []).map((r) => r.title);
};

describe('招待コードによるチーム参加', () => {
  let alice: TestUser;
  let bob: TestUser;
  let bobPersonalTeamId: string;

  beforeAll(async () => {
    alice = await createTestUser();
    bob = await createTestUser();
    bobPersonalTeamId = bob.teamId;

    await createRecipe(alice, 'アリスの肉じゃが');
    await createRecipe(bob, 'ボブのカレー');
  });

  afterAll(async () => {
    await Promise.all([
      deleteTeamRecords({ teamId: alice.teamId, userId: alice.sub }),
      deleteTeamRecords({ teamId: bobPersonalTeamId, userId: bob.sub }),
    ]);
    await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
  });

  it('発行した招待コードは紛らわしい文字を含まない8桁である（§2.3）', async () => {
    const code = await issueInviteCode(alice);
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(code).not.toMatch(/[0O1IL]/);
  });

  it('無効なコードでは参加できない', async () => {
    const result = await gql(bob.idToken, JOIN_TEAM, { inviteCode: 'ZZZZ-9999' });

    expect(result.errors?.[0]?.message).toContain('招待コードが正しくありません');
  });

  it('期限切れのコードでは参加できない（TTL に頼らない判定 / §2.3）', async () => {
    const code = await issueInviteCode(alice);

    // メンバーは自分のチームを update できるため、有効期限だけ過去に倒せる。
    // DynamoDB の TTL は削除が最大48時間遅れるので判定には使えず、
    // Lambda 側の比較が効いていることをここで確かめる
    const expired = await gql(alice.idToken, UPDATE_TEAM, {
      input: {
        teamId: alice.teamId,
        inviteCodeExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    expect(expired.errors).toBeUndefined();

    const result = await gql(bob.idToken, JOIN_TEAM, { inviteCode: code });
    expect(result.errors?.[0]?.message).toContain('有効期限');
  });

  it('有効なコードで参加でき、1人チームのレシピは移送される（§2.5）', async () => {
    const code = await issueInviteCode(alice);

    const result = await gql<{ joinTeam: { teamId: string; teamName: string } }>(
      bob.idToken,
      JOIN_TEAM,
      { inviteCode: code },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.joinTeam.teamId).toBe(alice.teamId);

    // グループの変更は発行済みトークンに載らない。取り直すまで読めない
    bob = await refreshIdToken(bob, alice.teamId);

    const titles = await listRecipeTitles(bob);
    expect(titles).toContain('アリスの肉じゃが');
    // 参加前に自分で作ったレシピが失われていない
    expect(titles).toContain('ボブのカレー');

    // アリス側から見ても、持ち込まれたレシピが同じチームにある
    expect(await listRecipeTitles(alice)).toContain('ボブのカレー');

    const profile = await gql<{ getUserProfile: { teamId: string } }>(
      bob.idToken,
      GET_PROFILE,
      { userId: bob.sub },
    );
    expect(profile.data?.getUserProfile.teamId).toBe(alice.teamId);
  });

  it('同じチームには二重に参加できない', async () => {
    const code = await issueInviteCode(alice);

    const result = await gql(bob.idToken, JOIN_TEAM, { inviteCode: code });
    expect(result.errors?.[0]?.message).toContain('既にこのチームに参加しています');
  });

  it('参加後、元の個人チームのレコードは残らない', async () => {
    // 1人チームは畳まれる。放置すると誰にも読めないチームが増え続ける
    const result = await gql<{ getTeam: { teamId: string } | null }>(
      bob.idToken,
      `query GetTeam($teamId: ID!) { getTeam(teamId: $teamId) { teamId } }`,
      { teamId: bobPersonalTeamId },
    );
    expect(result.data?.getTeam).toBeNull();
  });
});

describe('チームからの離脱', () => {
  let owner: TestUser;
  let member: TestUser;
  let memberPersonalTeamId: string;
  let sharedTeamId: string;
  let newTeamId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    member = await createTestUser();
    memberPersonalTeamId = member.teamId;
    sharedTeamId = owner.teamId;

    await createRecipe(owner, '家族の肉じゃが');

    const code = await issueInviteCode(owner);
    const joined = await gql(member.idToken, JOIN_TEAM, { inviteCode: code });
    if (joined.errors) {
      throw new Error(`参加に失敗しました: ${JSON.stringify(joined.errors)}`);
    }
    member = await refreshIdToken(member, sharedTeamId);
  });

  afterAll(async () => {
    await Promise.all([
      deleteTeamRecords({ teamId: sharedTeamId, userId: owner.sub }),
      deleteTeamRecords({ teamId: memberPersonalTeamId, userId: member.sub }),
    ]);
    await Promise.all([
      deleteTestUser(owner),
      deleteTestUser({ ...member, teamId: newTeamId ?? member.teamId }),
    ]);
  });

  it('離脱するとレシピを持ち出さず、読めなくなる（§2.6）', async () => {
    const result = await gql<{ leaveTeam: { teamId: string } }>(
      member.idToken,
      LEAVE_TEAM,
    );

    expect(result.errors).toBeUndefined();
    newTeamId = result.data?.leaveTeam.teamId as string;
    expect(newTeamId).not.toBe(sharedTeamId);

    member = await refreshIdToken(member, newTeamId);

    // 離脱者の手元にレシピは残らない
    expect(await listRecipeTitles(member)).toEqual([]);
    // チーム側には残っている
    expect(await listRecipeTitles(owner)).toContain('家族の肉じゃが');
  });
});

describe('所属チームの偽装', () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    alice = await createTestUser();
    bob = await createTestUser();
  });

  afterAll(async () => {
    await Promise.all([
      deleteTeamRecords({ teamId: alice.teamId, userId: alice.sub }),
      deleteTeamRecords({ teamId: bob.teamId, userId: bob.sub }),
    ]);
    await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
  });

  it('自分の UserProfile.teamId を書き換えられない（§1.7）', async () => {
    // 書き換えられると、レシピは読めないままでも他チームのメンバー一覧に
    // 自分が現れる。所属の変更は joinTeam / leaveTeam の責務
    const result = await gql<{ updateUserProfile: { teamId: string } | null }>(
      alice.idToken,
      UPDATE_PROFILE,
      { input: { userId: alice.sub, teamId: bob.teamId } },
    );

    expect(isUnauthorized(result)).toBe(true);

    const check = await gql<{ getUserProfile: { teamId: string } }>(
      alice.idToken,
      GET_PROFILE,
      { userId: alice.sub },
    );
    expect(check.data?.getUserProfile.teamId).toBe(alice.teamId);
  });

  it('表示名は自分で変更できる', async () => {
    // teamId を締めた副作用で、他のフィールドまで書けなくなっていないこと
    const result = await gql<{ updateUserProfile: { displayName: string } }>(
      alice.idToken,
      UPDATE_PROFILE,
      { input: { userId: alice.sub, displayName: 'パパ' } },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateUserProfile.displayName).toBe('パパ');
  });
});
