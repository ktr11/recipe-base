'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'aws-amplify/auth';
import { useState } from 'react';
import { CircleUser, LogIn, LogOut, Settings, Users } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

/**
 * ナビゲーションのアカウントメニュー（docs/design.md §6.8）
 *
 * 設定・チーム・サインアウト（未認証ならサインイン）をここに畳む。
 * ヘッダーに常時並べると、スマホ幅ではナビが右端で切れるため。
 *
 * 認証状態はサーバーでは分からない（トークンの取得が非同期のため）。
 * ただし**引き金のボタンは状態に関わらず常に描画する**。ここを
 * loading 中に消すと、解決した瞬間にボタンが生えてナビ全体が横にずれる。
 * 状態に依存するのは閉じたメニューの中身だけなので、確定が遅れても
 * 見えているものは何も変わらない。
 *
 * useAuth は Hub を購読しており、サインイン/サインアウトが別のページで
 * 起きても追従する。共通ナビはページ遷移で再マウントされないため、
 * この購読が無いと状態が固まったままになる。
 */
export default function AccountMenu() {
  const router = useRouter();
  const { guest, loading } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  /**
   * daisyUI の dropdown は :focus-within で開く。項目を押しても
   * フォーカスがメニュー内に残る限り開いたままなので、明示的に外す。
   */
  const close = () => {
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      close();
      // 認証必須のページ（/team）に居たまま残らないよう、先頭へ戻す
      router.push('/');
      // サーバーコンポーネント側も未認証として描画し直す
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="dropdown dropdown-end">
      <button
        type="button"
        // tabIndex は daisyUI が開いている間の再クリックを拾うために要る
        // （`[tabindex]:first-child` に pointer-events: none を当てている）
        tabIndex={0}
        className="btn btn-ghost btn-sm px-2"
        aria-label="アカウント"
        aria-haspopup="menu"
      >
        <CircleUser className="size-5" aria-hidden="true" />
      </button>
      <ul className="menu dropdown-content menu-sm mt-1 w-40 rounded-box bg-base-100 p-2 shadow">
        <li>
          <Link href="/settings" onClick={close}>
            <Settings className="size-4" aria-hidden="true" />
            設定
          </Link>
        </li>
        {!loading &&
          (guest ? (
            <li>
              <Link href="/auth/sign-in" onClick={close}>
                <LogIn className="size-4" aria-hidden="true" />
                サインイン
              </Link>
            </li>
          ) : (
            <>
              <li>
                <Link href="/team" onClick={close}>
                  <Users className="size-4" aria-hidden="true" />
                  チーム
                </Link>
              </li>
              <li>
                <button type="button" onClick={handleSignOut} disabled={signingOut}>
                  <LogOut className="size-4" aria-hidden="true" />
                  サインアウト
                </button>
              </li>
            </>
          ))}
      </ul>
    </div>
  );
}
