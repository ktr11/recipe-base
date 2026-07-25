'use client';

import { useState } from 'react';
import TrialLimitNotice from '@/components/recipes/TrialLimitNotice';
import { useRecipes } from '@/hooks/use-recipes';
import { useTrialLimits } from '@/hooks/use-trial-limits';
import type { Label } from '@/lib/recipes/types';
import { getRepository } from '@/repositories';

export default function LabelsPage() {
  const { recipes, labels, loading, reload } = useRecipes();
  const [name, setName] = useState('');
  const [target, setTarget] = useState<Label | null>(null);
  const limits = useTrialLimits({ recipes: recipes.length, labels: labels.length });

  /** 削除で影響を受けるレシピ数。全件が手元にあるので即座に数えられる（§1.6） */
  const affectedCount = target
    ? recipes.filter((r) => r.labelIds.includes(target.id)).length
    : 0;

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;
    const repo = await getRepository();
    await repo.createLabel(name.trim());
    setName('');
    await reload();
  };

  const handleDelete = async () => {
    if (!target) return;
    const repo = await getRepository();
    await repo.deleteLabel(target.id);
    setTarget(null);
    await reload();
  };

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ラベル</h1>
        {limits.guest && (
          <span className="badge badge-ghost">
            {limits.labels.used}/{limits.labels.limit} 件
          </span>
        )}
      </div>

      <div className="divider" />

      {limits.labels.reached ? (
        <TrialLimitNotice
          message={`トライアルではラベルは${limits.labels.limit}件までです`}
        />
      ) : (
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            className="input flex-1"
            placeholder="ラベル名（例: 主菜）"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={name.trim() === ''}>
            追加
          </button>
        </form>
      )}

      {loading ? (
        <p className="mt-6 opacity-70">読み込み中…</p>
      ) : labels.length === 0 ? (
        <p className="mt-6 opacity-70">まだラベルがありません</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {labels.map((label) => (
            <li
              key={label.id}
              className="flex items-center justify-between rounded-box border border-base-300 p-3"
            >
              <span>{label.name}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setTarget(label);
                  (
                    document.getElementById('delete-label-dialog') as HTMLDialogElement
                  ).showModal();
                }}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog id="delete-label-dialog" className="modal">
        <div className="modal-box">
          <h3 className="text-lg font-bold">ラベルを削除しますか？</h3>
          <p className="py-4">
            「{target?.name}」を削除します。
            {affectedCount > 0 && (
              <>
                <br />
                {affectedCount} 件のレシピからこのラベルが外れます（レシピ自体は
                削除されません）。
              </>
            )}
          </p>
          <div className="modal-action">
            <form method="dialog">
              <button type="submit" className="btn btn-ghost" onClick={() => setTarget(null)}>
                キャンセル
              </button>
            </form>
            <button type="button" className="btn btn-error" onClick={handleDelete}>
              削除する
            </button>
          </div>
        </div>
      </dialog>
    </main>
  );
}
