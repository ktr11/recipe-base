'use client';

import { updatePassword } from 'aws-amplify/auth';
import { useState } from 'react';
import { authErrorMessage } from '@/lib/auth/errors';
import { PASSWORD_RULE, validatePassword } from '@/lib/auth/password';

/**
 * パスワードの変更（docs/design.md §8）
 *
 * Cognito の `updatePassword` は認証済みのセッションに対して働くので、
 * ここで扱うのは現在のパスワードと新しいパスワードだけ。
 * 忘れた場合の再設定は /auth/reset-password（メール経由）の担当で、
 * こちらとは別の経路になる。
 */
export default function PasswordForm() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const invalid = newPassword.length > 0 && validatePassword(newPassword) !== null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setDone(false);

    const ruleViolation = validatePassword(newPassword);
    if (ruleViolation) {
      setError(ruleViolation);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await updatePassword({ oldPassword, newPassword });
      setOldPassword('');
      setNewPassword('');
      setDone(true);
    } catch (caught) {
      console.error(caught);
      setError(passwordErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && (
        <div role="alert" className="alert alert-error">
          <span>{error}</span>
        </div>
      )}
      {done && (
        <div role="status" className="alert alert-success">
          <span>パスワードを変更しました</span>
        </div>
      )}

      <fieldset className="fieldset">
        <legend className="fieldset-legend">現在のパスワード</legend>
        <input
          type="password"
          required
          autoComplete="current-password"
          className="input w-full"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
        />
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset-legend">新しいパスワード</legend>
        <input
          type="password"
          required
          autoComplete="new-password"
          aria-invalid={invalid}
          className="input w-full"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <p className="label">{PASSWORD_RULE}</p>
      </fieldset>

      <button
        type="submit"
        className="btn btn-primary self-start"
        disabled={submitting || oldPassword.length === 0 || newPassword.length === 0}
      >
        {submitting && <span className="loading loading-spinner loading-sm" />}
        変更する
      </button>
    </form>
  );
}

/**
 * 例外を利用者向けの文言にする。
 *
 * ⚠️ `NotAuthorizedException` だけ共通の対応表を上書きする。共通側は
 * 「メールアドレスまたはパスワードが違います」に丸めてあるが、あれは
 * **未認証の相手にアカウントの存在を教えないため**の措置（errors.ts 参照）。
 * この画面の利用者は既にサインインしており、隠す相手がいない。
 * 「現在のパスワードが違う」と明示した方が親切で、伏せる理由もない。
 */
const passwordErrorMessage = (error: unknown): string => {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name: unknown }).name)
      : '';

  if (name === 'NotAuthorizedException') return '現在のパスワードが違います';
  if (name === 'LimitExceededException') {
    return '試行回数の上限に達しました。しばらく待ってからお試しください';
  }

  return authErrorMessage(error, 'パスワードを変更できませんでした');
};
