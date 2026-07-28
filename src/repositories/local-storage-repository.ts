import { TRIAL_LIMITS, TrialLimitError } from '@/lib/recipes/limits';
import type { Label, Recipe, RecipeInput } from '@/lib/recipes/types';
import {
  readLabels,
  readRecipes,
  writeLabels,
  writeRecipes,
} from './guest-storage';
import type { RecipeRepository } from './recipe-repository';

/**
 * ゲスト用の実装（docs/design.md §5.1）
 *
 * ゲストのデータは AWS に一切保存しない。Amplify Data の allow.guest() は
 * 所有者単位の分離ができず、有効にすると全ゲストが互いのデータを閲覧・
 * 編集・削除できる公開テーブルになるため。
 *
 * ⚠️ トライアル制限の強制はこのクラスが唯一の関門（§4.2）。
 * 判定をコンポーネントやフックだけに置くと、新しい作成経路を足した人が
 * チェックを書き忘れるのが典型的な壊れ方になる。ここを通れば必ず検査される。
 *
 * localStorage の内容が改竄されても被害はその端末の利用者自身に閉じるため、
 * サーバー側での強制は不要。
 *
 * 保存先の読み書きは guest-storage に集約してある。引き継ぎ処理（§5.3）も
 * 同じ領域を触るため、キーと形式の定義を1箇所に留める。
 */

const newId = (): string => crypto.randomUUID();

export class LocalStorageRepository implements RecipeRepository {
  async listRecipes(): Promise<Recipe[]> {
    return readRecipes();
  }

  async getRecipe(id: string): Promise<Recipe | null> {
    return readRecipes().find((r) => r.id === id) ?? null;
  }

  async createRecipe(input: RecipeInput): Promise<Recipe> {
    const recipes = readRecipes();

    if (recipes.length >= TRIAL_LIMITS.recipes) {
      throw new TrialLimitError('recipes', TRIAL_LIMITS.recipes);
    }
    assertIngredientLimit(input, 0);

    const recipe: Recipe = {
      ...input,
      id: newId(),
      updatedAt: new Date().toISOString(),
    };
    writeRecipes([...recipes, recipe]);
    return recipe;
  }

  async updateRecipe(id: string, input: RecipeInput): Promise<Recipe> {
    const recipes = readRecipes();
    const index = recipes.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`レシピが見つかりません: ${id}`);
    }

    // 既に上限を超えている既存レシピの編集は許可する（§4.1）。
    // 保存時に材料が増えていなければ通す
    assertIngredientLimit(input, recipes[index].ingredients.length);

    const updated: Recipe = {
      ...input,
      id,
      updatedAt: new Date().toISOString(),
    };
    recipes[index] = updated;
    writeRecipes(recipes);
    return updated;
  }

  async deleteRecipe(id: string): Promise<void> {
    const recipes = readRecipes();
    writeRecipes(recipes.filter((r) => r.id !== id));
  }

  async listLabels(): Promise<Label[]> {
    return readLabels();
  }

  async createLabel(name: string): Promise<Label> {
    const labels = readLabels();

    if (labels.length >= TRIAL_LIMITS.labels) {
      throw new TrialLimitError('labels', TRIAL_LIMITS.labels);
    }

    const label: Label = { id: newId(), name };
    writeLabels([...labels, label]);
    return label;
  }

  async deleteLabel(id: string): Promise<void> {
    const labels = readLabels();
    writeLabels(labels.filter((l) => l.id !== id));

    // 参照している全レシピから ID を取り除く（§1.6）。
    // レシピ自体は削除しない
    const recipes = readRecipes();
    const cleaned = recipes.map((recipe) =>
      recipe.labelIds.includes(id)
        ? { ...recipe, labelIds: recipe.labelIds.filter((l) => l !== id) }
        : recipe,
    );
    writeRecipes(cleaned);
  }
}

/**
 * 材料の個数を検査する。
 *
 * previousCount より増えていなければ、上限を超えていても通す。
 * 既に10個ある既存レシピを編集できなくなるのを避けるため（§4.1）。
 */
const assertIngredientLimit = (input: RecipeInput, previousCount: number): void => {
  const count = input.ingredients.length;
  if (count <= TRIAL_LIMITS.ingredientsPerRecipe) return;
  if (count <= previousCount) return;
  throw new TrialLimitError(
    'ingredientsPerRecipe',
    TRIAL_LIMITS.ingredientsPerRecipe,
  );
};
