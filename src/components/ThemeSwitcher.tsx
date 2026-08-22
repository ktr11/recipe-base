'use client';

import { useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  applyTheme,
  getServerThemeSnapshot,
  getThemeSnapshot,
  subscribeTheme,
  THEMES,
  type ThemeId,
} from '@/lib/theme';
import { saveTheme } from '@/lib/user/profile';

/**
 * テーマ切り替え（docs/design.md §6.1 / §6.2）
 *
 * 現在の選択状態はサーバーでは分からない（localStorage にあるため）ので、
 * マウント後に読み取る。それまでは未選択として描画する。
 *
 * 表示そのものは ThemeScript が描画前に済ませているため、ここで状態が
 * 遅れて確定してもちらつきにはならない。影響するのは「どれが選択中か」の
 * 印だけ。
 */
export default function ThemeSwitcher() {
  const { guest } = useAuth();

  const current = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  const handleSelect = (theme: ThemeId) => {
    // applyTheme が購読者に通知するため、ここで状態を持つ必要はない
    applyTheme(theme);

    // 認証済みなら別端末用の控えも残す（§6.2）。ゲストは AWS に一切
    // 書き込まないため何もしない（§5.1）
    if (guest) return;

    // ⚠️ 待たないのは意図的。表示は applyTheme で既に切り替わっており、
    // 控えの保存が遅れても利用者に見えるものは何も変わらない。
    // 失敗しても操作を止めず、ログだけ残す
    void saveTheme(theme).catch((caught: unknown) => {
      console.error(caught);
    });
  };

  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend">カラーテーマ</legend>
      <div className="flex flex-col gap-2">
        {THEMES.map((theme) => (
          <label key={theme.id} className="label cursor-pointer justify-start gap-3">
            <input
              type="radio"
              name="theme"
              className="radio radio-sm"
              value={theme.id}
              checked={current === theme.id}
              onChange={() => handleSelect(theme.id)}
            />
            <span className="label-text">{theme.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
