import type { Schema } from '../../data/resource';
import { INVITE_CODE_TTL_MS, generateInviteCode } from '../../shared/invite-code';
import { type Caller, client, currentTeamId, unwrap } from './context';

/**
 * 招待コードの発行（docs/design.md §2.3）
 *
 * メンバー全員が発行できる。チーム内にロールの概念を持たないため（§0）。
 *
 * Team.inviteCode は1フィールドしかないので、**再発行すると旧コードは
 * 自動的に無効になる**。これは仕様であって実装の都合ではない。漏れたコードを
 * 失効させたいときは、もう一度発行すればよい。
 */
export const issueInviteCode = async (
  caller: Caller,
): Promise<Schema['issueInviteCode']['returnType']> => {
  const teamId = await currentTeamId(caller.userId);

  const inviteCode = generateInviteCode();
  const expiresAt = new Date(Date.now() + INVITE_CODE_TTL_MS).toISOString();

  unwrap(
    await client.models.Team.update({
      teamId,
      inviteCode,
      inviteCodeExpiresAt: expiresAt,
    }),
    '招待コードの発行',
  );

  return { inviteCode, expiresAt };
};
