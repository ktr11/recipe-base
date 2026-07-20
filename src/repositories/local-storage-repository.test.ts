import { beforeEach, describe, expect, it } from 'vitest';
import { TRIAL_LIMITS, isTrialLimitError } from '@/lib/recipes/limits';
import { LocalStorageRepository } from './local-storage-repository';
import {
  describeRecipeRepositoryContract,
  recipeInput,
} from '../../tests/unit/support/recipe-repository-contract';

describeRecipeRepositoryContract('LocalStorageRepository', () => {
  localStorage.clear();
  return new LocalStorageRepository();
});

/**
 * トライアル制限（docs/design.md §4）
 *
 * 契約テストとは分けている。制限はゲスト固有の振る舞いで、
 * 正規ユーザー向けの AmplifyRepository には上限が無いため。
 */
/**
 * 上限の「値」を固定するテスト。
 *
 * 以降のテストは TRIAL_LIMITS を参照してループするため、定数を書き換えると
 * 期待値も一緒に動いてしまい、値の誤りを検出できない（実際に 3→99 に
 * 変えても全て通ることを確認した）。仕様として決まっている値はここで留める。
 */
describe('トライアル制限の値', () => {
  it('設計書 §4.1 の通りである', () => {
    expect(TRIAL_LIMITS).toEqual({
      recipes: 3,
      labels: 3,
      ingredientsPerRecipe: 10,
    });
  });
});

describe('LocalStorageRepository のトライアル制限', () => {
  let repo: LocalStorageRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new LocalStorageRepository();
  });

  const manyIngredients = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      name: `材料${i + 1}`,
      quantity: 1,
      unit: '個',
    }));

  describe('レシピ', () => {
    it(`${TRIAL_LIMITS.recipes}件までは作成できる`, async () => {
      for (let i = 0; i < TRIAL_LIMITS.recipes; i++) {
        await repo.createRecipe(recipeInput({ title: `レシピ${i}` }));
      }

      expect(await repo.listRecipes()).toHaveLength(TRIAL_LIMITS.recipes);
    });

    it('上限を超える作成は TrialLimitError で拒否される', async () => {
      for (let i = 0; i < TRIAL_LIMITS.recipes; i++) {
        await repo.createRecipe(recipeInput());
      }

      const error = await repo.createRecipe(recipeInput()).catch((e: unknown) => e);

      expect(isTrialLimitError(error)).toBe(true);
      expect(isTrialLimitError(error) && error.kind).toBe('recipes');
    });

    it('拒否されたときレシピは増えていない', async () => {
      for (let i = 0; i < TRIAL_LIMITS.recipes; i++) {
        await repo.createRecipe(recipeInput());
      }

      await repo.createRecipe(recipeInput()).catch(() => undefined);

      expect(await repo.listRecipes()).toHaveLength(TRIAL_LIMITS.recipes);
    });

    it('1件削除すれば再び作成できる（累計ではなく同時保有数）', async () => {
      const created = [];
      for (let i = 0; i < TRIAL_LIMITS.recipes; i++) {
        created.push(await repo.createRecipe(recipeInput()));
      }

      await repo.deleteRecipe(created[0].id);
      await expect(repo.createRecipe(recipeInput())).resolves.toBeTruthy();
    });
  });

  describe('ラベル', () => {
    it(`${TRIAL_LIMITS.labels}件までは作成できる`, async () => {
      for (let i = 0; i < TRIAL_LIMITS.labels; i++) {
        await repo.createLabel(`ラベル${i}`);
      }

      expect(await repo.listLabels()).toHaveLength(TRIAL_LIMITS.labels);
    });

    it('上限を超える作成は TrialLimitError で拒否される', async () => {
      for (let i = 0; i < TRIAL_LIMITS.labels; i++) {
        await repo.createLabel(`ラベル${i}`);
      }

      const error = await repo.createLabel('超過').catch((e: unknown) => e);

      expect(isTrialLimitError(error) && error.kind).toBe('labels');
    });

    it('1件削除すれば再び作成できる', async () => {
      const labels = [];
      for (let i = 0; i < TRIAL_LIMITS.labels; i++) {
        labels.push(await repo.createLabel(`ラベル${i}`));
      }

      await repo.deleteLabel(labels[0].id);
      await expect(repo.createLabel('新しいラベル')).resolves.toBeTruthy();
    });
  });

  describe('材料', () => {
    const max = TRIAL_LIMITS.ingredientsPerRecipe;

    it(`${max}個までは作成できる`, async () => {
      await expect(
        repo.createRecipe(recipeInput({ ingredients: manyIngredients(max) })),
      ).resolves.toBeTruthy();
    });

    it('上限を超える作成は TrialLimitError で拒否される', async () => {
      const error = await repo
        .createRecipe(recipeInput({ ingredients: manyIngredients(max + 1) }))
        .catch((e: unknown) => e);

      expect(isTrialLimitError(error) && error.kind).toBe('ingredientsPerRecipe');
    });

    it('上限ちょうどのレシピを、材料を増やさずに編集できる', async () => {
      const created = await repo.createRecipe(
        recipeInput({ ingredients: manyIngredients(max) }),
      );

      await expect(
        repo.updateRecipe(
          created.id,
          recipeInput({ title: '改題', ingredients: manyIngredients(max) }),
        ),
      ).resolves.toBeTruthy();
    });

    it('編集で材料を増やそうとすると拒否される', async () => {
      const created = await repo.createRecipe(
        recipeInput({ ingredients: manyIngredients(max) }),
      );

      const error = await repo
        .updateRecipe(created.id, recipeInput({ ingredients: manyIngredients(max + 1) }))
        .catch((e: unknown) => e);

      expect(isTrialLimitError(error) && error.kind).toBe('ingredientsPerRecipe');
    });

    it('既に上限を超えているレシピでも、減らす方向の編集は通る', async () => {
      // 引き継ぎ等で上限超過のデータが入り得る。編集不能にしない（§4.1）
      localStorage.setItem(
        'recipe-base:recipes',
        JSON.stringify([
          {
            id: 'over',
            title: '超過レシピ',
            url: null,
            servings: 2,
            ingredients: manyIngredients(max + 5),
            labelIds: [],
            memo: null,
            updatedAt: new Date().toISOString(),
          },
        ]),
      );

      await expect(
        repo.updateRecipe(
          'over',
          recipeInput({ ingredients: manyIngredients(max + 3) }),
        ),
      ).resolves.toBeTruthy();
    });
  });
});
