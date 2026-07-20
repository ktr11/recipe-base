/**
 * レシピの型（docs/design.md §1.3 / §6.3 / §6.4）
 *
 * ゲスト（localStorage）と正規ユーザー（DynamoDB）で同じ形を使う。
 * 形を揃えておくことで、本登録時の引き継ぎ処理が単純なループで済む（§5.2）。
 */

/**
 * 材料。
 *
 * quantity は null 可。「適量」「少々」のようにスケール不能な材料を
 * 表現するため。null の材料は x人前スケーリングの対象外として
 * そのまま表示する（§6.4）。
 */
export type Ingredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
};

export type Recipe = {
  id: string;
  title: string;
  url: string | null;
  /** 基準人前。x人前スケーリングの分母になる */
  servings: number;
  ingredients: Ingredient[];
  /**
   * ラベルへの参照。外部キー制約は無い（§1.4）。
   * 存在しない ID が残り得るため、表示側で無視する必要がある（§1.6）
   */
  labelIds: string[];
  memo: string | null;
  /** 一覧の既定の並び順に使う（§6.6） */
  updatedAt: string;
};

export type Label = {
  id: string;
  name: string;
};

/** 作成・更新時の入力。id と updatedAt は保存側が決める */
export type RecipeInput = Omit<Recipe, 'id' | 'updatedAt'>;

export const emptyRecipeInput = (): RecipeInput => ({
  title: '',
  url: null,
  servings: 2,
  ingredients: [],
  labelIds: [],
  memo: null,
});
