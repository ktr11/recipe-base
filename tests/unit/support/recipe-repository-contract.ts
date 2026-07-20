import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/lib/recipes/types';
import type { RecipeRepository } from '@/repositories/recipe-repository';

/**
 * RecipeRepository の契約テスト（docs/design.md §10.1）
 *
 * LocalStorageRepository（ステップ6）と AmplifyRepository（ステップ8）は
 * 同じインターフェースを実装し、**同じ振る舞いをしなければならない**。
 * ここに書いたテストは両実装にそのまま適用する。
 *
 * ステップ8 を書き終えてからテストを足すと、この構造は自然には出てこない。
 * 「動いているコードに後からテストを書く」作業になり、実装がテストしやすい
 * 形に寄る力が働かなくなる。
 *
 * ⚠️ トライアル制限は LocalStorageRepository 固有の振る舞いなので、
 * この契約には含めない（正規ユーザーには上限が無いため）。
 */
export const recipeInput = (overrides: Partial<RecipeInput> = {}): RecipeInput => ({
  title: 'テストレシピ',
  url: null,
  servings: 2,
  ingredients: [],
  labelIds: [],
  memo: null,
  ...overrides,
});

export const describeRecipeRepositoryContract = (
  name: string,
  createRepository: () => Promise<RecipeRepository> | RecipeRepository,
): void => {
  describe(`${name} は RecipeRepository の契約を満たす`, () => {
    let repo: RecipeRepository;

    beforeEach(async () => {
      repo = await createRepository();
    });

    describe('レシピ', () => {
      it('作成したレシピを一覧で取得できる', async () => {
        await repo.createRecipe(recipeInput({ title: '肉じゃが' }));

        const recipes = await repo.listRecipes();
        expect(recipes).toHaveLength(1);
        expect(recipes[0].title).toBe('肉じゃが');
      });

      it('作成したレシピには id と updatedAt が付与される', async () => {
        const created = await repo.createRecipe(recipeInput());

        expect(created.id).toBeTruthy();
        expect(Number.isNaN(Date.parse(created.updatedAt))).toBe(false);
      });

      it('id を指定して個別に取得できる', async () => {
        const created = await repo.createRecipe(recipeInput({ title: 'カレー' }));

        const found = await repo.getRecipe(created.id);
        expect(found?.title).toBe('カレー');
      });

      it('存在しない id では null を返す', async () => {
        expect(await repo.getRecipe('missing-id')).toBeNull();
      });

      it('材料の並び順が保たれる', async () => {
        // 材料は並び順に意味があるため、埋め込みで保持している（§1.4）
        const created = await repo.createRecipe(
          recipeInput({
            ingredients: [
              { name: '玉ねぎ', quantity: 1, unit: '個' },
              { name: '塩', quantity: null, unit: '適量' },
              { name: '牛肉', quantity: 200, unit: 'g' },
            ],
          }),
        );

        const found = await repo.getRecipe(created.id);
        expect(found?.ingredients.map((i) => i.name)).toEqual([
          '玉ねぎ',
          '塩',
          '牛肉',
        ]);
      });

      it('数量が無い材料（適量など）を保存できる', async () => {
        const created = await repo.createRecipe(
          recipeInput({
            ingredients: [{ name: '塩', quantity: null, unit: '適量' }],
          }),
        );

        const found = await repo.getRecipe(created.id);
        expect(found?.ingredients[0]).toMatchObject({
          quantity: null,
          unit: '適量',
        });
      });

      it('更新した内容が反映される', async () => {
        const created = await repo.createRecipe(recipeInput({ title: '旧タイトル' }));

        await repo.updateRecipe(created.id, recipeInput({ title: '新タイトル' }));

        const found = await repo.getRecipe(created.id);
        expect(found?.title).toBe('新タイトル');
      });

      it('更新しても id は変わらない', async () => {
        const created = await repo.createRecipe(recipeInput());

        const updated = await repo.updateRecipe(created.id, recipeInput({ title: '別名' }));

        expect(updated.id).toBe(created.id);
      });

      it('削除したレシピは取得できない', async () => {
        const created = await repo.createRecipe(recipeInput());

        await repo.deleteRecipe(created.id);

        expect(await repo.getRecipe(created.id)).toBeNull();
        expect(await repo.listRecipes()).toHaveLength(0);
      });

      it('削除しても他のレシピは残る', async () => {
        const kept = await repo.createRecipe(recipeInput({ title: '残る' }));
        const removed = await repo.createRecipe(recipeInput({ title: '消える' }));

        await repo.deleteRecipe(removed.id);

        const recipes = await repo.listRecipes();
        expect(recipes.map((r) => r.id)).toEqual([kept.id]);
      });
    });

    describe('ラベル', () => {
      it('作成したラベルを一覧で取得できる', async () => {
        await repo.createLabel('主菜');

        const labels = await repo.listLabels();
        expect(labels.map((l) => l.name)).toEqual(['主菜']);
      });

      it('削除したラベルは一覧から消える', async () => {
        const label = await repo.createLabel('主菜');

        await repo.deleteLabel(label.id);

        expect(await repo.listLabels()).toHaveLength(0);
      });

      it('ラベルを削除すると、参照していたレシピから ID が取り除かれる', async () => {
        // 参照整合性は DB では担保されないため、実装の責務として検証する（§1.6）
        const label = await repo.createLabel('主菜');
        const other = await repo.createLabel('野菜');
        const created = await repo.createRecipe(
          recipeInput({ labelIds: [label.id, other.id] }),
        );

        await repo.deleteLabel(label.id);

        const found = await repo.getRecipe(created.id);
        expect(found?.labelIds).toEqual([other.id]);
      });

      it('ラベルを削除してもレシピ自体は残る', async () => {
        const label = await repo.createLabel('主菜');
        await repo.createRecipe(recipeInput({ labelIds: [label.id] }));

        await repo.deleteLabel(label.id);

        expect(await repo.listRecipes()).toHaveLength(1);
      });
    });
  });
};
