import AccountSettings from '@/components/settings/AccountSettings';
import ThemeSwitcher from '@/components/ThemeSwitcher';

/**
 * 設定画面（docs/design.md §3.1）
 *
 * ゲストでも利用できるが、開放するのはテーマ設定のみ。表示名変更と
 * パスワード変更は認証時にだけ表示する（AccountSettings が出し分ける）。
 * テーマは localStorage で動くため、ここを閉じるとゲストがダークテーマを
 * 選べず不自然になる。
 *
 * middleware で保護していないのはこの出し分けがあるため（§3.2）。
 * 保護対象は /team だけに留めてある。
 */
export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-2xl font-bold">設定</h1>
      <div className="divider" />
      <ThemeSwitcher />
      <AccountSettings />
    </main>
  );
}
