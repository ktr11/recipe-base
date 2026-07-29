import type { Schema } from '../../data/resource';
import { createTeamWithGroup } from '../../shared/personal-team';
import { type Caller, client, cognito, currentTeamId, unwrap, userPoolId } from './context';
import {
  changeMemberCount,
  deleteTeam,
  deleteTeamData,
  removeFromGroup,
} from './team-data';

/**
 * チームからの離脱（docs/design.md §2.6）
 *
 * **離脱者はレシピを一切持ち出さない**（確定事項）。新しい個人チームに移り、
 * それまでのレシピはチームに残る。UI 側でこれを明示する確認モーダルが
 * 必須になる。無いと「誤操作で自分のレシピを失った」という事故になる。
 *
 * 手順1〜3（新チームを作って所属を移す）を先に済ませるのは、途中で失敗しても
 * ユーザーが必ずどこかのチームに属している状態を保つため。
 */
export const leaveTeam = async (
  caller: Caller,
): Promise<Schema['leaveTeam']['returnType']> => {
  const previousTeamId = await currentTeamId(caller.userId);

  // 1-2. 新しい個人チームを作り、グループに所属させる
  const teamId = await createTeamWithGroup({
    client,
    cognito,
    userPoolId,
    cognitoUsername: caller.cognitoUsername,
  });

  // 3. 所属の付け替え
  unwrap(
    await client.models.UserProfile.update({ userId: caller.userId, teamId }),
    'UserProfile の更新',
  );

  // 4. 旧チームの人数を減らす
  const remaining = await changeMemberCount(previousTeamId, -1);

  // 5. 誰も居なくなったチームは、データごと消す。
  //    残す意味が無く、放置すると誰にも読めないレコードが増え続ける
  if (remaining === 0) {
    await deleteTeamData(previousTeamId);
    // グループを消せば所属も消えるため、removeFromGroup は呼ばない
    await deleteTeam(previousTeamId);
  } else {
    // 6. 旧グループから外す。ここを忘れると、離脱したはずのチームの
    //    レシピが読めたままになる
    await removeFromGroup(caller.cognitoUsername, previousTeamId);
  }

  return { teamId };
};
