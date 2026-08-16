import type { Schema } from '../../data/resource';
import { normalizeInviteCode } from '../../shared/invite-code';
import { type Caller, client, currentTeamId, unwrap } from './context';
import {
  addToGroup,
  changeMemberCount,
  deleteTeam,
  moveTeamData,
  removeFromGroup,
} from './team-data';

/** 1チームの上限（§2.5 手順4） */
const MAX_MEMBERS = 20;

/**
 * 招待コードによるチーム参加（docs/design.md §2.5）
 *
 * ⚠️ **この順序に意味がある。** 権限の付与（手順6）をデータの移送（手順7）
 * より先に置くことで、途中で失敗してもユーザーは新旧どちらかのグループに
 * 必ず所属している状態が保たれ、自分のデータに触れなくなる事態を避けられる。
 *
 * 中断した場合は一部のレシピが旧チームに残る。ユーザーからは「レシピが
 * 減った」ように見える状態で、repairAccount が残りを拾って完了させる（§2.7）。
 */
export const joinTeam = async (
  caller: Caller,
  rawInviteCode: string,
): Promise<Schema['joinTeam']['returnType']> => {
  const inviteCode = normalizeInviteCode(rawInviteCode);

  // 2. 招待コードでチームを引く。クライアントには Team を読む権限が無いため、
  //    この照合は原理的にサーバー側でしか行えない（§2.1）
  const found = await client.models.Team.listTeamByInviteCode({ inviteCode });
  if (found.errors) {
    throw new Error(`招待コードの照合に失敗: ${JSON.stringify(found.errors)}`);
  }
  const team = found.data[0];
  if (!team) {
    throw new Error('招待コードが正しくありません');
  }

  // 3. 有効期限（§2.3）。DynamoDB の TTL は削除が最大48時間遅れるため
  //    判定に使えない。ここで明示的に比較することが唯一の正解
  const expiresAt = team.inviteCodeExpiresAt
    ? Date.parse(team.inviteCodeExpiresAt)
    : Number.NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('招待コードの有効期限が切れています');
  }

  // 4. 満員
  if (team.memberCount >= MAX_MEMBERS) {
    throw new Error('このチームは満員です');
  }

  // 5. 既に参加済み
  const previousTeamId = await currentTeamId(caller.userId);
  if (previousTeamId === team.teamId) {
    throw new Error('既にこのチームに参加しています');
  }

  const previous = unwrap(
    await client.models.Team.get({ teamId: previousTeamId }),
    '現在のチームの取得',
  );
  // 旧チームに他のメンバーが居る場合、レシピは持ち出さない。
  // 設計書 §2.5 手順7 は旧チームが1人チームである前提で書かれているが、
  // 家族チームに居るメンバーが別のチームへ移る経路があるため実際には起こる。
  // その場合に全件移すと、残るメンバーからレシピを奪うことになる。
  // 離脱時に持ち出さない方針（§2.6）と揃える
  const wasAlone = previous.memberCount <= 1;

  // 6. 先に権限を付与する
  await addToGroup(caller.cognitoUsername, team.teamId);

  // 7. 1人チームだった場合だけ、レシピとラベルを移送する
  if (wasAlone) {
    await moveTeamData(previousTeamId, team.teamId);
  }

  // 8. 所属の付け替え
  unwrap(
    await client.models.UserProfile.update({
      userId: caller.userId,
      teamId: team.teamId,
    }),
    'UserProfile の更新',
  );

  // 9. 参加先の人数を増やす
  await changeMemberCount(team.teamId, 1);

  // 10/11. 旧チームの後始末。
  //   1人チームだった場合はチームごと消える。グループを消せば所属も消えるため、
  //   AdminRemoveUserFromGroup は呼ばない（消えたグループを指定すると失敗する）
  if (wasAlone) {
    await deleteTeam(previousTeamId);
  } else {
    await changeMemberCount(previousTeamId, -1);
    await removeFromGroup(caller.cognitoUsername, previousTeamId);
  }

  return { teamId: team.teamId, teamName: team.name };
};
