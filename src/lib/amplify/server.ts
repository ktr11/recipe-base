import { createServerRunner } from '@aws-amplify/adapter-nextjs';
import { outputs } from './config';

/**
 * サーバー側から Amplify を使うための実行コンテキスト（docs/design.md §3.4）
 *
 * サーバーコンポーネントや middleware は、リクエストごとに独立した文脈で
 * 認証情報を扱う必要がある。ブラウザのようにグローバルなセッションを
 * 持てないため、Cookie を受け渡す形でこのランナー経由で実行する。
 *
 * 正規ユーザーのレシピ一覧は、これを使ってサーバー側で初期データを取得し、
 * ローディングスピナーを出さずに描画する予定。
 */
export const { runWithAmplifyServerContext } = createServerRunner({
  config: outputs,
});
