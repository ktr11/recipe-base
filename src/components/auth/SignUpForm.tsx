'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  autoSignIn,
  confirmSignUp,
  fetchAuthSession,
  resendSignUpCode,
  signUp,
} from 'aws-amplify/auth';
import { useCallback, useState } from 'react';
import GuestImportDialog from '@/components/auth/GuestImportDialog';
import { useGuestImport } from '@/hooks/use-guest-import';
import { ensureAccountReady } from '@/lib/auth/account';
import { authErrorMessage } from '@/lib/auth/errors';
import { PASSWORD_RULE, validatePassword } from '@/lib/auth/password';
import { DEFAULT_REDIRECT } from '@/lib/auth/redirect';

/**
 * 新規登録（docs/design.md §3.1 / §8 / §2.4）
 *
 * 1画面を2段階で使う。メール確認コードの入力は登録と不可分で、別ルートに
 * 分けても「登録の途中」であることに変わりがないため。
 *
 *   input   … メールアドレスとパスワードの入力
 *   confirm … 届いた確認コードの入力
 *
 * ?email= 付きで開かれた場合は confirm から始める。サインイン画面が
 * UserNotConfirmedException（登録したが確認を終えていない）を検知して
 * ここへ送ってくる経路がある。この場合パスワードは手元に無いため、
 * 確認後は自動サインインできずサインイン画面へ送る（下の handleConfirm）。
 */
export default function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pendingEmail = searchParams.get('email');

  const [step, setStep] = useState<'input' | 'confirm'>(
    pendingEmail ? 'confirm' : 'input',
  );
  const [email, setEmail] = useState(pendingEmail ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const goToRecipes = useCallback(() => {
    router.push(DEFAULT_REDIRECT);
    router.refresh();
  }, [router]);

  const guestImport = useGuestImport(goToRecipes);

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    // 送信してから InvalidPasswordException で弾かれるより、手前で気付ける方が良い。
    // 強制するのは User Pool 側であって、ここは案内（§8）
    const invalid = validatePassword(password);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSubmitting(true);
    try {
      const { nextStep } = await signUp({
        username: email,
        password,
        options: {
          userAttributes: { email },
          // 確認コードの入力を終えたらそのままサインインさせる。ここで false に
          // すると、確認直後にもう一度パスワードを入力させることになる
          autoSignIn: true,
        },
      });

      if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        setStep('confirm');
        setNotice(`${email} に確認コードを送りました`);
        setSubmitting(false);
        return;
      }

      // メール確認を必須にしている限り DONE は返らない（§8）
      setError('登録の状態を判別できませんでした。サインインをお試しください');
      setSubmitting(false);
    } catch (caught) {
      console.error(caught);
      setError(authErrorMessage(caught, '登録に失敗しました'));
      setSubmitting(false);
    }
  };

  const handleConfirm = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      const { nextStep } = await confirmSignUp({
        username: email,
        confirmationCode: code,
      });

      // この画面で signUp を実行していない場合（?email= で直接来た場合）は
      // 自動サインインの流れが始まっていないため DONE が返る。
      // パスワードも手元に無いので、サインイン画面へ送る
      if (nextStep.signUpStep !== 'COMPLETE_AUTO_SIGN_IN') {
        router.push(`/auth/sign-in?email=${encodeURIComponent(email)}`);
        return;
      }

      await autoSignIn();

      // ⚠️ 必須（§2.4）。post-confirmation が作った Cognito グループは、
      // この時点のトークンに載っているとは限らない。取り直すまで
      // レシピの読み書きが Unauthorized になる
      await fetchAuthSession({ forceRefresh: true });

      // post-confirmation が失敗していた場合の復旧（§2.7）
      await ensureAccountReady();

      // ゲストで作成したデータは確認せずに取り込む（§5.5）。登録直後は
      // 連続性への期待が最も高く、ダイアログは邪魔にしかならない。
      // 引き継ぐものが無ければ、そのまま遷移する
      await guestImport.begin('auto');
    } catch (caught) {
      console.error(caught);
      setError(authErrorMessage(caught, '確認に失敗しました'));
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setNotice(null);
    try {
      await resendSignUpCode({ username: email });
      setNotice(`${email} に確認コードを送り直しました`);
    } catch (caught) {
      console.error(caught);
      setError(authErrorMessage(caught, '確認コードを再送できませんでした'));
    }
  };

  const alerts = (
    <>
      <GuestImportDialog
        phase={guestImport.phase}
        counts={guestImport.counts}
        onImport={guestImport.run}
        onDiscard={guestImport.discard}
        onLater={guestImport.skip}
      />

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

        <p className="text-sm text-base-content/70">
          メールに届いた確認コードを入力してください。
        </p>

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

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting && <span className="loading loading-spinner loading-sm" />}
          登録を完了する
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={handleResend}
          disabled={submitting}
        >
          確認コードを再送する
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSignUp} className="flex flex-col gap-6">
      {alerts}

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
          autoComplete="new-password"
          className="input w-full"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="label">{PASSWORD_RULE}</p>
      </fieldset>

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting && <span className="loading loading-spinner loading-sm" />}
        確認コードを送る
      </button>

      <p className="text-center text-sm">
        アカウントをお持ちの場合は{' '}
        <Link href="/auth/sign-in" className="link">
          サインイン
        </Link>
      </p>
    </form>
  );
}
