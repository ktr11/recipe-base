'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'aws-amplify/auth';
import { useState } from 'react';
import { ensureAccountReady } from '@/lib/auth/account';
import { authErrorMessage } from '@/lib/auth/errors';
import { safeRedirect } from '@/lib/auth/redirect';

/**
 * サインイン（docs/design.md §3.1 / §8）
 *
 * サインインは常にメールアドレス。Cognito の username は UUID が採番される
 * ため、利用者が意識する識別子はメールアドレスだけになる。
 */
export default function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeRedirect(searchParams.get('redirect'));

  // ?email= は新規登録の完了後に戻ってきた場合に入る。入力し直させない
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { nextStep } = await signIn({ username: email, password });

      switch (nextStep.signInStep) {
        case 'DONE':
          // チームが無いユーザーをここで救う（§2.7）。これを通さないと
          // 以降のレシピ操作が全て Unauthorized になる
          await ensureAccountReady();
          router.push(redirect);
          // サーバーコンポーネント側も認証済みとして描画し直す
          router.refresh();
          return;

        case 'CONFIRM_SIGN_UP':
          // 登録したがメール確認を終えていないユーザー。確認コードの画面へ送る
          router.push(`/auth/sign-up?email=${encodeURIComponent(email)}`);
          return;

        case 'RESET_PASSWORD':
          router.push('/auth/reset-password');
          return;

        default:
          // MFA などは有効にしていないため到達しない想定（§8）
          setError('この認証方法には対応していません');
          setSubmitting(false);
          return;
      }
    } catch (caught) {
      console.error(caught);
      setError(authErrorMessage(caught, 'サインインに失敗しました'));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <div role="alert" className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <fieldset className="fieldset">
        <legend className="fieldset-legend">メールアドレス</legend>
        <input
          type="email"
          required
          autoComplete="email"
          className="input w-full"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset-legend">パスワード</legend>
        <input
          type="password"
          required
          autoComplete="current-password"
          className="input w-full"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="label">
          <Link href="/auth/reset-password" className="link">
            パスワードを忘れた場合
          </Link>
        </p>
      </fieldset>

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting && <span className="loading loading-spinner loading-sm" />}
        サインイン
      </button>

      <p className="text-center text-sm">
        アカウントをお持ちでない場合は{' '}
        <Link href="/auth/sign-up" className="link">
          新規登録
        </Link>
      </p>
    </form>
  );
}
