import type { Schema } from '../../data/resource';
import { callerFrom } from './context';
import { issueInviteCode } from './issue-invite-code';
import { joinTeam } from './join-team';
import { leaveTeam } from './leave-team';
import { repairAccount } from './repair-account';

/**
 * チーム関連のミューテーション（docs/design.md §2.2）
 *
 * 4つのミューテーションを1つの Lambda で受ける。どれも同じ2つの資源
 * （Cognito グループと Team / UserProfile）を触り、joinTeam と repairAccount に
 * 至っては後始末の処理を共有するため、関数を分けると同じコードが写る。
 *
 * どのミューテーションとして呼ばれたかは event.info.fieldName で判別する。
 * 型は「4つの引数型の合併」になるので、分岐した後に引数を取り出す。
 */

type EventOf<K extends keyof Schema> = Schema[K] extends {
  functionHandler: (event: infer E, ...rest: never[]) => unknown;
}
  ? E
  : never;

type TeamEvent =
  | EventOf<'repairAccount'>
  | EventOf<'issueInviteCode'>
  | EventOf<'joinTeam'>
  | EventOf<'leaveTeam'>;

export const handler = async (event: TeamEvent) => {
  const caller = callerFrom(event.identity);

  switch (event.info.fieldName) {
    case 'repairAccount':
      return repairAccount(caller);

    case 'issueInviteCode':
      return issueInviteCode(caller);

    case 'joinTeam': {
      // 合併型のままでは引数を絞り込めない。fieldName で分岐した後なので、
      // ここで joinTeam の引数として読み出す
      const { inviteCode } = event.arguments as Schema['joinTeam']['args'];
      return joinTeam(caller, inviteCode);
    }

    case 'leaveTeam':
      return leaveTeam(caller);

    default:
      throw new Error(`未対応の操作です: ${event.info.fieldName}`);
  }
};
