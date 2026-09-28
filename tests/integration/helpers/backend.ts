import { readFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { S3Client } from '@aws-sdk/client-s3';

/**
 * デプロイ済み sandbox への接続情報
 *
 * 統合テストは実際にデプロイされたバックエンドに対して実行する（docs/design.md §10.2）。
 * 認可はモックでは何も証明できないため、ここだけは実環境を相手にする。
 */
type AmplifyOutputs = {
  auth: { user_pool_id: string; user_pool_client_id: string };
  data: { url: string; aws_region: string };
  storage?: { bucket_name: string; aws_region: string };
};

const loadOutputs = (): AmplifyOutputs => {
  try {
    return JSON.parse(
      readFileSync(new URL('../../../amplify_outputs.json', import.meta.url), 'utf-8'),
    ) as AmplifyOutputs;
  } catch {
    throw new Error(
      'amplify_outputs.json が見つかりません。' +
        '統合テストの実行前に `pnpm exec ampx sandbox` でバックエンドをデプロイしてください。',
    );
  }
};

export const outputs = loadOutputs();

export const region = outputs.data.aws_region;
export const userPoolId = outputs.auth.user_pool_id;
export const userPoolClientId = outputs.auth.user_pool_client_id;
export const graphqlUrl = outputs.data.url;

export const cognito = new CognitoIdentityProviderClient({ region });
export const dynamodb = new DynamoDBClient({ region });
export const s3 = new S3Client({ region });

/**
 * レシピ画像のバケット名。
 *
 * クライアント（署名付き URL 経由）では検証できない「オブジェクトが本当に
 * 消えたか」の確認にだけ、管理者権限で S3 を直接見る。
 */
export const mediaBucketName = (): string => {
  const name = outputs.storage?.bucket_name;
  if (!name) {
    throw new Error(
      'amplify_outputs.json に storage がありません。' +
        'storage を含むバックエンドをデプロイし直してください。',
    );
  }
  return name;
};
