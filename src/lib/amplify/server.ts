import { createServerRunner } from '@aws-amplify/adapter-nextjs';
import { outputs } from './config';

/**
 * サーバー側から Amplify を使うための実行コンテキスト（docs/design.md §3.4）
 *
 * サーバー側はブラウザのようなグローバルセッションを持てないため、
 * リクエストごとに Cookie を受け渡す形でこのランナー経由で実行する。
 *
 * 用途は middleware による `/team` の認証チェック（§3.2）だけである。
 * レシピの取得はゲスト・正規ユーザーとも全てクライアント側で行う（§3.4）。
 */
export const { runWithAmplifyServerContext } = createServerRunner({
  config: outputs,
});
