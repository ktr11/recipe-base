import { Suspense } from 'react';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';

/**
 * パスワードリセット画面（docs/design.md §3.1 / §8）
 *
 * Suspense で包むのは useSearchParams（?email= の読み取り）のため。
 * このフックはプリレンダリング時に、最も近い Suspense 境界までを
 * クライアント側描画へ倒す。境界を置かないとページ全体がその扱いになる。
 */
export default function ResetPasswordPage() {
  return (
    <main className="mx-auto w-full max-w-md p-6">
      <h1 className="text-2xl font-bold">パスワードの再設定</h1>
      <div className="divider" />
      <Suspense
        fallback={<span className="loading loading-spinner" aria-label="読み込み中" />}
      >
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
