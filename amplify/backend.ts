import { defineBackend } from '@aws-amplify/backend';
import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { postConfirmation } from './auth/post-confirmation/resource';
import { data } from './data/resource';
import { teamFunction } from './functions/team/resource';

const backend = defineBackend({
  auth,
  data,
  postConfirmation,
  teamFunction,
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

/**
 * Lambda に Cognito のグループ操作権限を与える（docs/design.md §2.2）
 *
 * チームは Cognito グループとして表現され、グループの作成とユーザーの
 * 所属変更は Admin API でしか行えない。クライアントからは実行できないため、
 * バックエンドの Lambda 実行ロールにのみ権限を付与する。
 *
 * cognito-idp:* は付与しない。必要な操作のみを、対象 User Pool の ARN に
 * 限定して与える。
 */
/**
 * ポリシーを auth / data とは別のスタックに置く理由（重要）
 *
 * postConfirmation は auth スタック内にあり、User Pool からトリガーとして
 * 参照されている。ここで実行ロールに「User Pool の ARN を参照するポリシー」を
 * 直接付けると、
 *
 *   UserPool → trigger → Lambda → 実行ロール → ポリシー → UserPool
 *
 * という循環が auth スタック内に閉じ、CloudFormation がデプロイを拒否する
 * （実際に CloudformationResourceCircularDependencyError で失敗した）。
 *
 * ポリシーだけを独立したスタックに切り出すと依存が一方向になる:
 *
 *   auth スタック  : UserPool → trigger → Lambda → 実行ロール
 *   policy スタック: Policy → 実行ロール / UserPool を参照
 *
 * auth スタックは policy スタックを一切参照しないため、輪が閉じない。
 * これにより権限を対象 User Pool の ARN に限定したまま循環を回避できる。
 */
const policyStack = backend.createStack('CognitoGroupAccess');

const groupManagementPolicy = new Policy(policyStack, 'GroupManagement', {
  statements: [
    new PolicyStatement({
      sid: 'AllowCognitoGroupManagement',
      // cognito-idp:* は付与しない。必要な2操作のみに限定する。
      actions: ['cognito-idp:CreateGroup', 'cognito-idp:AdminAddUserToGroup'],
      resources: [backend.auth.resources.userPool.userPoolArn],
    }),
  ],
});

groupManagementPolicy.attachToRole(backend.postConfirmation.resources.lambda.role!);
groupManagementPolicy.attachToRole(backend.teamFunction.resources.lambda.role!);

// postConfirmation はトリガーイベントから userPoolId を受け取れるが、
// teamFunction は AppSync 経由で呼ばれるため環境変数で渡す必要がある。
backend.teamFunction.addEnvironment(
  'USER_POOL_ID',
  backend.auth.resources.userPool.userPoolId,
);
