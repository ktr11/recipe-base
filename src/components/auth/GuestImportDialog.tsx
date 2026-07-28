'use client';

import type { GuestImportPhase } from '@/hooks/use-guest-import';

/**
 * 引き継ぎの確認・進行・失敗を伝えるダイアログ（docs/design.md §5.5 / §5.4）
 *
 * 状態は持たない。進行は useGuestImport が握り、ここは受け取った局面を
 * 描くだけにする。判断が2箇所に散ると、どちらを直せばよいか分からなくなる。
 *
 * window.alert を使わないのは §4.3 の方針。テーマが適用されず、
 * 「追加しない」のような選択肢も置けないため。
 */
export default function GuestImportDialog({
  phase,
  counts,
  onImport,
  onDiscard,
  onLater,
}: {
  phase: GuestImportPhase;
  counts: { recipes: number; labels: number };
  onImport: () => void;
  onDiscard: () => void;
  onLater: () => void;
}) {
  if (phase === 'idle') return null;

  return (
    <div className="modal modal-open" role="dialog">
      <div className="modal-box">
        {phase === 'error' ? (
          <>
            <h3 className="text-lg font-bold">取り込みに失敗しました</h3>
            <p className="py-4">
              ゲストで作成したデータはこの端末に残っています。もう一度お試しください。
            </p>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={onLater}>
                後で行う
              </button>
              <button type="button" className="btn btn-primary" onClick={onImport}>
                再試行
              </button>
            </div>
          </>
        ) : phase === 'running' ? (
          <>
            <h3 className="text-lg font-bold">取り込んでいます…</h3>
            <p className="flex items-center gap-3 py-4">
              <span className="loading loading-spinner" />
              ゲストで作成したデータをあなたのチームに追加しています。
            </p>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold">ゲストで作成したデータがあります</h3>
            <p className="py-4">
              レシピ{counts.recipes}件
              {counts.labels > 0 && `・ラベル${counts.labels}件`}
              を、あなたのチームに追加しますか？
            </p>
            <p className="text-sm opacity-70">
              追加しない場合、この端末に保存されたデータは削除されます。
            </p>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={onDiscard}>
                追加しない
              </button>
              <button type="button" className="btn btn-primary" onClick={onImport}>
                追加する
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
