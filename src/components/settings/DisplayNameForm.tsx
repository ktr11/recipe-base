'use client';

import { useState } from 'react';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_RULE,
  updateDisplayName,
  validateDisplayName,
} from '@/lib/user/profile';

/**
 * 表示名の変更（docs/design.md §8）
 *
 * 変更するのは `UserProfile.displayName` だけで、Cognito 側の属性には
 * 触れない。表示名はサインインに一切使わないため**重複チェックも不要**
 * （家族に「パパ」が2人いても破綻しない）。
 *
 * 表示名が使われるのは /team のメンバー一覧だけなので、変更の反映も
 * その画面を次に開いた時で足りる。ここで再取得は促さない。
 */
export default function DisplayNameForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  // 保存済みの値。これと一致している間は保存ボタンを出す意味がない
  const [saved, setSaved] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const invalid = validateDisplayName(name);
  const unchanged = name.trim() === saved;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setDone(false);
    setSubmitting(true);

    try {
      const stored = await updateDisplayName(name);
      setSaved(stored);
      setName(stored);
      setDone(true);
    } catch (caught) {
      console.error(caught);
      setError('表示名を変更できませんでした。もう一度お試しください');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && (
        <div role="alert" className="alert alert-error">
          <span>{error}</span>
        </div>
      )}
      {done && (
        <div role="status" className="alert alert-success">
          <span>表示名を変更しました</span>
        </div>
      )}

      <fieldset className="fieldset">
        <legend className="fieldset-legend">表示名</legend>
        <input
          type="text"
          required
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoComplete="nickname"
          className="input w-full"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDone(false);
          }}
        />
        <p className="label">{DISPLAY_NAME_RULE}。チームのメンバー一覧に表示されます</p>
      </fieldset>

      <button
        type="submit"
        className="btn btn-primary self-start"
        disabled={submitting || unchanged || invalid !== null}
      >
        {submitting && <span className="loading loading-spinner loading-sm" />}
        変更する
      </button>
    </form>
  );
}
