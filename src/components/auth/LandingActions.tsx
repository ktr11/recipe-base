'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

/**
 * ランディングの導線（docs/design.md §3.1）
 *
 * 認証済みの人に「ゲストとして利用する」を見せない。遷移先の /recipes は
 * どちらでも同じで、表示されるデータだけが変わる（§3.3）ため、間違って
 * いるのは動作ではなく文言の方。認証状態が定まるまでは描画しない。
 */
export default function LandingActions() {
  const { guest, loading } = useAuth();

  if (loading) {
    return <span className="loading loading-spinner" aria-label="読み込み中" />;
  }

  // /team への導線は、その画面ができるステップ10 で足す
  if (!guest) {
    return (
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/recipes" className="btn btn-primary">
          レシピを見る
        </Link>
        <Link href="/settings" className="btn btn-ghost">
          設定
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Link href="/recipes" className="btn btn-primary">
        ゲストとして利用する
      </Link>
      <Link href="/auth/sign-up" className="btn btn-outline">
        新規登録
      </Link>
      <Link href="/auth/sign-in" className="btn btn-ghost">
        サインイン
      </Link>
    </div>
  );
}
