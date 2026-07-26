/**
 * パスワード規則（docs/design.md §8）
 *
 * 実際に強制するのは Cognito の User Pool（amplify/backend.ts のパスワード
 * ポリシー）であって、ここではない。同じ規則をクライアントにも置くのは、
 * 送信してから InvalidPasswordException で弾かれるより、入力中に気付ける方が
 * 良いというだけの理由。**規則を変えるときは両方を直す必要がある。**
 *
 * 記号を必須にしないのは意図的（家族利用で記号必須は離脱要因にしかならない）。
 */
export const PASSWORD_RULE = '8文字以上で、英小文字と数字を含めてください';

const MIN_LENGTH = 8;

/**
 * パスワードが規則を満たすか。満たさなければ理由を返す。
 *
 * requireLowercase / requireNumbers を有効にした User Pool 側の設定に合わせる。
 * 大文字と記号は要求しない。
 */
export const validatePassword = (password: string): string | null => {
  if (password.length < MIN_LENGTH) return PASSWORD_RULE;
  if (!/[a-z]/.test(password)) return PASSWORD_RULE;
  if (!/[0-9]/.test(password)) return PASSWORD_RULE;
  return null;
};
