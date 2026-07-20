import type { Ingredient } from './types';

/**
 * x人前スケーリング（docs/design.md §6.4）
 *
 * レシピ詳細で人数を変えたときの材料表示を計算する。
 * 選んだ人数は保存しない（画面のローカル状態のみ）。保存すると
 * 「基準が何人前だったか」が曖昧になるため。
 */

export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 12;

/**
 * 数量の表示形式。
 *
 * 小数第1位で四捨五入し、末尾の 0 は落とす（1.5個 / 2個 / 0.7g）。
 *
 * ⚠️ 分数変換（大さじ1/2 など）は v1 では実装しない。単位ごとの丸め規則が
 * 必要になり複雑さが跳ね上がるため、割り切れない数量の解釈は
 * 料理する人間の判断に委ねる。
 */
export const formatQuantity = (quantity: number): string =>
  String(Math.round(quantity * 10) / 10);

/**
 * 材料を指定倍率でスケールする。
 *
 * quantity が null の材料（「適量」「少々」など）はスケール対象外。
 * 「適量 × 1.5倍」は意味を成さないため、そのまま返す。
 */
export const scaleIngredient = (
  ingredient: Ingredient,
  factor: number,
): Ingredient =>
  ingredient.quantity === null
    ? ingredient
    : { ...ingredient, quantity: Math.round(ingredient.quantity * factor * 10) / 10 };

/**
 * 基準人前から目標人前への倍率を求める。
 *
 * 基準が 0 以下のデータが紛れ込んだ場合は 1 倍として扱い、
 * 0 除算で NaN や Infinity を表示に出さない。
 */
export const servingsFactor = (baseServings: number, targetServings: number): number =>
  baseServings > 0 ? targetServings / baseServings : 1;

/** レシピの材料一覧を、目標人前に合わせて変換する */
export const scaleIngredients = (
  ingredients: Ingredient[],
  baseServings: number,
  targetServings: number,
): Ingredient[] => {
  const factor = servingsFactor(baseServings, targetServings);
  return ingredients.map((ingredient) => scaleIngredient(ingredient, factor));
};

/** 材料1件の表示文字列（「玉ねぎ 1.5個」など） */
export const formatIngredient = (ingredient: Ingredient): string => {
  const amount = [
    ingredient.quantity === null ? null : formatQuantity(ingredient.quantity),
    ingredient.unit,
  ]
    .filter(Boolean)
    .join('');
  return amount ? `${ingredient.name} ${amount}` : ingredient.name;
};

export const clampServings = (servings: number): number =>
  Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(servings)));
