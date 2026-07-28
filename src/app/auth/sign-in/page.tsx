import { Suspense } from 'react';
import SignInForm from '@/components/auth/SignInForm';

/**
 * サインイン画面（docs/design.md §3.1）
 *
 * Suspense で包むのは useSearchParams（?redirect= の読み取り）のため。
 * このフックはプリレンダリング時に、最も近い Suspense 境界までを
 * クライアント側描画へ倒す。境界を置かないとページ全体がその扱いになる。
 */
export default function SignInPage() {
  return (
    <main className="mx-auto w-full max-w-md p-6">
      <h1 className="text-2xl font-bold">サインイン</h1>
      <div className="divider" />
      <Suspense
        fallback={<span className="loading loading-spinner" aria-label="読み込み中" />}
      >
        <SignInForm />
      </Suspense>
    </main>
  );
}
