import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './errors';
import { PASSWORD_RULE, validatePassword } from './password';

/** Amplify の AuthError は name に Cognito の例外名を入れてくる */
const authError = (name: string) => Object.assign(new Error('raw message'), { name });

describe('authErrorMessage', () => {
  it('既知の例外を日本語のメッセージに変換する', () => {
    expect(authErrorMessage(authError('UsernameExistsException'))).toBe(
      'このメールアドレスは既に登録されています',
    );
    expect(authErrorMessage(authError('CodeMismatchException'))).toBe(
      '確認コードが違います',
    );
  });

  it('アカウントの有無を区別しない', () => {
    // 区別すると、登録済みのメールアドレスを総当たりで特定できてしまう
    expect(authErrorMessage(authError('UserNotFoundException'))).toBe(
      authErrorMessage(authError('NotAuthorizedException')),
    );
  });

  it('パスワード不備にはパスワード規則をそのまま出す', () => {
    expect(authErrorMessage(authError('InvalidPasswordException'))).toBe(
      PASSWORD_RULE,
    );
  });

  it('未知の例外は fallback にする（英語の原文を画面に出さない）', () => {
    expect(authErrorMessage(authError('SomethingUnknownException'))).toBe(
      'エラーが発生しました。もう一度お試しください',
    );
    expect(authErrorMessage(authError('X'), 'サインインに失敗しました')).toBe(
      'サインインに失敗しました',
    );
  });

  it('例外でない値を渡されても落ちない', () => {
    expect(authErrorMessage(undefined)).toBe(
      'エラーが発生しました。もう一度お試しください',
    );
    expect(authErrorMessage('文字列')).toBe(
      'エラーが発生しました。もう一度お試しください',
    );
  });
});

describe('validatePassword', () => {
  it('8文字以上で英小文字と数字を含めば通る', () => {
    expect(validatePassword('recipe2026')).toBeNull();
  });

  it('8文字未満は弾く', () => {
    expect(validatePassword('rec2026')).toBe(PASSWORD_RULE);
  });

  it('数字が無ければ弾く', () => {
    expect(validatePassword('recipebase')).toBe(PASSWORD_RULE);
  });

  it('英小文字が無ければ弾く', () => {
    // User Pool の requireLowercase に合わせる。大文字だけでは通さない
    expect(validatePassword('RECIPE2026')).toBe(PASSWORD_RULE);
  });

  it('記号は要求しない', () => {
    expect(validatePassword('kazoku123')).toBeNull();
  });
});
