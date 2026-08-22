'use client';

import { useEffect, useState } from 'react';
import DisplayNameForm from '@/components/settings/DisplayNameForm';
import PasswordForm from '@/components/settings/PasswordForm';
import { useAuth } from '@/hooks/use-auth';
import { fetchMyProfile } from '@/lib/user/profile';

/**
 * 設定画面のアカウント項目（docs/design.md §3.1 / §8）
 *
 * ゲストには何も出さない。テーマ設定だけを開放しているのは、あれが
 * localStorage で完全に動作するため。表示名もパスワードも、ゲストには
 * 対応する実体が無い（AWS 上にデータを持たない / §5.1）。
 *
 * 表示名の初期値だけ取得が要るので、この層でまとめて読む。
 * 各フォームを個別に読ませると、同じクエリが2本になる。
 */
export default function AccountSettings() {
  const { guest, loading } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loading || guest) return;

    // アンマウント後に状態を更新しないためのガード
    let active = true;

    fetchMyProfile()
      .then((profile) => {
        if (active) setDisplayName(profile.displayName);
      })
      .catch((caught: unknown) => {
        console.error(caught);
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [guest, loading]);

  // 認証状態が確定するまでは何も出さない。ゲストに一瞬アカウント項目が
  // 見えるより、少し遅れて現れる方がよい
  if (loading || guest) return null;

  if (failed) {
    return (
      <section className="mt-8">
        <div role="alert" className="alert alert-error">
          <span>アカウント情報を読み込めませんでした。再読み込みしてください</span>
        </div>
      </section>
    );
  }

  if (displayName === null) {
    return (
      <section className="mt-8">
        <span className="loading loading-spinner" />
      </section>
    );
  }

  return (
    <>
      <div className="divider" />
      <section>
        <h2 className="text-lg font-bold">アカウント</h2>
        <div className="mt-4">
          <DisplayNameForm initialName={displayName} />
        </div>
      </section>

      <div className="divider" />
      <section>
        <h2 className="text-lg font-bold">パスワードの変更</h2>
        <div className="mt-4">
          <PasswordForm />
        </div>
      </section>
    </>
  );
}
