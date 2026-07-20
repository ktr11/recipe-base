/**
 * カラーテーマ（docs/design.md §6.1 / §6.2）
 *
 * 描画上の真実は常に localStorage にある。サーバー（UserProfile.theme）への
 * 保存は別端末への同期用の控えであって、初回描画には間に合わない。
 * 理由は ThemeScript のコメントを参照。
 */

export const THEMES = [
  { id: 'light', label: 'ライト ブルー' },
  { id: 'cupcake', label: 'ライト イエロー' },
  { id: 'night', label: 'ダーク ブルーブラック' },
  { id: 'black', label: 'ダーク ブラック' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const THEME_STORAGE_KEY = 'recipe-base:theme';

const THEME_IDS: readonly string[] = THEMES.map((t) => t.id);

export const isThemeId = (value: unknown): value is ThemeId =>
  typeof value === 'string' && THEME_IDS.includes(value);

/** 保存済みのテーマを読む。未選択・不正値なら null */
export const readStoredTheme = (): ThemeId | null => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : null;
  } catch {
    // プライベートブラウジング等で localStorage が使えない場合
    return null;
  }
};

const listeners = new Set<() => void>();

/** テーマを適用し、保存する */
export const applyTheme = (theme: ThemeId): void => {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 保存できなくても、その場の表示は成立させる
  }
  // storage イベントは同一タブでは発火しないため、自前で通知する
  for (const listener of listeners) listener();
};

/**
 * テーマの変更を購読する（useSyncExternalStore 用）
 *
 * テーマは localStorage という React の外にある状態なので、エフェクト内で
 * setState して同期するのではなく、外部ストアとして購読する。
 * 別タブでの変更にも追従できる。
 */
export const subscribeTheme = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
};

/** クライアント側のスナップショット */
export const getThemeSnapshot = (): ThemeId | null => readStoredTheme();

/**
 * サーバー側のスナップショット
 *
 * サーバーは localStorage を読めないため、常に未選択として扱う。
 * 実際の見た目は ThemeScript が描画前に確定させている。
 */
export const getServerThemeSnapshot = (): ThemeId | null => null;
