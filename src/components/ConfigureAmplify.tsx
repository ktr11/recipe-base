'use client';

import { Amplify } from 'aws-amplify';
import { outputs } from '@/lib/amplify/config';

/**
 * クライアント側の Amplify 設定（docs/design.md §3.4）
 *
 * ssr: true が要点。これを指定すると Amplify は認証トークンを
 * localStorage ではなく Cookie に保存する。
 *
 * サーバーコンポーネントは localStorage を読めないため、既定のままだと
 * SSR 側が常に「未認証」と判定してしまい、サーバー側でのデータ取得が
 * 成立しない。この1行がサーバーレンダリング全体の前提になっている。
 *
 * 描画するものが無いので null を返す。設定を副作用として実行するためだけの
 * コンポーネント。
 */
Amplify.configure(outputs, { ssr: true });

export default function ConfigureAmplify() {
  return null;
}
