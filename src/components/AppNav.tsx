import Link from 'next/link';
import { BookOpen, Tags } from 'lucide-react';
import AccountMenu from '@/components/auth/AccountMenu';

/**
 * 共通ナビゲーション（docs/design.md §6.8）
 *
 * 認証状態に依存するのは AccountMenu だけで、こちらはサーバーコンポーネント
 * のまま置く。ナビ全体をクライアント側に倒す必要はない。lucide のアイコンは
 * hooks を使わないため、ここに直接インポートしても境界は動かない。
 */
export default function AppNav() {
  return (
    <header className="navbar bg-base-200">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-2 sm:px-4">
        {/*
          nav を縮ませない。flex-1（basis 0）のままだと、幅が足りない時に
          nav が縮み、justify-end の中身が左へはみ出してブランド名の上に
          重なる。縮むのはブランド名側に寄せ、溢れたら truncate させる。

          shrink を明示するのは daisyUI の .btn が flex-shrink: 0 を
          持っているため。付けないとブランド名が縮まず、代わりに
          ページ全体へ横スクロールが出る
        */}
        <Link
          href="/"
          className="btn btn-ghost min-w-0 shrink px-2 text-base sm:px-4 sm:text-lg"
        >
          {/*
            truncate は span 側に置く。.btn は inline-flex で中身が中央寄せ
            のため、ボタン自体に掛けるとテキストが左右どちらにも溢れて
            両端が切れ、省略記号も出ない
          */}
          <span className="truncate">Recipe Base</span>
        </Link>
        <nav className="ml-auto flex shrink-0 gap-1">
          <Link href="/recipes" className="btn btn-ghost btn-sm px-2 sm:px-3">
            <BookOpen className="size-4" aria-hidden="true" />
            レシピ
          </Link>
          <Link href="/labels" className="btn btn-ghost btn-sm px-2 sm:px-3">
            <Tags className="size-4" aria-hidden="true" />
            ラベル
          </Link>
          <AccountMenu />
        </nav>
      </div>
    </header>
  );
}
