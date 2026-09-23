import { defineBackend } from '@aws-amplify/backend';
import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { postConfirmation } from './auth/post-confirmation/resource';
import { data } from './data/resource';
import { teamFunction } from './functions/team/resource';
import { storage } from './storage/resource';

const backend = defineBackend({
  auth,
  data,
  postConfirmation,
  teamFunction,
  storage,
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
      // cognito-idp:* は付与しない。必要な操作のみに限定する。
      //
      // AdminListGroupsForUser は設計書 §2.2 の一覧に無いが、repairAccount が
      // 「中断した joinTeam の痕跡（現在の所属以外のグループ）」を見つけるために要る。
      // 所属を列挙できなければ、旧チームに残ったレシピを拾えない（§2.7 の3）。
      actions: [
        'cognito-idp:CreateGroup',
        'cognito-idp:DeleteGroup',
        'cognito-idp:AdminAddUserToGroup',
        'cognito-idp:AdminRemoveUserFromGroup',
        'cognito-idp:AdminListGroupsForUser',
      ],
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

/**
 * teamFunction に画像バケットへのアクセスを与える（docs/design.md §7.1）
 *
 * defineStorage の access ルール（allow.resource）を使わないのは意図的。
 * あの経路の環境変数（media_BUCKET_NAME）は SSM 経由で実行時に解決される
 * 仕組みだが、data のカスタムミューテーションのハンドラを兼ねる関数では
 * Lambda に載らないことを CI で確認した。ここでは CognitoGroupAccess と
 * 同じパターンで、専用スタックの明示的なポリシーと addEnvironment に倒す。
 * どちらも参照が一方向（policy → storage / function、function → storage）
 * なので循環は生じない。
 *
 * s3:* は付与しない。署名付き URL の発行・削除・移送・チーム解散時の
 * 一括削除に必要な操作を、media/ プレフィックスに限定して与える。
 */
const mediaBucket = backend.storage.resources.bucket;
const mediaAccessStack = backend.createStack('MediaBucketAccess');

const mediaBucketPolicy = new Policy(mediaAccessStack, 'MediaBucketAccess', {
  statements: [
    new PolicyStatement({
      sid: 'AllowMediaObjectAccess',
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      resources: [`${mediaBucket.bucketArn}/media/*`],
    }),
    new PolicyStatement({
      // deleteTeamImages（チーム解散）がプレフィックス配下を列挙するのに使う
      sid: 'AllowMediaListing',
      actions: ['s3:ListBucket'],
      resources: [mediaBucket.bucketArn],
      conditions: { StringLike: { 's3:prefix': ['media/*'] } },
    }),
  ],
});

mediaBucketPolicy.attachToRole(backend.teamFunction.resources.lambda.role!);

backend.teamFunction.addEnvironment('MEDIA_BUCKET_NAME', mediaBucket.bucketName);

/**
 * DynamoDB テーブルの保護（docs/design.md §11.7）
 *
 * 線を「prod かどうか」ではなく「sandbox かどうか」で引く。dev と prod は
 * どちらも amplify-backend-type が 'branch' なので、両者の設定差が構造的に
 * 存在しなくなり、ブランチ名による分岐も要らない。
 *
 * dev も保護するのは、prod にだけ掛けると「保護が効いた状態での移行手順」を
 * 一度も試さないまま本番でぶつかるため。自由に壊せる場所の役割は sandbox が
 * 既に埋めている。
 *
 * ⚠️ sandbox を除外するのは必須。deletionProtectionEnabled は CloudFormation の
 * removal policy ではなく DynamoDB テーブル自身の属性で、有効なテーブルは
 * DynamoDB 側が削除を拒否する。backend.yml 末尾の使い捨てサンドボックス破棄
 * （ampx sandbox delete --identifier pr-<番号>）が失敗し、環境が AWS 上に
 * 残り続けてコストになる（§10.4）。
 *
 * 狙いは「静かなデータ消失」を「うるさいデプロイ失敗」に変換すること。
 * モデル名や identifier の変更のようなテーブル作り直しを伴う変更が届いても、
 * CloudFormation がテーブルを消せずにデプロイが落ち、データは無傷で残る。
 */
const isSandbox =
  backend.stack.node.tryGetContext('amplify-backend-type') === 'sandbox';

if (!isSandbox) {
  const { amplifyDynamoDbTables } = backend.data.resources.cfnResources;
  for (const table of Object.values(amplifyDynamoDbTables)) {
    table.deletionProtectionEnabled = true;
    table.pointInTimeRecoveryEnabled = true;
  }
}
