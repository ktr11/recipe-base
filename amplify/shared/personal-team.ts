import { randomUUID } from 'node:crypto';
import {
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient,
  CreateGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { generateClient } from 'aws-amplify/data';
import type { Schema } from '../data/resource';

export type DataClient = ReturnType<typeof generateClient<Schema>>;

/**
 * 個人チームの生成（docs/design.md §2.4）
 *
 * サインアップ時（postConfirmation）と、自己修復時（repairAccount）の
 * 両方から呼ばれるため共有モジュールに置く。
 *
 * 設計上、全ユーザーは常に何らかのチームに属する。「個人」はメンバー1人の
 * チームとして表現され、専用の概念を持たない（§0 変更点2）。
 *
 * Cognito のグループ名は teamId の値そのものにする。これにより全モデルの
 * 認可が allow.groupDefinedIn('teamId') の1本に統一される（§1.2）。
 */
export const createPersonalTeam = async (params: {
  client: DataClient;
  cognito: CognitoIdentityProviderClient;
  userPoolId: string;
  /** Cognito の sub。UserProfile.userId に入る値 */
  userId: string;
  /**
   * Cognito の username。Admin API に渡す値。
   *
   * sub とは別物として扱う。メールアドレスをサインイン属性にした場合、
   * Cognito は username として UUID を採番し実質 sub と一致するが、
   * それに依存せず、それぞれ由来の正しい値を使う。
   */
  cognitoUsername: string;
  displayName: string;
}): Promise<string> => {
  const { client, cognito, userPoolId, userId, cognitoUsername, displayName } =
    params;

  const teamId = randomUUID();

  // 先にグループを作成してユーザーを所属させる。
  // レコード作成より権限付与を先に行うことで、途中で失敗しても
  // 「データはあるが読めない」状態にならないようにする（§2.5）。
  await cognito.send(
    new CreateGroupCommand({
      UserPoolId: userPoolId,
      GroupName: teamId,
      Description: `Team ${teamId}`,
    }),
  );

  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: cognitoUsername,
      GroupName: teamId,
    }),
  );

  const team = await client.models.Team.create({
    teamId,
    name: 'マイレシピ',
    memberCount: 1,
  });
  if (team.errors) {
    throw new Error(`Team の作成に失敗: ${JSON.stringify(team.errors)}`);
  }

  const profile = await client.models.UserProfile.create({
    userId,
    teamId,
    displayName,
    theme: 'light',
  });
  if (profile.errors) {
    throw new Error(
      `UserProfile の作成に失敗: ${JSON.stringify(profile.errors)}`,
    );
  }

  return teamId;
};

/** メールアドレスから既定の表示名を作る（ローカル部を使う） */
export const defaultDisplayName = (email: string | undefined): string =>
  email?.split('@')[0] || 'ユーザー';
