import type { Schema } from '../../data/resource';
import { callerFrom } from './context';
import { deleteImage, getImageUploadUrl, getImageViewUrls } from './images';
import { issueInviteCode } from './issue-invite-code';
import { joinTeam } from './join-team';
import { leaveTeam } from './leave-team';
import { repairAccount } from './repair-account';

/**
 * チーム関連のミューテーション（docs/design.md §2.2）
 *
 * チームの4ミューテーションと画像の3操作を1つの Lambda で受ける。どれも
 * 「呼び出し元のチーム所属」を軸にした検証を共有し、joinTeam と repairAccount に
 * 至っては後始末の処理を共有するため、関数を分けると同じコードが写る。
 * 画像操作が同居するのは、S3 に触れる権限を持つのがこの Lambda だけだから（§7.1）。
 *
 * どのミューテーションとして呼ばれたかは fieldName で判別する。
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
  | EventOf<'leaveTeam'>
  | EventOf<'getImageUploadUrl'>
  | EventOf<'getImageViewUrls'>
  | EventOf<'deleteImage'>;

/**
 * 呼ばれた操作の名前を取り出す。
 *
 * ⚠️ **型と実際の payload が食い違っている。** aws-lambda の
 * AppSyncResolverEvent 型は info.fieldName を持つが、Amplify が生成する
 * 直接 Lambda リゾルバは payload の直下に fieldName を置き、info を渡さない。
 * 型を信じて event.info.fieldName を読むと、全ミューテーションが
 * 「Cannot read properties of undefined」で落ちる（実際に落ちた）。
 *
 * 判別できない場合に payload のキーを添えて投げるのは、次に形が変わったとき
 * 統合テストの1往復（sandbox のデプロイを含む）を無駄にしないため。
 */
const fieldNameOf = (event: TeamEvent): string => {
  const payload = event as unknown as {
    fieldName?: string;
    info?: { fieldName?: string };
  };
  const fieldName = payload.fieldName ?? payload.info?.fieldName;
  if (!fieldName) {
    throw new Error(
      `呼び出された操作を判別できません: keys=${Object.keys(payload).join(',')}`,
    );
  }
  return fieldName;
};

export const handler = async (event: TeamEvent) => {
  const caller = callerFrom(event.identity);
  const fieldName = fieldNameOf(event);

  switch (fieldName) {
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

    case 'getImageUploadUrl':
      return getImageUploadUrl(caller);

    case 'getImageViewUrls': {
      const { keys } = event.arguments as Schema['getImageViewUrls']['args'];
      return getImageViewUrls(caller, keys);
    }

    case 'deleteImage': {
      const { key } = event.arguments as Schema['deleteImage']['args'];
      return deleteImage(caller, key);
    }

    default:
      throw new Error(`未対応の操作です: ${fieldName}`);
  }
};
