'use client';

/**
 * 離脱の確認（docs/design.md §2.6）
 *
 * **この確認は設計上の必須要件。** 離脱者はレシピを一切持ち出さない仕様
 * なので、これが無いと「誤操作で自分のレシピを失った」という事故が起きる。
 * 文言をぼかさず、レシピがどうなるかをそのまま書く。
 */
export default function LeaveTeamDialog({
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="modal modal-open" role="dialog">
      <div className="modal-box">
        <h3 className="text-lg font-bold">チームから抜けますか？</h3>
        <p className="py-4">
          <strong>レシピはチームに残り、あなたの手元には残りません。</strong>
          <br />
          抜けた後は、新しくあなた1人のチームから始まります。
        </p>
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            やめる
          </button>
          <button
            type="button"
            className="btn btn-error"
            disabled={busy}
            onClick={onConfirm}
          >
            抜ける
          </button>
        </div>
      </div>
    </div>
  );
}
