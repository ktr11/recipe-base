'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Label, Recipe } from '@/lib/recipes/types';
import { getRepository } from '@/repositories';

const load = async (): Promise<{ recipes: Recipe[]; labels: Label[] }> => {
  const repo = getRepository();
  const [recipes, labels] = await Promise.all([repo.listRecipes(), repo.listLabels()]);
  return { recipes, labels };
};

/**
 * レシピとラベルの読み込み
 *
 * ゲストのデータは localStorage にあるためサーバーでは取得できず、
 * マウント後に読み込む。正規ユーザー向けにサーバーコンポーネントから
 * 初期データを渡す経路（§3.4）はステップ8 で追加する。
 */
export const useRecipes = () => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // アンマウント後に状態を更新しないためのガード
    let active = true;
    void load().then((data) => {
      if (!active) return;
      setRecipes(data.recipes);
      setLabels(data.labels);
      setLoading(false);
    });
    return () => {
      active = false;
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
