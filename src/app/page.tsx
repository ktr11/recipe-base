import LandingActions from '@/components/auth/LandingActions';

/**
 * ランディング（docs/design.md §3.1）
 *
 * 導線は認証状態で変わるため LandingActions（クライアント）に切り出す。
 * 説明文はゲスト向けのままで良い。認証済みの人がここを見ることは稀で、
 * 見たとしても導線が正しければ迷わない。
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
      <LandingActions />
    </main>
  );
}
