'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Label, Recipe } from '@/lib/recipes/types';
import { getRepository } from '@/repositories';

const load = async (): Promise<{ recipes: Recipe[]; labels: Label[] }> => {
  const repo = await getRepository();
  const [recipes, labels] = await Promise.all([repo.listRecipes(), repo.listLabels()]);
  return { recipes, labels };
};

/**
 * レシピとラベルの読み込み（docs/design.md §3.4 / §3.5）
 *
 * ゲスト・正規ユーザーのどちらもマウント後にクライアントから読み込む。
 * サーバーコンポーネントによる初期データの受け渡しは採用していない（§3.4）。
 *
 * 鮮度は「画面を開いた時点」と「タブに戻った時点」で保つ（§3.5）。前者は
 * マウント時の取得が、後者は下の visibilitychange が担う。家族の別の
 * メンバーがレシピを追加しても、開きっぱなしのタブは気づけないため。
 */
export const useRecipes = () => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // アンマウント後に状態を更新しないためのガード
    let active = true;

    const apply = (data: { recipes: Recipe[]; labels: Label[] }) => {
      if (!active) return;
      setRecipes(data.recipes);
      setLabels(data.labels);
      setLoading(false);
    };

    void load().then(apply);

    // タブに戻った時だけ取り直す。離れる時（hidden）は取得しても捨てるだけ
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      void load().then(apply);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  /** 作成・更新・削除の後に呼ぶ */
  const reload = useCallback(async () => {
    const data = await load();
    setRecipes(data.recipes);
    setLabels(data.labels);
  }, []);

  return { recipes, labels, loading, reload };
};
