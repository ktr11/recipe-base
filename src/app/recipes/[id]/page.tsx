'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import RecipeForm from '@/components/recipes/RecipeForm';
import { useRecipes } from '@/hooks/use-recipes';
import { resolveLabels } from '@/lib/recipes/labels';
import {
  MAX_SERVINGS,
  MIN_SERVINGS,
  formatIngredient,
  scaleIngredients,
} from '@/lib/recipes/scaling';
import type { Recipe } from '@/lib/recipes/types';
import { getRepository } from '@/repositories';

export default function RecipeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { labels, reload } = useRecipes();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [servings, setServings] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void getRepository()
      .getRecipe(params.id)
      .then((found) => {
        if (!active) return;
        setRecipe(found);
        // 初期表示は基準人前。選んだ人数は保存しない（§6.4）
        setServings(found?.servings ?? null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.id]);

  if (loading) {
    return <main className="mx-auto w-full max-w-2xl p-6 opacity-70">読み込み中…</main>;
  }

  if (!recipe || servings === null) {
    return (
      <main className="mx-auto w-full max-w-2xl p-6">
        <p>レシピが見つかりません。</p>
        <Link href="/recipes" className="btn btn-ghost mt-4">
          一覧へ戻る
        </Link>
      </main>
    );
  }

  if (editing) {
    return (
      <main className="mx-auto w-full max-w-2xl p-6">
        <h1 className="text-2xl font-bold">レシピを編集</h1>
        <div className="divider" />
        <RecipeForm
          labels={labels}
          submitLabel="更新"
          initial={{
            title: recipe.title,
            url: recipe.url,
            servings: recipe.servings,
            ingredients: recipe.ingredients,
            labelIds: recipe.labelIds,
            memo: recipe.memo,
          }}
          onSubmit={async (input) => {
            await getRepository().updateRecipe(recipe.id, input);
            await reload();
          }}
        />
      </main>
    );
  }

  const scaled = scaleIngredients(recipe.ingredients, recipe.servings, servings);

  const handleDelete = async () => {
    await getRepository().deleteRecipe(recipe.id);
    await reload();
    router.push('/recipes');
  };

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-2xl font-bold">{recipe.title}</h1>

      <div className="mt-2 flex flex-wrap gap-1">
        {resolveLabels(recipe.labelIds, labels).map((label) => (
          <span key={label.id} className="badge">
            {label.name}
          </span>
        ))}
      </div>

      {recipe.url && (
        <a
          href={recipe.url}
          target="_blank"
          rel="noreferrer"
          className="link link-primary mt-3 inline-block break-all"
        >
          {recipe.url}
        </a>
      )}

      <div className="divider" />

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">材料</h2>
          <div className="join">
            <button
              type="button"
              className="btn btn-sm join-item"
              aria-label="人数を減らす"
              disabled={servings <= MIN_SERVINGS}
              onClick={() => setServings((s) => (s ?? 1) - 1)}
            >
              −
            </button>
            <span className="btn btn-sm join-item pointer-events-none">
              {servings} 人前
            </span>
            <button
              type="button"
              className="btn btn-sm join-item"
              aria-label="人数を増やす"
              disabled={servings >= MAX_SERVINGS}
              onClick={() => setServings((s) => (s ?? 1) + 1)}
            >
              ＋
            </button>
          </div>
        </div>

        {servings !== recipe.servings && (
          <p className="mt-2 text-sm opacity-70">
            基準の {recipe.servings} 人前から換算しています
          </p>
        )}

        {scaled.length === 0 ? (
          <p className="mt-3 opacity-70">材料は登録されていません</p>
        ) : (
          // 材料は識別子を持たず、並び順に意味があるため index を key にする
          <ul className="mt-3 flex flex-col gap-1">
            {scaled.map((ingredient, index) => (
              <li key={index} className="flex justify-between border-b border-base-300 py-1">
                <span>{ingredient.name}</span>
                <span className="opacity-80">
                  {formatIngredient(ingredient).replace(`${ingredient.name} `, '')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recipe.memo && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">メモ</h2>
          <p className="mt-2 whitespace-pre-wrap">{recipe.memo}</p>
        </section>
      )}

      <div className="divider" />

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => setEditing(true)}>
          編集
        </button>
        <button
          type="button"
          className="btn btn-error btn-outline"
          onClick={() =>
            (document.getElementById('delete-dialog') as HTMLDialogElement).showModal()
          }
        >
          削除
        </button>
        <Link href="/recipes" className="btn btn-ghost">
          一覧へ戻る
        </Link>
      </div>

      {/* 削除は確認モーダル + 物理削除。ゴミ箱は持たない（§6.6） */}
      <dialog id="delete-dialog" className="modal">
        <div className="modal-box">
          <h3 className="text-lg font-bold">レシピを削除しますか？</h3>
          <p className="py-4">「{recipe.title}」を削除します。元に戻せません。</p>
          <div className="modal-action">
            <form method="dialog">
              <button type="submit" className="btn btn-ghost">
                キャンセル
              </button>
            </form>
            <button type="button" className="btn btn-error" onClick={handleDelete}>
              削除する
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit">閉じる</button>
        </form>
      </dialog>
    </main>
  );
}
