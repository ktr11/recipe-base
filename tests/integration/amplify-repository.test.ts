import { afterAll, beforeAll, describe } from 'vitest';
import { AmplifyRepository } from '@/repositories/amplify-repository';
import { describeRecipeRepositoryContract } from '../unit/support/recipe-repository-contract';
import { deleteTeamRecords } from './helpers/cleanup';
import {
  createTestUser,
  deleteTestUser,
  signInTestUser,
  signOutTestUser,
  type TestUser,
} from './helpers/test-user';

/**
 * AmplifyRepository の契約テスト（docs/design.md §10.1）
 *
 * LocalStorageRepository（ステップ6）と同じ RecipeRepository の契約を、
 * 正規ユーザー用の実装でも満たすことを確認する。契約テスト本体は
 * describeRecipeRepositoryContract に集約してあり、両実装で共有する。
 * これにより「両者は同じ振る舞いをする」を1つの真実として担保できる。
 *
 * ⚠️ これは統合テストであり、デプロイ済み sandbox が必要。契約の中身は
 * 純粋なロジックではなく、実際に AppSync / DynamoDB を往復して検証する。
 * トライアル制限は LocalStorageRepository 固有の振る舞いなので、この契約には
 * 含まれない（正規ユーザーには上限が無い、§4.2）。
 *
 * AmplifyRepository は generated client 経由で Amplify のプロセス内セッションを
 * 使うため、テストの間はサインインした状態を保つ。認可テスト（gql の直叩き）
 * とはそこが異なる。
 */
describe('AmplifyRepository（統合）', () => {
  let user: TestUser;

  const clearTeamData = async (repo: AmplifyRepository): Promise<void> => {
    for (const recipe of await repo.listRecipes()) {
      await repo.deleteRecipe(recipe.id);
    }
    for (const label of await repo.listLabels()) {
      await repo.deleteLabel(label.id);
    }
  };

  beforeAll(async () => {
    // createTestUser で個人チームが生成される。以降はそのユーザーとして
    // サインインしたまま、チームのデータに対して契約を検証する。
    user = await createTestUser();
    await signInTestUser(user);
  });

  afterAll(async () => {
    await clearTeamData(new AmplifyRepository());
    await signOutTestUser();
    await deleteTeamRecords({ teamId: user.teamId, userId: user.sub });
    await deleteTestUser(user);
  });

  describeRecipeRepositoryContract('AmplifyRepository', async () => {
    // 各テストを独立させるため、チームのレシピ・ラベルを空にしてから渡す。
    // 同一チームを使い回すので、前のテストの残りを持ち越さない。
    const repo = new AmplifyRepository();
    await clearTeamData(repo);
    return repo;
  });
});
