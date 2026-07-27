'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirmResetPassword, resetPassword } from 'aws-amplify/auth';
import { useState } from 'react';
import { authErrorMessage } from '@/lib/auth/errors';
import { PASSWORD_RULE, validatePassword } from '@/lib/auth/password';

/**
 * パスワードリセット（docs/design.md §3.1 / §8）
 *
 *   request … メールアドレスを入力し、確認コードを送る
 *   confirm … 届いたコードと新しいパスワードを入力する
 *
 * 変更するのは Cognito のパスワードのみ。UserProfile には触れない。
 */
export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const SENT_NOTICE =
    'メールアドレスに確認コードを送りました。届かない場合は、そのアドレスが登録されていない可能性があります';

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { nextStep } = await resetPassword({ username: email });

      if (nextStep.resetPasswordStep === 'CONFIRM_RESET_PASSWORD_WITH_CODE') {
        setStep('confirm');
        setNotice(SENT_NOTICE);
        setSubmitting(false);
        return;
      }

      // accountRecovery を EMAIL_ONLY にしているため DONE は返らない
      setError('この操作には対応していません');
      setSubmitting(false);
    } catch (caught) {
      console.error(caught);

      // ⚠️ 未登録のアドレスでも、そうと分かる表示をしない。ここで
      // 「登録されていません」と出すと、総当たりでアカウントの存在を
      // 調べられる（errors.ts でサインインのエラーをまとめているのと同じ理由）。
      // コード入力の段階まで進めた上で、届かない可能性だけを案内する
      if (caught instanceof Error && caught.name === 'UserNotFoundException') {
        setStep('confirm');
        setNotice(SENT_NOTICE);
        setSubmitting(false);
        return;
      }

      setError(authErrorMessage(caught, '確認コードを送信できませんでした'));
      setSubmitting(false);
    }
  };

  const handleConfirm = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const invalid = validatePassword(password);
    if (invalid) {
      setError(invalid);
      return;
    }

    setNotice(null);
    setSubmitting(true);
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword: password,
      });

      // 自動ではサインインしない。confirmResetPassword はセッションを返さず、
      // ここでサインインするには新しいパスワードで signIn を呼び直すことになる。
      // 変更が効いたことを本人が確かめられる方が分かりやすい
      router.push(`/auth/sign-in?email=${encodeURIComponent(email)}`);
    } catch (caught) {
      console.error(caught);
      setError(authErrorMessage(caught, 'パスワードを変更できませんでした'));
      setSubmitting(false);
    }
  };

  const alerts = (
    <>
      {error && (
        <div role="alert" className="alert alert-error">
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="alert" className="alert alert-info">
          <span>{notice}</span>
        </div>
      )}
    </>
  );

  if (step === 'confirm') {
    return (
      <form onSubmit={handleConfirm} className="flex flex-col gap-6">
        {alerts}

        <fieldset className="fieldset">
          <legend className="fieldset-legend">確認コード</legend>
          <input
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            className="input w-full"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </fieldset>

        <fieldset className="fieldset">
          <legend className="fieldset-legend">新しいパスワード</legend>
          <input
            type="password"
            required
            autoComplete="new-password"
            className="input w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="label">{PASSWORD_RULE}</p>
        </fieldset>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting && <span className="loading loading-spinner loading-sm" />}
          パスワードを変更する
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleRequest} className="flex flex-col gap-6">
      {alerts}

      <p className="text-sm text-base-content/70">
        登録したメールアドレスに確認コードを送ります。
      </p>

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

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting && <span className="loading loading-spinner loading-sm" />}
        確認コードを送る
      </button>

      <p className="text-center text-sm">
        <Link href="/auth/sign-in" className="link">
          サインインに戻る
        </Link>
      </p>
    </form>
  );
}
