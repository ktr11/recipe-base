import { defineFunction } from '@aws-amplify/backend';

/**
 * チーム関連のカスタムミューテーションを処理する Lambda
 *
 * 現時点では repairAccount のみ。実装順序ステップ10 で joinTeam /
 * leaveTeam / issueInviteCode を同じ関数に追加する（docs/design.md §2.2）。
 *
 * postConfirmation と異なり auth のトリガーではないため、
 * resourceGroupName の指定は不要（data スタックに置かれ、data は既に
 * auth に依存しているため新たな循環は生じない）。
 */
export const teamFunction = defineFunction({
  name: 'team',
});
