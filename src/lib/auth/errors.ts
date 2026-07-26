import { PASSWORD_RULE } from './password';

/**
 * Cognito の例外を利用者向けの日本語メッセージに変換する
 *
 * Amplify v6 は AuthError の name に Cognito の例外名をそのまま入れてくる。
 * 生のメッセージは英語で、しかも「何をすればいいか」を書いていないため、
 * 画面にはこの変換を通したものだけを出す。
 *
 * ⚠️ UserNotFoundException と NotAuthorizedException を同じ文言にまとめて
 * いるのは意図的。区別して表示すると「そのメールアドレスは登録されているか」
 * を未認証の相手に教えることになり、アカウントの存在を総当たりで調べられる。
 */
const MESSAGES: Record<string, string> = {
  UserNotFoundException: 'メールアドレスまたはパスワードが違います',
  NotAuthorizedException: 'メールアドレスまたはパスワードが違います',
  UserNotConfirmedException: 'メールアドレスの確認が済んでいません',
  UsernameExistsException: 'このメールアドレスは既に登録されています',
  InvalidPasswordException: PASSWORD_RULE,
  InvalidParameterException: '入力内容を確認してください',
  CodeMismatchException: '確認コードが違います',
  ExpiredCodeException: '確認コードの有効期限が切れています。再送してください',
  CodeDeliveryFailureException: '確認コードを送信できませんでした',
  LimitExceededException: '試行回数の上限に達しました。しばらく待ってからお試しください',
  TooManyRequestsException: '試行回数の上限に達しました。しばらく待ってからお試しください',
  TooManyFailedAttemptsException:
    '試行回数の上限に達しました。しばらく待ってからお試しください',
  UserAlreadyAuthenticatedException: '既にサインインしています',
  NetworkError: '通信に失敗しました。接続を確認してもう一度お試しください',
};

/**
 * 例外から表示用のメッセージを得る。対応表に無いものは fallback を返す。
 *
 * 未知の例外に英語の原文を出さないのは、利用者にとって意味が無い上に
 * 内部情報が漏れる可能性があるため。原因調査にはコンソールのログを使う。
 */
export const authErrorMessage = (
  error: unknown,
  fallback = 'エラーが発生しました。もう一度お試しください',
): string => {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name: unknown }).name)
      : '';

  return MESSAGES[name] ?? fallback;
};
