import ThemeSwitcher from '@/components/ThemeSwitcher';

/**
 * 設定画面（docs/design.md §3.1）
 *
 * ゲストでも利用できるが、開放するのはテーマ設定のみ。表示名変更と
 * パスワード変更は認証時にだけ表示する。テーマは localStorage で動くため、
 * ここを閉じるとゲストがダークテーマを選べず不自然になる。
 *
 * アカウント関連の項目は、サインイン画面が用意できる段階で追加する。
 */
export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-2xl font-bold">設定</h1>
      <div className="divider" />
      <ThemeSwitcher />
    </main>
  );
}
