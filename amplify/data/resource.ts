import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

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
 * なお、以下は本ステップの範囲外であり、Lambda 実装時（実装順序ステップ3・10）に
 * 追加する:
 *   - allow.resource(teamFunction) によるバックエンドからの書き込み許可
 *   - UserProfile.teamId のフィールドレベル認可（§1.7 の弱点を塞ぐ）
 *   - joinTeam / leaveTeam / issueInviteCode / repairAccount のカスタムミューテーション
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
      teamId: a.id().required(),
      displayName: a.string().required(),
      theme: a.string().required().default('light'),
    })
    .identifier(['userId'])
    .secondaryIndexes((index) => [index('teamId')])
    .authorization((allow) => [
      allow.ownerDefinedIn('userId').to(['read', 'update']),
      allow.groupDefinedIn('teamId').to(['read']),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // ゲストは AWS にアクセスしない（§5.1）。未認証 Identity は
    // amplify/backend.ts で無効化してある。
    defaultAuthorizationMode: 'userPool',
  },
});
