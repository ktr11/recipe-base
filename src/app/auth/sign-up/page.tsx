import { Suspense } from 'react';
import SignUpForm from '@/components/auth/SignUpForm';

/**
 * 新規登録画面（docs/design.md §3.1）
 *
 * Suspense で包むのは useSearchParams（?email= の読み取り）のため。
 * このフックはプリレンダリング時に、最も近い Suspense 境界までを
 * クライアント側描画へ倒す。境界を置かないとページ全体がその扱いになる。
 */
export default function SignUpPage() {
  return (
    <main className="mx-auto w-full max-w-md p-6">
      <h1 className="text-2xl font-bold">新規登録</h1>
      <div className="divider" />
      <Suspense
        fallback={<span className="loading loading-spinner" aria-label="読み込み中" />}
      >
        <SignUpForm />
      </Suspense>
    </main>
  );
}
