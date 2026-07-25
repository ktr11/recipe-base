'use client';

import RecipeForm from '@/components/recipes/RecipeForm';
import TrialLimitNotice from '@/components/recipes/TrialLimitNotice';
import { useRecipes } from '@/hooks/use-recipes';
import { useTrialLimits } from '@/hooks/use-trial-limits';
import { getRepository } from '@/repositories';

export default function NewRecipePage() {
  const { recipes, labels, loading } = useRecipes();
  const limits = useTrialLimits({ recipes: recipes.length, labels: labels.length });

  if (loading) {
    return <main className="mx-auto w-full max-w-2xl p-6 opacity-70">読み込み中…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-2xl font-bold">レシピを追加</h1>
      <div className="divider" />

      {limits.recipes.reached ? (
        // 入口で止める。フォームを埋めさせてから弾かない（§4.3）
        <TrialLimitNotice
          message={`トライアルではレシピは${limits.recipes.limit}件までです`}
        />
      ) : (
        <RecipeForm
          labels={labels}
          submitLabel="保存"
          onSubmit={async (input) => {
            await getRepository().createRecipe(input);
          }}
        />
      )}
    </main>
  );
}
