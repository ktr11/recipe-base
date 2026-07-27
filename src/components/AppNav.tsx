import Link from 'next/link';
import AuthNavItem from '@/components/auth/AuthNavItem';

/**
 * 共通ナビゲーション
 *
 * 認証状態に依存するのは AuthNavItem だけで、こちらはサーバーコンポーネント
 * のまま置く。ナビ全体をクライアント側に倒す必要はない。
 */
export default function AppNav() {
  return (
    <header className="navbar bg-base-200">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4">
        <Link href="/" className="btn btn-ghost text-lg">
          レシピ共有
        </Link>
        <nav className="flex flex-1 justify-end gap-1">
          <Link href="/recipes" className="btn btn-ghost btn-sm">
            レシピ
          </Link>
          <Link href="/labels" className="btn btn-ghost btn-sm">
            ラベル
          </Link>
          <Link href="/settings" className="btn btn-ghost btn-sm">
            設定
          </Link>
          <AuthNavItem />
        </nav>
      </div>
    </header>
  );
}
