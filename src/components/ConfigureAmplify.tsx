'use client';

import { Amplify } from 'aws-amplify';
import { outputs } from '@/lib/amplify/config';

/**
 * クライアント側の Amplify 設定（docs/design.md §3.4）
 *
 * ssr: true が要点。これを指定すると Amplify は認証トークンを
 * localStorage ではなく Cookie に保存する。
 *
 * サーバー側は localStorage を読めないため、既定のままだと middleware が
 * 常に「未認証」と判定し、`/team` の保護（§3.2）が成立しない。データ取得は
 * 全てクライアント側で行うが、この1行だけは外せない。
 *
 * 描画するものが無いので null を返す。設定を副作用として実行するためだけの
 * コンポーネント。
 */
Amplify.configure(outputs, { ssr: true });

export default function ConfigureAmplify() {
  return null;
}
