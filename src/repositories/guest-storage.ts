import type { Label, Recipe } from '@/lib/recipes/types';

/**
 * ゲストデータの保存先（docs/design.md §5.2）
 *
 * localStorage の読み書きをここに集約する。LocalStorageRepository（通常の
 * CRUD）と引き継ぎ処理（§5.3）の両方がこの領域を触るため、キーと形式の
 * 定義が2箇所に散らないようにする。
 *
 * 保存する形はサーバーの Recipe / Label と同じ。形を揃えておくことで、
 * 引き継ぎが単純なループで済む。
 */

const RECIPES_KEY = 'recipe-base:recipes';
const LABELS_KEY = 'recipe-base:labels';

/**
 * localStorage 上のレシピ。
 *
 * migrated は引き継ぎ済みフラグ（§5.4）。3件中2件を送った時点で通信が
 * 切れることは普通に起こるため、送れたものから印を付け、再試行では
 * 印の無いものだけを送る。これが無いと再試行のたびに二重登録される。
 */
export type StoredRecipe = Recipe & { migrated?: boolean };

/**
 * localStorage 上のラベル。
 *
 * ⚠️ レシピと違い boolean ではなく**サーバー側の ID** を持たせる（設計書
 * §5.2 からの意図的な差分）。レシピの labelIds はローカル ID からサーバー
 * ID へ付け替える必要があり（§5.3）、その対応表は再試行をまたいで残らないと
 * 意味が無い。「引き継ぎ済みか」と「引き継ぎ先の ID」を1つの値で表す。
 */
export type StoredLabel = Label & { migratedId?: string };

const read = <T>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    // 壊れた値が入っていても、空として扱い操作を継続させる
    return [];
  }
};

const write = <T>(key: string, value: T[]): void => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const readRecipes = (): StoredRecipe[] => read<StoredRecipe>(RECIPES_KEY);
export const writeRecipes = (recipes: StoredRecipe[]): void =>
  write(RECIPES_KEY, recipes);

export const readLabels = (): StoredLabel[] => read<StoredLabel>(LABELS_KEY);
export const writeLabels = (labels: StoredLabel[]): void => write(LABELS_KEY, labels);

/**
 * 引き継ぎ処理が使う操作（docs/design.md §5.3）
 *
 * インターフェースとして切り出しているのは、引き継ぎのロジックを
 * localStorage 無しでテストできるようにするため。順序や冪等性の検証が
 * このステップの主目的であり（§10.1）、保存先の実体は本質ではない。
 */
export interface GuestStore {
  readRecipes(): StoredRecipe[];
  readLabels(): StoredLabel[];
  /** レシピを引き継ぎ済みにする */
  markRecipeMigrated(id: string): void;
  /** ラベルを引き継ぎ済みにし、引き継ぎ先のサーバー ID を控える */
  markLabelMigrated(localId: string, serverId: string): void;
  /** ゲストデータを完全に消す。全件成功した後にだけ呼ぶ（§5.4） */
  clear(): void;
}

export const localStorageGuestStore: GuestStore = {
  readRecipes,
  readLabels,

  markRecipeMigrated(id) {
    writeRecipes(
      readRecipes().map((recipe) =>
        recipe.id === id ? { ...recipe, migrated: true } : recipe,
      ),
    );
  },

  markLabelMigrated(localId, serverId) {
    writeLabels(
      readLabels().map((label) =>
        label.id === localId ? { ...label, migratedId: serverId } : label,
      ),
    );
  },

  clear() {
    localStorage.removeItem(RECIPES_KEY);
    localStorage.removeItem(LABELS_KEY);
  },
};

/** 引き継ぐものがあるか。無ければ確認モーダルも出さない（§5.5） */
export const hasGuestData = (): boolean =>
  readRecipes().length > 0 || readLabels().length > 0;
