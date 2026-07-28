import type { MigrationSummary } from './migrate-guest-data';

/**
 * 引き継ぎ結果の通知（docs/design.md §5.5）
 *
 * 取り込みが終わるのは認証画面だが、知らせるのは遷移先のレシピ一覧になる。
 * 両者は別のページなので、結果を一度どこかに置く必要がある。
 *
 * sessionStorage を使うのは、これがタブを閉じるまでの一時的な値であり、
 * URL に載せる情報でもないため。クエリに `?imported=3` を付けると、
 * 再読み込みや共有のたびにトーストが蘇る。
 *
 * React の外にある状態なので、エフェクトで同期せず外部ストアとして購読する
 * （テーマと同じ扱い / src/lib/theme.ts）。
 */

const KEY = 'recipe-base:import-notice';

/** undefined は「まだ読んでいない」。null は「通知が無い」 */
let cache: MigrationSummary | null | undefined;

const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

const readStored = (): MigrationSummary | null => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as MigrationSummary).recipes === 'number' &&
      typeof (parsed as MigrationSummary).labels === 'number'
    ) {
      return parsed as MigrationSummary;
    }
    return null;
  } catch {
    return null;
  }
};

export const setImportNotice = (summary: MigrationSummary): void => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(summary));
  } catch {
    // 保存できなくても、同一タブ内の遷移ならキャッシュ経由で伝わる
  }
  cache = summary;
  notify();
};

/**
 * 保存された通知を消す。
 *
 * 表示できた時点で呼ぶ。残しておくと、遷移先を再読み込みするたびに
 * 「取り込みました」が蘇る。
 */
export const clearStoredImportNotice = (): void => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 消せなくても表示は一度きりに保たれる（cache 側で判断するため）
  }
};

export const dismissImportNotice = (): void => {
  clearStoredImportNotice();
  cache = null;
  notify();
};

export const subscribeImportNotice = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

/**
 * クライアント側のスナップショット。
 *
 * 参照の安定した値を返す必要があるため、読み取り結果をキャッシュする
 * （毎回オブジェクトを作ると useSyncExternalStore が無限に再描画する）。
 */
export const getImportNoticeSnapshot = (): MigrationSummary | null => {
  if (cache === undefined) cache = readStored();
  return cache;
};

/** サーバー側のスナップショット。sessionStorage を読めないため常に通知無し */
export const getServerImportNoticeSnapshot = (): MigrationSummary | null => null;
