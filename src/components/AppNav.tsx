import Link from 'next/link';

/**
 * 共通ナビゲーション
 *
 * 認証関連の導線（サインイン / 表示名など）は、認証画面が用意できる
 * ステップ以降で追加する。
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
        </nav>
      </div>
    </header>
  );
}
