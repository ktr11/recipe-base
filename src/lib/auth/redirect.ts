/** サインイン後に戻る既定の行き先 */
export const DEFAULT_REDIRECT = '/recipes';

/**
 * クエリで渡された戻り先を、遷移してよい値に絞り込む
 *
 * middleware が付ける ?redirect= はアドレスバーから自由に書き換えられる。
 * そのまま router.push に渡すと、外部サイトへの誘導（オープンリダイレクト）や
 * javascript: スキームの実行に使われる。**同一サイト内の絶対パスだけを通す。**
 *
 * - '/team'      → 通す
 * - '//evil.com' → 弾く（プロトコル相対 URL は外部サイトを指す）
 * - 'javascript:…' や 'https://…' → 弾く
 */
export const safeRedirect = (value: string | null): string => {
  if (!value) return DEFAULT_REDIRECT;
  if (!value.startsWith('/')) return DEFAULT_REDIRECT;
  if (value.startsWith('//')) return DEFAULT_REDIRECT;
  // '/\evil.com' をブラウザが '//evil.com' と解釈する場合への対処
  if (value.startsWith('/\\')) return DEFAULT_REDIRECT;
  return value;
};
