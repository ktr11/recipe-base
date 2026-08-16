import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { env } from '$amplify/env/team';
import type { Schema } from '../../data/resource';

/**
 * teamFunction の共有コンテキスト（docs/design.md §2.2）
 *
 * 4つのミューテーション（repairAccount / issueInviteCode / joinTeam /
 * leaveTeam）が同じ Lambda に同居するため、データクライアントと Cognito
 * クライアントの用意をここに集約する。Amplify.configure はモジュールの
 * 読み込み時に一度だけ実行する必要がある。
 */

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

export const client = generateClient<Schema>();
export const cognito = new CognitoIdentityProviderClient();
export const userPoolId = env.USER_POOL_ID;

/**
 * 呼び出し元。
 *
 * userId（sub）と cognitoUsername（Admin API に渡す値）は由来の異なる値で、
 * 混同しないこと（§2.4）。メールアドレスをサインイン属性にした場合、
 * Cognito は username として UUID を採番し実質 sub と一致するが、
 * その一致に依存した実装をしない。
 */
export type Caller = {
  userId: string;
  cognitoUsername: string;
  email?: string;
};

/**
 * AppSync の identity から呼び出し元を取り出す。
 *
 * Cognito User Pool 由来の identity に絞り込む。単独の条件では判別できない:
 * 'sub' は OIDC にも、'username' は IAM にも存在する。両方を持つのは
 * User Pool の identity だけ。
 */
export const callerFrom = (identity: unknown): Caller => {
  if (
    !identity ||
    typeof identity !== 'object' ||
    !('username' in identity) ||
    !('claims' in identity) ||
    !('sub' in identity)
  ) {
    throw new Error('User Pool による認証が必要です');
  }

  const typed = identity as {
    sub: string;
    username: string;
    claims?: Record<string, unknown>;
  };

  return {
    userId: typed.sub,
    cognitoUsername: typed.username,
    email: typed.claims?.email as string | undefined,
  };
};

/** GraphQL の結果からエラーを検出して例外にする。data が無い場合も含む */
export const unwrap = <T>(
  result: { data?: T | null; errors?: readonly { message: string }[] | null },
  what: string,
): T => {
  if (result.errors && result.errors.length > 0) {
    throw new Error(`${what}に失敗: ${JSON.stringify(result.errors)}`);
  }
  if (result.data == null) {
    throw new Error(`${what}に失敗: 結果が空でした`);
  }
  return result.data;
};

/** 現在の所属チームを得る。UserProfile が無い場合は repairAccount の領域 */
export const currentTeamId = async (userId: string): Promise<string> => {
  const profile = await client.models.UserProfile.get({ userId });
  const data = unwrap(profile, 'UserProfile の取得');
  return data.teamId;
};
