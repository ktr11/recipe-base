import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';

const backend = defineBackend({
  auth,
  data,
});

const { cfnUserPool, cfnIdentityPool } = backend.auth.resources.cfnResources;

/**
 * パスワードポリシー（docs/design.md §8）
 *
 * 8文字以上、英字と数字を含む。記号は必須にしない。
 * 家族利用のアプリで記号必須は離脱要因にしかならないため。
 *
 * defineAuth はパスワードポリシーを公開していないため、
 * CloudFormation リソースを直接設定する。
 */
cfnUserPool.policies = {
  passwordPolicy: {
    minimumLength: 8,
    requireLowercase: true,
    requireNumbers: true,
    requireUppercase: false,
    requireSymbols: false,
  },
};

/**
 * 未認証（ゲスト）Identity を無効化する（docs/design.md §5.1）
 *
 * ゲストのデータは localStorage にのみ保存し、AWS には一切書き込まない方針。
 * Amplify Data の allow.guest() は所有者単位の分離ができず、有効にすると
 * 全ゲストが互いのデータを閲覧・編集・削除できる状態になるため、
 * 未認証 Identity 自体を発行しないことで経路ごと塞ぐ。
 */
cfnIdentityPool.allowUnauthenticatedIdentities = false;
