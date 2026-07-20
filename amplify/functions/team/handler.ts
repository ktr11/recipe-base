import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import {
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { env } from '$amplify/env/team';
import type { Schema } from '../../data/resource';
import { createPersonalTeam, defaultDisplayName } from '../../shared/personal-team';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const cognito = new CognitoIdentityProviderClient();

/**
 * アカウントの自己修復（docs/design.md §2.7）
 *
 * クライアントはサインインのたびにこれを呼ぶのではなく、自分の UserProfile が
 * 存在しないことを検知したときに呼ぶ。postConfirmation の失敗によって生まれる
 * 「確認済みだがチームが無い」ユーザーを救うための経路。
 *
 * 現時点で対応するのは以下の2つ:
 *   1. UserProfile が無い            → 個人チームを新規作成する
 *   2. Cognito グループに未所属      → グループに追加する
 *
 * 設計書 §2.7 が挙げる3つ目のケース（joinTeam の中断により旧チームに
 * レシピが残る）は、joinTeam を実装するステップ10 で追加する。
 * それ以前はこの状態に到達する経路が存在しない。
 */
export const handler: Schema['repairAccount']['functionHandler'] = async (
  event,
) => {
  // Cognito User Pool 由来の identity に絞り込む。
  // 単独の条件では判別できない: 'sub' は OIDC にも、'username' は IAM にも存在する。
  // 両方を持つのは User Pool の identity だけ。
  const identity = event.identity;
  if (!identity || !('username' in identity) || !('claims' in identity)) {
    throw new Error('User Pool による認証が必要です');
  }

  const userId = identity.sub;
  const cognitoUsername = identity.username;
  const email = identity.claims?.email as string | undefined;

  const existing = await client.models.UserProfile.get({ userId });
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
      userPoolId: env.USER_POOL_ID,
      userId,
      cognitoUsername,
      displayName: defaultDisplayName(email),
    });
    console.log(`個人チームを復旧しました: userId=${userId} teamId=${teamId}`);
    return { teamId };
  }

  // 2. UserProfile はあるが Cognito グループに未所属の可能性がある。
  //    AdminAddUserToGroup は冪等で、既に所属していてもエラーにならないため、
  //    所属を確認せずそのまま呼ぶ。
  const teamId = existing.data.teamId;
  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: env.USER_POOL_ID,
      Username: cognitoUsername,
      GroupName: teamId,
    }),
  );

  return { teamId };
};
