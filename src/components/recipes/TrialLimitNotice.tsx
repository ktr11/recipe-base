import Link from 'next/link';

/**
 * 上限に達したことを伝え、登録へ誘導する（docs/design.md §4.3）
 *
 * 上限は入力を始める前に伝える。フォームを全部埋めさせてから保存ボタンで
 * 弾くのは最悪の体験になるため、作成ボタンの位置にこれを出す。
 */
export default function TrialLimitNotice({
  message,
}: {
  message: string;
}) {
  return (
    <div role="alert" className="alert alert-info">
      <div>
        <p className="font-semibold">{message}</p>
        <p className="text-sm">無料登録すると、件数の制限なく利用できます。</p>
      </div>
      <Link href="/auth/sign-up" className="btn btn-sm btn-primary">
        無料登録
      </Link>
    </div>
  );
}
