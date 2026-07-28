'use client';

import { fetchAuthSession } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { useCallback, useEffect, useState } from 'react';

/**
 * 認証状態（ゲストか正規ユーザーか）を解決する
 *
 * 判定は fetchAuthSession のトークン有無で行う。ゲストは AWS にアクセスせず
 * トークンを持たないため（§5.1）、トークンがあれば正規ユーザーとみなす。
 *
 * fetchAuthSession は非同期なので、解決が済むまでは loading とする。
 * 解決前は guest を true 側に倒しておく。トライアル残数の表示で「まだ不明な
 * 段階でうっかり無制限の UI を見せる」よりは、ゲスト前提で控えめに出す方が安全。
 *
 * データの読み書きに使う Repository の選択は getRepository が都度 fetchAuthSession
 * を見て行う。こちらは表示を認証状態に追従させるためのフック。
 *
 * Hub を購読しているのは、サインイン/サインアウトが**このフックを使っている
 * コンポーネントの外**で起きるため。共通ナビはページ遷移では再マウントされず、
 * 初回の fetchAuthSession の結果を持ち続けてしまう。サインインしたのに
 * 「サインイン」リンクが出たままになるのを防ぐ。
 */
export const useAuth = (): { guest: boolean; loading: boolean } => {
  const [guest, setGuest] = useState<boolean | null>(null);

  const resolve = useCallback(async (): Promise<boolean> => {
    try {
      const session = await fetchAuthSession();
      return !session.tokens;
    } catch {
      // セッション取得に失敗した場合はゲストとして扱う
      return true;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const apply = () => {
      resolve().then((value) => {
        if (active) setGuest(value);
      });
    };

    apply();

    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (
        payload.event === 'signedIn' ||
        payload.event === 'signedOut' ||
        payload.event === 'tokenRefresh_failure'
      ) {
        apply();
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [resolve]);

  return { guest: guest ?? true, loading: guest === null };
};
