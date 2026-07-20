import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gql } from './helpers/graphql';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';

/**
 * サインアップ時の個人チーム生成（docs/design.md §2.4）
 *
 * 「全ユーザーは常に1つのチームに属する」という設計の前提が、実際に
 * 成立していることを確認する。ここが崩れると、以降のすべての認可が
 * 成立しなくなる。
 */
describe('サインアップ時の個人チーム生成', () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
  });

  afterAll(async () => {
    await deleteTestUser(user);
  });

  it('ID トークンに個人チームの Cognito グループが1つだけ含まれる', () => {
    // createTestUser 内で検証済みだが、前提として明示しておく
    expect(user.teamId).toBeTruthy();
  });

  it('Team レコードが生成されている', async () => {
    const result = await gql<{ getTeam: { teamId: string; name: string; memberCount: number } | null }>(
      user.idToken,
      `query GetTeam($teamId: ID!) {
        getTeam(teamId: $teamId) { teamId name memberCount }
      }`,
      { teamId: user.teamId },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.getTeam).toMatchObject({
      teamId: user.teamId,
      memberCount: 1,
    });
  });

  it('UserProfile が生成され、所属チームが一致している', async () => {
    const result = await gql<{ getUserProfile: { userId: string; teamId: string; displayName: string } | null }>(
      user.idToken,
      `query GetUserProfile($userId: ID!) {
        getUserProfile(userId: $userId) { userId teamId displayName }
      }`,
      { userId: user.sub },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.getUserProfile).toMatchObject({
      userId: user.sub,
      teamId: user.teamId,
    });
  });
});
