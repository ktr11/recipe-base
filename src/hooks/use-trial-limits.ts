'use client';

import { TRIAL_LIMITS } from '@/lib/recipes/limits';
import { isGuest } from '@/repositories';

/**
 * トライアル制限の残数（docs/design.md §4.2）
 *
 * ⚠️ このフックは表示専用で、判定の責任を持たない。
 * 上限の強制は LocalStorageRepository が唯一の関門であり、そちらを通れば
 * 必ず検査される。ここはボタンの無効化や「2/3」表示のためだけに使う。
 *
 * 責務を分けているのは、判定をフックやコンポーネントに置くと、新しい
 * 作成経路を足した人がチェックを書き忘れるのが典型的な壊れ方だから。
 */
export const useTrialLimits = (counts: { recipes: number; labels: number }) => {
  const guest = isGuest();

  return {
    guest,
    recipes: {
      used: counts.recipes,
      limit: TRIAL_LIMITS.recipes,
      reached: guest && counts.recipes >= TRIAL_LIMITS.recipes,
    },
    labels: {
      used: counts.labels,
      limit: TRIAL_LIMITS.labels,
      reached: guest && counts.labels >= TRIAL_LIMITS.labels,
    },
    ingredientsPerRecipe: {
      limit: TRIAL_LIMITS.ingredientsPerRecipe,
      reachedAt: (count: number) =>
        guest && count >= TRIAL_LIMITS.ingredientsPerRecipe,
    },
  };
};
