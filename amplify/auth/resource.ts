import { defineAuth } from '@aws-amplify/backend';

/**
 * 認証リソース定義
 *
 * 設計方針（docs/design.md §8）:
 * - サインインは常にメールアドレス。ユーザー名によるサインインは使わない
 * - サインアップ時のメール確認コードを必須とする
 * - パスワードリセット（忘れた場合）はメールで行う
 *
 * カスタム属性を定義していないのは意図的（docs/design.md §6.2）。
 * User Pool のスキーマは作成時に凍結され、カスタム属性を後から追加するには
 * プールの作り直し（＝全ユーザー消滅）が必要になる。表示名やテーマといった
 * ユーザー単位の情報は、すべて DynamoDB の UserProfile モデルで扱う。
 *
 * パスワードポリシーは defineAuth では設定できないため、
 * amplify/backend.ts の CDK エスケープハッチで指定している。
 */
export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: 'CODE',
      verificationEmailSubject: '【レシピ共有】確認コード',
      verificationEmailBody: (createCode) =>
        `確認コードは ${createCode()} です。アプリの画面に入力してください。`,
    },
  },
  accountRecovery: 'EMAIL_ONLY',
});
