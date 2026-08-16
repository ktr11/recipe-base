import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { postConfirmation } from '../auth/post-confirmation/resource';
import { teamFunction } from '../functions/team/resource';

/**
 * データモデル定義（docs/design.md §1）
 *
 * 設計の中心にある規則:
 *
 *   すべてのデータは teamId を持ち、認可は「その teamId と同名の Cognito
 *   グループに所属しているか」の1問に還元される。
 *
 * 4モデルすべてが同じ allow.groupDefinedIn('teamId') を使う。
 * 所有者ベースの認可とグループ認可を混在させないこと。混ぜた時点でこの設計は壊れる。
 *
 * これを成立させるため、Cognito のグループ名は teamId の値そのものとする。
 * Team モデルは teamId を主キーに宣言し、自動採番の id を使わない。
 *
 * カスタムミューテーション（joinTeam / leaveTeam / issueInviteCode /
 * repairAccount）はすべて teamFunction に集約する。Cognito グループの作成と
 * 所属変更は Admin API でしか行えず、クライアントからは実行できないため（§2.2）。
 */
const schema = a.schema({
  /**
   * 材料。テーブルを作らず Recipe に埋め込む（§1.4）。
   *
   * quantity は null 可。「適量」「少々」のようにスケール不能な材料を表現するため。
   * null の材料は x人前スケーリングの対象外として、そのまま表示する（§6.4）。
   */
  Ingredient: a.customType({
    name: a.string().required(),
    quantity: a.float(),
    unit: a.string(),
  }),

  /**
   * チーム。データの所属単位であり、「個人」もメンバー1人のチームとして表現する。
   *
   * inviteCode の有効期限判定に DynamoDB の TTL を使ってはならない。TTL 削除は
   * best-effort で最大48時間遅れるため、期限切れコードが生き続ける。判定は
   * Lambda 側で inviteCodeExpiresAt > now を明示的に比較する（§2.3）。
   */
  Team: a
    .model({
      teamId: a.id().required(),
      name: a.string().required(),
      inviteCode: a.string(),
      inviteCodeExpiresAt: a.datetime(),
      memberCount: a.integer().required().default(1),
    })
    .identifier(['teamId'])
    // 招待コードからチームを引くために必要（クライアントからは読めない）
    .secondaryIndexes((index) => [index('inviteCode')])
    .authorization((allow) => [
      // 作成・削除は Lambda のみが行うため、メンバーには読み取りと更新だけを許す
      allow.groupDefinedIn('teamId').to(['read', 'update']),
    ]),

  /**
   * レシピ。材料とラベル参照を埋め込みで持つ（§1.4）。
   *
   * labelIds は外部キー制約を持たないため、読み込み時に存在しない ID を無視する
   * 実装が必要になる（§1.6）。これが参照整合性の最終防衛線になる。
   *
   * imageKey は v1 では未使用。後から S3 を追加する際にデータ移行を不要にするため、
   * フィールドだけ予約している（§7.1）。
   */
  Recipe: a
    .model({
      teamId: a.id().required(),
      title: a.string().required(),
      url: a.string(),
      servings: a.integer().required().default(2),
      ingredients: a.ref('Ingredient').array(),
      labelIds: a.id().array(),
      memo: a.string(),
      imageKey: a.string(),
    })
    .secondaryIndexes((index) => [index('teamId')])
    .authorization((allow) => [allow.groupDefinedIn('teamId')]),

  /**
   * ラベル。
   */
  Label: a
    .model({
      teamId: a.id().required(),
      name: a.string().required(),
    })
    .secondaryIndexes((index) => [index('teamId')])
    .authorization((allow) => [allow.groupDefinedIn('teamId')]),

  /**
   * ユーザープロフィール。Cognito 属性のチーム内向け投影（§1.7, §6.2）。
   *
   * クライアントから他ユーザーの Cognito 属性は読めず、Cognito グループの
   * メンバー一覧も Admin API なしには取得できない。そのため表示名とチーム所属を
   * DynamoDB 側に持ち、メンバー一覧を1クエリで引けるようにしている。
   *
   * Cognito のカスタム属性は使わない。User Pool のスキーマは作成時に凍結され、
   * 後から属性を追加するにはプールの作り直し（＝全ユーザー消滅）が必要になるため。
   */
  UserProfile: a
    .model({
      userId: a.id().required(),
      /**
       * 所属チーム。§1.7 の弱点を塞ぐため、フィールド単位で書き込みを禁じる。
       *
       * モデル全体の owner 認可は update を許すので、これが無いと本人が
       * teamId を任意の値に書き換えられる。対応する Cognito グループを
       * 持たないためレシピは読めないが、他チームのメンバー一覧に自分が
       * 現れてしまう。所属の変更は joinTeam / leaveTeam（IAM）の責務であり、
       * クライアントからは読めるだけでよい。
       */
      teamId: a
        .id()
        .required()
        .authorization((allow) => [
          allow.ownerDefinedIn('userId').identityClaim('sub').to(['read']),
          allow.groupDefinedIn('teamId').to(['read']),
        ]),
      displayName: a.string().required(),
      theme: a.string().required().default('light'),
    })
    .identifier(['userId'])
    .secondaryIndexes((index) => [index('teamId')])
    .authorization((allow) => [
      // identityClaim('sub') を明示しているのは意図的。
      // 既定では cognito:username が使われるが、userId には sub を入れる設計
      // なので、username と sub が一致することに暗黙に依存してしまう。
      // メールアドレスをサインイン属性にした場合は実際に一致するが、
      // 依存を残さず claim 側を sub に固定する。
      allow.ownerDefinedIn('userId').identityClaim('sub').to(['read', 'update']),
      allow.groupDefinedIn('teamId').to(['read']),
    ]),

  /**
   * アカウントの自己修復（§2.7）
   *
   * postConfirmation の失敗により「確認済みだがチームが無い」状態になった
   * ユーザーを救う。クライアントはサインイン後に UserProfile の存在を確認し、
   * 無ければこれを呼ぶ。
   */
  RepairAccountResult: a.customType({
    teamId: a.string().required(),
  }),

  repairAccount: a
    .mutation()
    .returns(a.ref('RepairAccountResult'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(teamFunction)),

  /**
   * 招待コードの発行（§2.3）
   *
   * メンバー全員が発行できる。チーム内にロールの概念を持たないため。
   * Team.inviteCode は1フィールドなので、再発行すると旧コードは自動的に
   * 無効になる。
   */
  IssueInviteCodeResult: a.customType({
    inviteCode: a.string().required(),
    expiresAt: a.string().required(),
  }),

  issueInviteCode: a
    .mutation()
    .returns(a.ref('IssueInviteCodeResult'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(teamFunction)),

  /**
   * 招待コードによるチーム参加（§2.5）
   *
   * ⚠️ Lambda でなければ実装できない。招待コードを入力する人はまだその
   * チームのメンバーではないため、クライアントから Team を読んで照合する
   * ことが原理的にできない（読めるなら誰でも全チームのコードを列挙できる）。
   */
  JoinTeamResult: a.customType({
    teamId: a.string().required(),
    teamName: a.string().required(),
  }),

  joinTeam: a
    .mutation()
    .arguments({ inviteCode: a.string().required() })
    .returns(a.ref('JoinTeamResult'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(teamFunction)),

  /**
   * チームからの離脱（§2.6）
   *
   * 離脱者はレシピを一切持ち出さない。新しい個人チームに移る。
   */
  LeaveTeamResult: a.customType({
    teamId: a.string().required(),
  }),

  leaveTeam: a
    .mutation()
    .returns(a.ref('LeaveTeamResult'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(teamFunction)),
})
  // バックエンドの Lambda にデータアクセスを許可する。
  // モデル単位ではなくスキーマ全体に付ける API である点に注意。
  .authorization((allow) => [
    allow.resource(postConfirmation),
    allow.resource(teamFunction),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // ゲストは AWS にアクセスしない（§5.1）。未認証 Identity は
    // amplify/backend.ts で無効化してある。
    defaultAuthorizationMode: 'userPool',
  },
});
