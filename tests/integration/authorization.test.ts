import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteTeamRecords } from './helpers/cleanup';
import { gql, isUnauthorized } from './helpers/graphql';
import {
  createTestUser,
  deleteTestUser,
  moveUserToTeam,
  type TestUser,
} from './helpers/test-user';

const CREATE_RECIPE = `
  mutation CreateRecipe($input: CreateRecipeInput!) {
    createRecipe(input: $input) { id teamId title }
  }`;

const GET_RECIPE = `
  query GetRecipe($id: ID!) {
    getRecipe(id: $id) { id teamId title }
  }`;

const LIST_RECIPES = `
  query ListRecipes {
    listRecipes { items { id teamId title } }
  }`;

const UPDATE_RECIPE = `
  mutation UpdateRecipe($input: UpdateRecipeInput!) {
    updateRecipe(input: $input) { id title }
  }`;

const DELETE_RECIPE = `
  mutation DeleteRecipe($input: DeleteRecipeInput!) {
    deleteRecipe(input: $input) { id }
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

/**
 * 認可ルールの検証（docs/design.md §10.2）
 *
 * 本プロジェクトで最も価値が高いテスト。groupDefinedIn が誤っていた場合の
 * 帰結は「他人の家族のレシピが見える」であり、影響が最も重い。
 * そしてこれはモックでは何も証明できず、実際にデプロイされた AppSync に
 * 対してリクエストを投げるしかない。
 *
 * 主眼は「できないこと」の確認にある。通常のテストは「できること」を
 * 確かめるが、認可テストは失敗することを確かめる。
 */
describe('チームをまたいだアクセスが拒否されること', () => {
  let alice: TestUser;
  let bob: TestUser;
  let bobRecipe: Recipe;

  beforeAll(async () => {
    alice = await createTestUser();
    bob = await createTestUser();
    bobRecipe = await createRecipe(bob, 'ボブの肉じゃが');
  });

  afterAll(async () => {
    await gql(bob.idToken, DELETE_RECIPE, { input: { id: bobRecipe.id } });
    await Promise.all([
      deleteTeamRecords({ teamId: alice.teamId, userId: alice.sub }),
      deleteTeamRecords({ teamId: bob.teamId, userId: bob.sub }),
    ]);
    await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
  });

  it('前提: 2人は別々のチームに属している', () => {
    expect(alice.teamId).not.toBe(bob.teamId);
  });

  it('一覧に他チームのレシピが含まれない', async () => {
    const result = await gql<{ listRecipes: { items: Recipe[] } }>(
      alice.idToken,
      LIST_RECIPES,
    );

    const ids = (result.data?.listRecipes.items ?? []).map((r) => r.id);
    expect(ids).not.toContain(bobRecipe.id);
  });

  it('ID を直接指定しても他チームのレシピを取得できない', async () => {
    // 一覧に出ないことと、取得できないことは別の保証である。
    // ID さえ分かれば読めてしまう実装になっていないかを確認する。
    const result = await gql<{ getRecipe: Recipe | null }>(alice.idToken, GET_RECIPE, {
      id: bobRecipe.id,
    });

    expect(result.data?.getRecipe).toBeNull();
  });

  it('他チームのレシピを更新できない', async () => {
    const result = await gql<{ updateRecipe: Recipe | null }>(
      alice.idToken,
      UPDATE_RECIPE,
      { input: { id: bobRecipe.id, title: '乗っ取られたレシピ' } },
    );

    expect(isUnauthorized(result)).toBe(true);

    // 実際に書き換わっていないことを、持ち主の目で確認する
    const check = await gql<{ getRecipe: Recipe | null }>(bob.idToken, GET_RECIPE, {
      id: bobRecipe.id,
    });
    expect(check.data?.getRecipe?.title).toBe('ボブの肉じゃが');
  });

  it('他チームのレシピを削除できない', async () => {
    const result = await gql<{ deleteRecipe: Recipe | null }>(
      alice.idToken,
      DELETE_RECIPE,
      { input: { id: bobRecipe.id } },
    );

    expect(isUnauthorized(result)).toBe(true);

    const check = await gql<{ getRecipe: Recipe | null }>(bob.idToken, GET_RECIPE, {
      id: bobRecipe.id,
    });
    expect(check.data?.getRecipe).not.toBeNull();
  });

  it('他チームの Team レコードを読めない（招待コードを列挙できない）', async () => {
    // 招待コードが読めると、誰でも任意のチームに参加できてしまう
    const direct = await gql<{ getTeam: { teamId: string } | null }>(
      alice.idToken,
      `query GetTeam($teamId: ID!) { getTeam(teamId: $teamId) { teamId inviteCode } }`,
      { teamId: bob.teamId },
    );
    expect(direct.data?.getTeam).toBeNull();

    const listed = await gql<{ listTeams: { items: { teamId: string }[] } }>(
      alice.idToken,
      `query ListTeams { listTeams { items { teamId inviteCode } } }`,
    );
    const teamIds = (listed.data?.listTeams.items ?? []).map((t) => t.teamId);
    expect(teamIds).not.toContain(bob.teamId);
  });

  it('他チームのレシピを、自分のチームの teamId を偽装して作成できない', async () => {
    // teamId さえ書き換えれば他チームに書き込める、という穴が無いことの確認
    const result = await gql<{ createRecipe: Recipe | null }>(
      alice.idToken,
      CREATE_RECIPE,
      { input: { teamId: bob.teamId, title: '侵入レシピ', servings: 2 } },
    );

    expect(isUnauthorized(result)).toBe(true);

    // エラーが返ったことだけでは不十分。ボブ側から見て、実際に
    // レシピが増えていないことまで確認する。
    const bobsRecipes = await gql<{ listRecipes: { items: Recipe[] } }>(
      bob.idToken,
      LIST_RECIPES,
    );
    const titles = (bobsRecipes.data?.listRecipes.items ?? []).map((r) => r.title);
    expect(titles).not.toContain('侵入レシピ');
  });
});

describe('同じチームのメンバー同士は編集できること', () => {
  let owner: TestUser;
  let member: TestUser;
  let recipe: Recipe;

  beforeAll(async () => {
    owner = await createTestUser();
    const joiner = await createTestUser();
    // joinTeam はステップ10 で実装するため、Cognito グループの
    // 付け替えで「同じチームに2人いる」状態を作る
    member = await moveUserToTeam(joiner, owner.teamId);
    recipe = await createRecipe(owner, 'みんなのカレー');
  });

  afterAll(async () => {
    await gql(owner.idToken, DELETE_RECIPE, { input: { id: recipe.id } });
    await Promise.all([
      deleteTeamRecords({ teamId: owner.teamId, userId: owner.sub }),
      deleteTeamRecords({ teamId: owner.teamId, userId: member.sub }),
    ]);
    await Promise.all([deleteTestUser(owner), deleteTestUser(member)]);
  });

  it('前提: 2人は同じチームに属している', () => {
    expect(member.teamId).toBe(owner.teamId);
  });

  it('他のメンバーが作ったレシピを取得できる', async () => {
    const result = await gql<{ getRecipe: Recipe | null }>(member.idToken, GET_RECIPE, {
      id: recipe.id,
    });

    expect(result.data?.getRecipe?.id).toBe(recipe.id);
  });

  it('他のメンバーが作ったレシピを編集できる', async () => {
    const result = await gql<{ updateRecipe: Recipe | null }>(
      member.idToken,
      UPDATE_RECIPE,
      { input: { id: recipe.id, title: '改良版カレー' } },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateRecipe?.title).toBe('改良版カレー');
  });
});
