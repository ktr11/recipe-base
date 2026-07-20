import outputs from '../../../amplify_outputs.json';

/**
 * Amplify の接続設定
 *
 * amplify_outputs.json は `ampx sandbox` がデプロイ時に生成するもので、
 * 接続先が環境ごとに異なるため Git 管理外。手元で開発するには
 * 一度 `pnpm exec ampx sandbox` を実行する必要がある。
 */
export { outputs };
