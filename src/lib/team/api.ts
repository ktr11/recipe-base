import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';

/**
 * チーム操作の入口（docs/design.md §2.3 / §2.5 / §2.6）
 *
 * 参加・離脱・招待コードの発行はすべて Lambda（カスタムミューテーション）が
 * 行う。クライアントから Cognito のグループを触ることはできず、招待コードの
 * 照合もサーバー側でしか行えないため（§2.1 / §2.2）。
 *
 * ⚠️ 参加と離脱の後は必ずトークンを取り直す。**所属の変更は発行済みの
 * トークンに載らない**ので、取り直すまで新しいチームのレシピが読めない。
 */

// generateClient は Amplify.configure の後でしか呼べない（amplify-repository と同じ理由）
let client: ReturnType<typeof generateClient<Schema>> | null = null;
const getClient = () => (client ??= generateClient<Schema>());

export type TeamMember = {
  userId: string;
  displayName: string;
};

export type TeamOverview = {
  teamId: string;
  name: string;
  inviteCode: string | null;
  inviteCodeExpiresAt: string | null;
  members: TeamMember[];
  /** 自分の userId。メンバー一覧で「あなた」を示すために使う */
  myUserId: string;
};

/**
 * エラーがあれば例外にする。
 *
 * Lambda が投げたメッセージ（「招待コードが正しくありません」「有効期限が
 * 切れています」など）をそのまま画面に出す。利用者向けの日本語で書いてあり、
 * ここで言い換えると同じ文言が2箇所に増える。
 */
const throwOnErrors = (
  errors: readonly { message: string }[] | null | undefined,
): void => {
  if (errors && errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join('\n'));
  }
};

export const fetchTeamOverview = async (): Promise<TeamOverview> => {
  const { userId } = await getCurrentUser();

  const profile = await getClient().models.UserProfile.get({ userId });
  throwOnErrors(profile.errors);
  if (!profile.data) {
    throw new Error('チームの情報を取得できませんでした');
  }

  const teamId = profile.data.teamId;

  const [team, members] = await Promise.all([
    getClient().models.Team.get({ teamId }),
    getClient().models.UserProfile.listUserProfileByTeamId({ teamId }),
  ]);
  throwOnErrors(team.errors);
  throwOnErrors(members.errors);
  if (!team.data) {
    throw new Error('チームの情報を取得できませんでした');
  }

  return {
    teamId,
    name: team.data.name,
    inviteCode: team.data.inviteCode ?? null,
    inviteCodeExpiresAt: team.data.inviteCodeExpiresAt ?? null,
    members: (members.data ?? []).map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
    })),
    myUserId: userId,
  };
};

export const issueInviteCode = async (): Promise<{
  inviteCode: string;
  expiresAt: string;
}> => {
  const result = await getClient().mutations.issueInviteCode();
  throwOnErrors(result.errors);
  if (!result.data) {
    throw new Error('招待コードを発行できませんでした');
  }
  return { inviteCode: result.data.inviteCode, expiresAt: result.data.expiresAt };
};

export const joinTeam = async (inviteCode: string): Promise<string> => {
  const result = await getClient().mutations.joinTeam({ inviteCode });
  throwOnErrors(result.errors);
  if (!result.data) {
    throw new Error('チームに参加できませんでした');
  }

  // ⚠️ 必須（§2.5）。旧トークンには新しいグループが入っておらず、
  // 取り直すまで参加先のレシピが1件も読めない
  await fetchAuthSession({ forceRefresh: true });
  return result.data.teamName;
};

export const leaveTeam = async (): Promise<void> => {
  const result = await getClient().mutations.leaveTeam();
  throwOnErrors(result.errors);
  if (!result.data) {
    throw new Error('チームから離脱できませんでした');
  }

  // 離脱側も同じ。取り直さないと、抜けたはずのチームのレシピが見え続ける
  await fetchAuthSession({ forceRefresh: true });
};

/** チーム名の変更。メンバー全員が変更できる（ロールを持たないため / §0） */
export const renameTeam = async (teamId: string, name: string): Promise<void> => {
  const result = await getClient().models.Team.update({ teamId, name });
  throwOnErrors(result.errors);
};

/** 招待コードが今も有効か（§2.3 の1時間） */
export const isInviteCodeValid = (expiresAt: string | null): boolean => {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) && time > Date.now();
};

/** 失効までの残り時間を「あと N分」の形で表す。切り上げる */
export const remainingMinutes = (expiresAt: string): number =>
  Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 60_000));
