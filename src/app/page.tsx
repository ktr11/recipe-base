import Link from 'next/link';

/**
 * ランディング（docs/design.md §3.1）
 *
 * サインイン / 新規登録の導線は、認証画面が用意できるステップ以降で追加する。
 * 現時点ではゲストとして使い始める導線のみを置く。
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-bold">レシピ共有</h1>
      <p className="text-base-content/70">
        レシピを保存し、家族で共有するためのアプリです。
        <br />
        登録しなくても、この端末の中だけで試せます。
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/recipes" className="btn btn-primary">
          ゲストとして利用する
        </Link>
        <Link href="/settings" className="btn btn-ghost">
          設定
        </Link>
      </div>
    </main>
  );
}
