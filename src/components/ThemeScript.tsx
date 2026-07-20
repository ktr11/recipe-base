import { THEME_STORAGE_KEY, THEMES } from '@/lib/theme';

/**
 * 初回描画のちらつきを防ぐスクリプト（docs/design.md §6.2）
 *
 * ⚠️ このコンポーネントは <head> 内に置き、非同期にしないこと。
 *
 * サーバーはユーザーが選んだテーマを知らないため、素直に実装すると
 * 「既定テーマで一瞬描画 → 取得後に切り替わる」フラッシュが必ず起きる。
 * ダークテーマの利用者には真っ白な画面が一瞬光る形になり、体感品質を
 * 最も損なう類の不具合になる。
 *
 * 回避策は1つだけ:
 *   描画前にブロッキングで localStorage を読み、<html data-theme> を書く。
 *
 * したがってサーバー保存（UserProfile.theme）は別端末への同期用の控えで
 * あって、初回描画の入力ではない。
 *
 * 保存済みテーマが無い場合は data-theme を設定しない。CSS 側の
 * --prefersdark により OS の設定が使われる。
 */
export default function ThemeScript() {
  const script = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
    THEME_STORAGE_KEY,
  )});if(${JSON.stringify(THEMES.map((t) => t.id))}.indexOf(t)>-1){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})()`;

  // 属性を直接書き換えるため React の管理外になる。
  // <html> 側の suppressHydrationWarning とセットで機能する。
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
