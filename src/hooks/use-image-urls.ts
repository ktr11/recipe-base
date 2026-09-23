'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getRepository } from '@/repositories';

/**
 * レシピ画像の表示用 URL を取得する（docs/design.md §7.1）
 *
 * URL は署名付きで短命（最大1時間）のため保存できず、画面を組み立てる
 * たびに取り直す。一覧の全件分を1回の呼び出しでまとめて受け取り、
 * Lambda への往復を画面表示ごとに1回に抑える。
 *
 * URL が取れなくても例外にしない。画像はレシピの付随情報であり、
 * プレースホルダ表示で画面自体は成立するため。
 */
export const useImageUrls = (imageKeys: (string | null)[]) => {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());

  // useEffect の依存にできるよう、キー集合を安定した文字列に畳む
  const signature = [...new Set(imageKeys.filter((key) => key !== null))]
    .sort()
    .join('\n');

  useEffect(() => {
    let active = true;
    if (signature === '') {
      // 取得するものが無い。既存の対応表が残っていても、参照されないだけで害は無い
      return;
    }
    void (async () => {
      try {
        const repo = await getRepository();
        const map = await repo.getImageUrls(signature.split('\n'));
        if (active) setUrls(map);
      } catch {
        // プレースホルダ表示にフォールバックする
      }
    })();
    return () => {
      active = false;
    };
  }, [signature]);

  // 期限切れ（img の onError）時の再取得。同じキーへの連打で
  // 無限ループにならないよう、キーごとに一定間隔を空ける
  const lastRefreshAt = useRef(new Map<string, number>());
  const refresh = useCallback(async (key: string) => {
    const last = lastRefreshAt.current.get(key) ?? 0;
    if (Date.now() - last < 10_000) return;
    lastRefreshAt.current.set(key, Date.now());
    try {
      const repo = await getRepository();
      const url = (await repo.getImageUrls([key])).get(key);
      if (url) {
        setUrls((current) => new Map(current).set(key, url));
      }
    } catch {
      // 取れなければプレースホルダのままにする
    }
  }, []);

  return { imageUrls: urls, refreshImageUrl: refresh };
};
