import { defineStorage } from '@aws-amplify/backend';

/**
 * レシピ画像の保存先（docs/design.md §7.1）
 *
 * ⚠️ クライアントにはバケットへの一切のアクセス権を与えない。これは意図的。
 *
 * Storage のアクセスルールは「グループごとに作られる IAM ロールへの
 * ポリシー付与」で実装されるため、defineAuth に静的定義したグループしか
 * 対象にできない。実行時に Admin API で作る teamId グループには IAM ロールが
 * 存在せず、中心規則「認可は teamId と同名グループへの所属か、の1問」を
 * Storage のアクセスルールでは表現できない。
 *
 * そのため S3 へのアクセスはすべて teamFunction（Lambda）に集約し、
 * Lambda が呼び出し元のグループ所属を検証してから署名付き URL を発行する。
 * クライアントは受け取った URL に対して直接 PUT / GET するだけで、
 * aws-amplify/storage のクライアント API は使わない。
 *
 * ここに access ルールを書かないのも意図的。`allow.resource(teamFunction)` で
 * 付与される `media_BUCKET_NAME` 環境変数（SSM 経由で実行時に解決される）が、
 * data のカスタムミューテーションのハンドラを兼ねる関数では Lambda に
 * 載らないことを CI で確認した。Lambda への権限付与とバケット名の受け渡しは
 * backend.ts が CDK で明示的に行う（CognitoGroupAccess と同じパターン）。
 *
 * keepOnDelete: true はテーブルの削除保護（backend.ts §11.7）と同じ方針。
 * スタック削除時にバケットを保持する。sandbox はこの設定に関係なく常に
 * 削除されるため、CI の使い捨て環境（pr-<番号>）の破棄は阻害しない。
 */
export const storage = defineStorage({
  name: 'media',
  keepOnDelete: true,
});
