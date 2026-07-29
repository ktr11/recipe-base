import type { Schema } from '../../data/resource';
import { createPersonalTeam, defaultDisplayName } from '../../shared/personal-team';
import { type Caller, client, cognito, userPoolId } from './context';
import {
  addToGroup,
  changeMemberCount,
  deleteTeam,
  listUserTeamIds,
  moveTeamData,
  removeFromGroup,
} from './team-data';

/**
 * アカウントの自己修復（docs/design.md §2.7）
 *
 * クライアントはサインインのたびにこれを呼ぶのではなく、自分の UserProfile が
 * 存在しないことを検知したときに呼ぶ。postConfirmation の失敗と joinTeam の
 * 中断、両方からの復旧口になる。
 *
 *   1. UserProfile が無い        → 個人チームを新規作成する
 *   2. Cognito グループに未所属  → グループに追加する
 *   3. 旧チームにデータが残る    → 移送を完了させる（§2.5 手順7 の中断）
 */
export const repairAccount = async (
  caller: Caller,
): Promise<Schema['repairAccount']['returnType']> => {
  const existing = await client.models.UserProfile.get({ userId: caller.userId });
  if (existing.errors) {
    throw new Error(
      `UserProfile の取得に失敗: ${JSON.stringify(existing.errors)}`,
    );
  }

  // 1. UserProfile が無い → 個人チームを作り直す
  if (!existing.data) {
    const teamId = await createPersonalTeam({
      client,
      cognito,
      userPoolId,
      userId: caller.userId,
      cognitoUsername: caller.cognitoUsername,
      displayName: defaultDisplayName(caller.email),
    });
    console.log(`個人チームを復旧しました: userId=${caller.userId} teamId=${teamId}`);
    return { teamId };
  }

  const teamId = existing.data.teamId;

  // 2. AdminAddUserToGroup は冪等で、既に所属していてもエラーにならない。
  //    所属を確認せずそのまま呼ぶ
  await addToGroup(caller.cognitoUsername, teamId);

  // 3. 現在の所属以外のグループが残っていれば、joinTeam が手順7〜11 の
  //    どこかで止まったということ。移送を完了させて旧チームを畳む。
  //    ⚠️ ここで移送してよいのは旧チームが1人チームの場合だけ。他に
  //    メンバーが居るチームのレシピを持ち出さない方針は §2.6 と共通
  for (const staleTeamId of await listUserTeamIds(caller.cognitoUsername)) {
    if (staleTeamId === teamId) continue;

    const stale = await client.models.Team.get({ teamId: staleTeamId });
    if (stale.errors) {
      throw new Error(`旧チームの取得に失敗: ${JSON.stringify(stale.errors)}`);
    }

    if (!stale.data) {
      // Team レコードだけ先に消えている。グループから外して終わり
      await removeFromGroup(caller.cognitoUsername, staleTeamId);
      continue;
    }

    if (stale.data.memberCount <= 1) {
      await moveTeamData(staleTeamId, teamId);
      await deleteTeam(staleTeamId);
    } else {
      await changeMemberCount(staleTeamId, -1);
      await removeFromGroup(caller.cognitoUsername, staleTeamId);
    }
    console.log(
      `中断した参加処理を完了しました: userId=${caller.userId} from=${staleTeamId} to=${teamId}`,
    );
  }

  return { teamId };
};
