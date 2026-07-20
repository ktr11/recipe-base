import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * 単体テスト（docs/design.md §10.1）
 *
 * ローカル完結。AWS への接続を伴わない純粋なロジックのみを対象とする。
 *
 * tests/integration/ を除外しているのは必須。除外しないと `pnpm test` が
 * 統合テストまで実行してしまい、AWS 認証情報とデプロイ済みバックエンドが
 * 無い環境（CI を含む）で失敗する。統合テストは
 * vitest.integration.config.ts 側で明示的に実行する。
 */
export default defineConfig({
  // src/ のコードは @/* エイリアスを使うため、テストからも解決できるようにする
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    exclude: ['tests/integration/**'],
    // localStorage を使うため。ブラウザ相当の環境が要る
    environment: 'jsdom',
  },
});
