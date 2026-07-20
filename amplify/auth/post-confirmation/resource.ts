import { defineFunction } from '@aws-amplify/backend';

/**
 * サインアップ確定時に個人チームを生成するトリガー（docs/design.md §2.4）
 *
 * resourceGroupName: 'auth' を指定している理由:
 * この関数は auth のトリガーでありながら、User Pool への Admin API 権限と
 * data へのアクセス権を必要とする。既定のスタック配置のままだと
 * auth → function → auth の循環参照になりデプロイできない。
 * auth スタックに同居させることで解消する。
 */
export const postConfirmation = defineFunction({
  name: 'post-confirmation',
  resourceGroupName: 'auth',
});
