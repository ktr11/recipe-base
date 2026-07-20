import Link from 'next/link';

/**
 * ランディング（docs/design.md §3.1）
 *
 * 本来は「ゲストとして利用」「サインイン / 新規登録」の導線を置く画面。
 * 遷移先の画面がまだ無いため、現時点ではテーマ設定への導線のみを置く
 * 最小構成にしている。ステップ7以降で本来の内容にする。
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-bold">レシピ共有</h1>
      <p className="text-base-content/70">
        レシピを保存し、家族で共有するためのアプリです。
      </p>
      <Link href="/settings" className="btn btn-primary">
        設定を開く
      </Link>
    </main>
  );
}
