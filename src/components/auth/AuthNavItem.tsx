'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'aws-amplify/auth';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';

/**
 * ナビゲーションの認証導線
 *
 * 認証状態はサーバーでは分からない（トークンの取得が非同期のため）ので、
 * 解決が済むまで何も描画しない。ここで「サインイン」を仮に出すと、
 * 認証済みの人の画面でサインアウトへ一瞬入れ替わって見える。
 *
 * useAuth は Hub を購読しており、サインイン/サインアウトが別のページで
 * 起きても追従する。共通ナビはページ遷移で再マウントされないため、
 * この購読が無いと状態が固まったままになる。
 */
export default function AuthNavItem() {
  const router = useRouter();
  const { guest, loading } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (loading) return null;

  if (guest) {
    return (
      <Link href="/auth/sign-in" className="btn btn-ghost btn-sm">
        サインイン
      </Link>
    );
  }

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      // 認証必須のページ（/team）に居たまま残らないよう、先頭へ戻す
      router.push('/');
      // サーバーコンポーネント側も未認証として描画し直す
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  // /team への導線は、その画面ができるステップ10 で足す
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={handleSignOut}
      disabled={signingOut}
    >
      サインアウト
    </button>
  );
}
