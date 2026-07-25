import type { Recipe } from './types';

/**
 * レシピの絞り込み（docs/design.md §1.5 / §6.5）
 *
 * 検索はサーバーではなくクライアントで行う。DynamoDB は部分一致検索を
 * 効率的に実行できず（contains は全件読んでから捨てる動作でインデックスが
 * 効かない）、日本語の表記ゆれも吸収できないため。
 *
 * チームのレシピ全件がメモリ上にある前提なので、ここは純粋関数でよい。
 */

/**
 * 比較用に文字列を正規化する。
 *
 * - NFKC で全角英数を半角に、半角カナを全角カナに揃える
 * - カタカナをひらがなに寄せる（「タマネギ」と「たまねぎ」を同一視）
 * - 大文字小文字を無視する
 *
 * ⚠️ 漢字とかなの揺れ（「玉ねぎ」と「たまねぎ」）は吸収できない。
 * 形態素解析辞書が必要になるため v1 の対象外（§6.5）。
 */
export const normalizeForSearch = (value: string): string =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0x60),
    )
    .trim();

const includesNormalized = (haystack: string, needle: string): boolean =>
  normalizeForSearch(haystack).includes(normalizeForSearch(needle));

export type RecipeFilter = {
  /** 料理名の部分一致 */
  title?: string;
  /** 材料名の部分一致。どれか1つの材料に含まれていれば一致とみなす */
  ingredient?: string;
  /** 選択したラベル。複数選択時は AND（すべて持つレシピだけが残る） */
  labelIds?: string[];
};

/**
 * 条件でレシピを絞り込む。
 *
 * 複数条件は AND（料理名 AND 材料 AND ラベル）。
 * ラベルを複数選んだ場合も AND で、「主菜」＋「野菜」なら両方を持つ
 * レシピだけが残る。絞り込み UI としてはこちらが直感的（§6.5）。
 *
 * 空の条件は指定なしとして扱い、絞り込みに影響させない。
 */
export const filterRecipes = (
  recipes: Recipe[],
  filter: RecipeFilter,
): Recipe[] => {
  const title = filter.title?.trim();
  const ingredient = filter.ingredient?.trim();
  const labelIds = filter.labelIds ?? [];

  return recipes.filter((recipe) => {
    if (title && !includesNormalized(recipe.title, title)) {
      return false;
    }
    if (
      ingredient &&
      !recipe.ingredients.some((i) => includesNormalized(i.name, ingredient))
    ) {
      return false;
    }
    if (labelIds.length > 0 && !labelIds.every((id) => recipe.labelIds.includes(id))) {
      return false;
    }
    return true;
  });
};

/**
 * 一覧の既定の並び順（§6.6）
 *
 * 更新日時の新しい順。直近で触ったレシピが最も探されるため。
 * 全件がクライアント上にあるのでここで並べ替える。
 */
export const sortByUpdatedAtDesc = (recipes: Recipe[]): Recipe[] =>
  [...recipes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
