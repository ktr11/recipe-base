'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  clearStoredImportNotice,
  dismissImportNotice,
  getImportNoticeSnapshot,
  getServerImportNoticeSnapshot,
  subscribeImportNotice,
} from '@/lib/migration/notice';

/**
 * 引き継ぎ完了の通知（docs/design.md §5.5）
 *
 * 取り込みは認証画面で終わるが、利用者が結果を見るのは遷移先。共通レイアウト
 * に置いて、どこへ着地しても一度だけ出るようにする。
 */
export default function GuestImportToast() {
  const summary = useSyncExternalStore(
    subscribeImportNotice,
    getImportNoticeSnapshot,
    getServerImportNoticeSnapshot,
  );

  useEffect(() => {
    // 表示できた時点で保存分は消す。残すと再読み込みのたびに蘇る
    if (summary) clearStoredImportNotice();
  }, [summary]);

  if (!summary || summary.recipes + summary.labels === 0) return null;

  return (
    <div className="toast toast-end z-50">
      <div role="status" className="alert alert-success">
        <span>
          ゲストで作成したレシピ{summary.recipes}件
          {summary.labels > 0 && `・ラベル${summary.labels}件`}を取り込みました
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          aria-label="閉じる"
          onClick={dismissImportNotice}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
