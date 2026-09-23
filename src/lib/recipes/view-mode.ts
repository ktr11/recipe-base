/**
 * レシピ一覧の表示形式（Grid / List）（docs/design.md §7.1）
 *
 * 端末ごとの好みなので localStorage に保存し、UserProfile では同期しない。
 * localStorage は React の外にある状態なので、テーマ（lib/theme.ts）と同じく
 * useSyncExternalStore の外部ストアとして扱う。サーバーは localStorage を
 * 読めないため既定値（grid）で描画し、hydration 後にクライアントの値へ揃う。
 */

export type RecipeViewMode = 'grid' | 'list';

export const DEFAULT_VIEW_MODE: RecipeViewMode = 'grid';

const STORAGE_KEY = 'recipe-base:view-mode';

const isViewMode = (value: unknown): value is RecipeViewMode =>
  value === 'grid' || value === 'list';

const listeners = new Set<() => void>();

/** 表示形式を保存する */
export const applyViewMode = (mode: RecipeViewMode): void => {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // 保存できなくても、その場の表示は成立させる
  }
  // storage イベントは同一タブでは発火しないため、自前で通知する
  for (const listener of listeners) listener();
};

export const subscribeViewMode = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
};

export const getViewModeSnapshot = (): RecipeViewMode => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isViewMode(stored) ? stored : DEFAULT_VIEW_MODE;
  } catch {
    return DEFAULT_VIEW_MODE;
  }
};

export const getServerViewModeSnapshot = (): RecipeViewMode => DEFAULT_VIEW_MODE;
