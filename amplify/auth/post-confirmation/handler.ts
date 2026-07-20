import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { env } from '$amplify/env/post-confirmation';
import type { Schema } from '../../data/resource';
import { createPersonalTeam, defaultDisplayName } from '../../shared/personal-team';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const cognito = new CognitoIdentityProviderClient();

/**
 * サインアップ確定時に個人チームを生成する（docs/design.md §2.4）
 *
 * ⚠️ このトリガーが失敗しても、ユーザーの確認自体は既に完了している。
 * 例外を投げるとサインアップ API がエラーを返すが、ユーザーは確認済みのまま
 * 残るため、結局「確認済みだがチームが無い」状態は防げない。
 *
 * そのため例外を投げずにログだけ残し、サインアップ自体は成功させる。
 * 復旧はサインイン後の repairAccount が担う（§2.7）。この2つは対で機能する。
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  try {
    const teamId = await createPersonalTeam({
      client,
      cognito,
      userPoolId: event.userPoolId,
      userId: event.request.userAttributes.sub,
      cognitoUsername: event.userName,
      displayName: defaultDisplayName(event.request.userAttributes.email),
    });
    console.log(`個人チームを作成しました: teamId=${teamId}`);
  } catch (error) {
    // ここで throw しないのは意図的。上のコメントを参照。
    console.error(
      '個人チームの作成に失敗しました。repairAccount による復旧が必要です。',
      error,
    );
  }

  return event;
};
