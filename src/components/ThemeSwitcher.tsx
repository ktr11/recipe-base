'use client';

import { useSyncExternalStore } from 'react';
import {
  applyTheme,
  getServerThemeSnapshot,
  getThemeSnapshot,
  subscribeTheme,
  THEMES,
  type ThemeId,
} from '@/lib/theme';

/**
 * テーマ切り替え（docs/design.md §6.1）
 *
 * 現在の選択状態はサーバーでは分からない（localStorage にあるため）ので、
 * マウント後に読み取る。それまでは未選択として描画する。
 *
 * 表示そのものは ThemeScript が描画前に済ませているため、ここで状態が
 * 遅れて確定してもちらつきにはならない。影響するのは「どれが選択中か」の
 * 印だけ。
 */
export default function ThemeSwitcher() {
  const current = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  const handleSelect = (theme: ThemeId) => {
    // applyTheme が購読者に通知するため、ここで状態を持つ必要はない
    applyTheme(theme);
    // TODO: 認証済みの場合は UserProfile.theme にも保存する（別端末との同期）。
    // 設定画面とデータ層が揃うステップ以降で対応する。
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
