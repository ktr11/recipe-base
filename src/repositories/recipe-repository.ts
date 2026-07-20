import type { Label, Recipe, RecipeInput } from '@/lib/recipes/types';

/**
 * レシピとラベルの永続化の契約（docs/design.md §3.3）
 *
 * ゲスト（localStorage）と正規ユーザー（DynamoDB）で同じ画面を使うため、
 * 画面コンポーネントは「データがどこに保存されるか」を一切知らない。
 * 実装を差し替えるのはこの層だけ。
 *
 * localStorage 側は同期的に処理できるが、**すべて Promise を返す**。
 * 契約が実装の都合で分かれてしまうと、呼び出し側が実装を意識することに
 * なり、差し替え可能である意味が無くなるため。
 */
export interface RecipeRepository {
  listRecipes(): Promise<Recipe[]>;
  getRecipe(id: string): Promise<Recipe | null>;
  createRecipe(input: RecipeInput): Promise<Recipe>;
  updateRecipe(id: string, input: RecipeInput): Promise<Recipe>;
  deleteRecipe(id: string): Promise<void>;

  listLabels(): Promise<Label[]>;
  createLabel(name: string): Promise<Label>;
  /**
   * ラベルを削除し、そのラベルを参照している全レシピから ID を取り除く。
   *
   * 参照整合性は DB では担保されない（§1.4）ため、この後始末は実装の
   * 責務として契約に含める。レシピ自体は削除しない。
   */
  deleteLabel(id: string): Promise<void>;
}
