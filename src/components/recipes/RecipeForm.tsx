'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTrialLimits } from '@/hooks/use-trial-limits';
import { isTrialLimitError } from '@/lib/recipes/limits';
import { MAX_SERVINGS, MIN_SERVINGS } from '@/lib/recipes/scaling';
import type { Ingredient, Label, RecipeInput } from '@/lib/recipes/types';
import { emptyRecipeInput } from '@/lib/recipes/types';

/** 単位の候補。一覧に無い単位も入力できる（datalist は候補提示のみ、§6.4） */
const UNIT_SUGGESTIONS = [
  'g', 'ml', '個', '本', '枚', '片', '束', '大さじ', '小さじ', 'カップ', '適量', '少々',
];

const emptyIngredient = (): Ingredient => ({ name: '', quantity: null, unit: null });

export default function RecipeForm({
  labels,
  initial,
  onSubmit,
  submitLabel,
}: {
  labels: Label[];
  initial?: RecipeInput;
  onSubmit: (input: RecipeInput) => Promise<void>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [input, setInput] = useState<RecipeInput>(initial ?? emptyRecipeInput());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const limits = useTrialLimits({ recipes: 0, labels: 0 });

  const ingredientLimitReached = limits.ingredientsPerRecipe.reachedAt(
    input.ingredients.length,
  );

  const patch = (changes: Partial<RecipeInput>) =>
    setInput((current) => ({ ...current, ...changes }));

  const updateIngredient = (index: number, changes: Partial<Ingredient>) =>
    setInput((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient, i) =>
        i === index ? { ...ingredient, ...changes } : ingredient,
      ),
    }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // 名前が空の材料行は保存しない
      await onSubmit({
        ...input,
        ingredients: input.ingredients.filter((i) => i.name.trim() !== ''),
      });
      router.push('/recipes');
    } catch (caught) {
      // 入口で止めているため通常ここには来ない。保険としての表示（§4.3）
      setError(
        isTrialLimitError(caught)
          ? 'トライアルの上限に達しています。無料登録すると制限なく利用できます。'
          : '保存に失敗しました。もう一度お試しください。',
      );
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <div role="alert" className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <fieldset className="fieldset">
        <legend className="fieldset-legend">料理名</legend>
        <input
          type="text"
          required
          className="input w-full"
          value={input.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset-legend">レシピサイト URL（任意）</legend>
        <input
          type="url"
          className="input w-full"
          placeholder="https://"
          value={input.url ?? ''}
          onChange={(e) => patch({ url: e.target.value || null })}
        />
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset-legend">基準の人数</legend>
        <div className="flex items-center gap-2">
          <input
            type="number"
            required
            min={MIN_SERVINGS}
            max={MAX_SERVINGS}
            className="input w-24"
            value={input.servings}
            onChange={(e) => patch({ servings: Number(e.target.value) })}
          />
          <span>人前</span>
        </div>
        <p className="label">この分量が何人前かを指定します</p>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset-legend">
          材料
          {limits.guest && (
            <span className="ml-2 font-normal opacity-70">
              {input.ingredients.length}/{limits.ingredientsPerRecipe.limit}
            </span>
          )}
        </legend>

        {/* 材料は並び順に意味があり、識別子を持たないため index を key にする */}
        <div className="flex flex-col gap-2">
          {input.ingredients.map((ingredient, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                className="input flex-1 min-w-32"
                placeholder="材料名"
                value={ingredient.name}
                onChange={(e) => updateIngredient(index, { name: e.target.value })}
              />
              <input
                type="number"
                step="any"
                className="input w-24"
                placeholder="数量"
                value={ingredient.quantity ?? ''}
                onChange={(e) =>
                  updateIngredient(index, {
                    quantity: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
              <input
                type="text"
                list="unit-suggestions"
                className="input w-28"
                placeholder="単位"
                value={ingredient.unit ?? ''}
                onChange={(e) =>
                  updateIngredient(index, { unit: e.target.value || null })
                }
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={`${index + 1}行目の材料を削除`}
                onClick={() =>
                  patch({
                    ingredients: input.ingredients.filter((_, i) => i !== index),
                  })
                }
              >
                削除
              </button>
            </div>
          ))}
        </div>

        <datalist id="unit-suggestions">
          {UNIT_SUGGESTIONS.map((unit) => (
            <option key={unit} value={unit} />
          ))}
        </datalist>

        <div className="mt-2">
          <button
            type="button"
            className="btn btn-sm"
            disabled={ingredientLimitReached}
            onClick={() =>
              patch({ ingredients: [...input.ingredients, emptyIngredient()] })
            }
          >
            材料を追加
          </button>
          {ingredientLimitReached && (
            <p className="label text-warning">
              トライアルでは材料は{limits.ingredientsPerRecipe.limit}個までです
            </p>
          )}
        </div>
        <p className="label">
          「適量」「少々」など数量が無い材料は、数量を空欄にして単位だけ入力します
        </p>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset-legend">ラベル</legend>
        {labels.length === 0 ? (
          <p className="label">ラベルはまだありません</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {labels.map((label) => (
              <label key={label.id} className="label cursor-pointer gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={input.labelIds.includes(label.id)}
                  onChange={(e) =>
                    patch({
                      labelIds: e.target.checked
                        ? [...input.labelIds, label.id]
                        : input.labelIds.filter((id) => id !== label.id),
                    })
                  }
                />
                <span className="label-text">{label.name}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset-legend">メモ（任意）</legend>
        <textarea
          className="textarea w-full"
          rows={4}
          value={input.memo ?? ''}
          onChange={(e) => patch({ memo: e.target.value || null })}
        />
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {submitLabel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
