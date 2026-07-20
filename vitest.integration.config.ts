import { defineConfig } from 'vitest/config';

/**
 * 統合テスト（docs/design.md §10.2）
 *
 * デプロイ済みの sandbox に対して実行する。単体テストとは設定を分けている。
 * 混ぜると、AWS への接続を伴うテストのせいで単体テストが遅くなり、
 * 結果として誰も実行しなくなるため。
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    // 実ユーザーの作成とサインインを伴うため、既定のタイムアウトでは足りない
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Amplify のセッションはプロセス内で1つしか保持できないため直列実行する
    fileParallelism: false,
  },
});
