'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import TrialLimitNotice from '@/components/recipes/TrialLimitNotice';
import { useRecipes } from '@/hooks/use-recipes';
import { useTrialLimits } from '@/hooks/use-trial-limits';
import { resolveLabels } from '@/lib/recipes/labels';
import { filterRecipes, sortByUpdatedAtDesc } from '@/lib/recipes/search';

/**
 * レシピ一覧と検索（docs/design.md §1.5 / §3.1）
 *
 * 全件をメモリに載せてクライアント側で絞り込む。キー入力ごとの通信が
 * ゼロなので体感が即座で、表記ゆれの正規化も自由に書ける。
 */
export default function RecipesPage() {
  const { recipes, labels, loading } = useRecipes();
  const [title, setTitle] = useState('');
  const [ingredient, setIngredient] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);

  const limits = useTrialLimits({ recipes: recipes.length, labels: labels.length });

  const visible = useMemo(
    () => sortByUpdatedAtDesc(filterRecipes(recipes, { title, ingredient, labelIds })),
    [recipes, title, ingredient, labelIds],
  );

  const toggleLabel = (id: string) =>
    setLabelIds((current) =>
      current.includes(id) ? current.filter((l) => l !== id) : [...current, id],
    );

  const hasFilter = title !== '' || ingredient !== '' || labelIds.length > 0;

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">レシピ</h1>
        {limits.guest && (
          <span className="badge badge-ghost">
            {limits.recipes.used}/{limits.recipes.limit} 件
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            className="input flex-1 min-w-40"
            placeholder="料理名で探す"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="search"
            className="input flex-1 min-w-40"
            placeholder="材料で探す"
            value={ingredient}
            onChange={(e) => setIngredient(e.target.value)}
          />
        </div>

        {labels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <button
                key={label.id}
                type="button"
                aria-pressed={labelIds.includes(label.id)}
                className={`badge badge-lg ${
                  labelIds.includes(label.id) ? 'badge-primary' : 'badge-outline'
                }`}
                onClick={() => toggleLabel(label.id)}
              >
                {label.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="divider" />

      {limits.recipes.reached ? (
        <TrialLimitNotice
          message={`トライアルではレシピは${limits.recipes.limit}件までです`}
        />
      ) : (
        <Link href="/recipes/new" className="btn btn-primary">
          レシピを追加
        </Link>
      )}

      {loading ? (
        <p className="mt-6 opacity-70">読み込み中…</p>
      ) : visible.length === 0 ? (
        <p className="mt-6 opacity-70">
          {hasFilter
            ? '条件に合うレシピがありません'
            : 'まだレシピがありません。追加してみてください'}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {visible.map((recipe) => (
            <li key={recipe.id}>
              <Link
                href={`/recipes/${recipe.id}`}
                className="card card-border bg-base-100 hover:bg-base-200"
              >
                <div className="card-body p-4">
                  <h2 className="card-title text-base">{recipe.title}</h2>
                  {recipe.ingredients.length > 0 && (
                    <p className="text-sm opacity-70">
                      {recipe.ingredients.map((i) => i.name).join('、')}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {resolveLabels(recipe.labelIds, labels).map((label) => (
                      <span key={label.id} className="badge badge-sm">
                        {label.name}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
