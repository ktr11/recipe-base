// amplify_outputs.json が無い環境でも `next build` を通すためのプレースホルダを用意する。
//
// このファイルは `ampx sandbox` がデプロイ時に生成するもので、接続先が
// 環境ごとに異なるため .gitignore 対象になっている。一方フロントエンドは
// これを静的インポートするため、ファイルが無いとビルドが失敗する。
//
// AWS 認証情報を持たない CI（.github/workflows/ci.yml）はデプロイできないので、
// ビルドの前にこのスクリプトでダミーを置く。ビルドと型検査を通すことだけが
// 目的であり、この設定で実際にアプリが動作するわけではない。
//
// 既にファイルがある場合は何もしない。手元の本物を壊さないため。
import { existsSync, writeFileSync } from 'node:fs';

const OUTPUTS_PATH = new URL('../amplify_outputs.json', import.meta.url);

if (existsSync(OUTPUTS_PATH)) {
  console.log('amplify_outputs.json は既に存在します。何もしません。');
  process.exit(0);
}

const placeholder = {
  version: '1.4',
  auth: {
    user_pool_id: 'placeholder_pool_id',
    aws_region: 'ap-northeast-1',
    user_pool_client_id: 'placeholderclientid',
    identity_pool_id: 'ap-northeast-1:00000000-0000-0000-0000-000000000000',
    username_attributes: ['email'],
    user_verification_types: ['email'],
    unauthenticated_identities_enabled: false,
    mfa_methods: [],
    mfa_configuration: 'NONE',
    standard_required_attributes: ['email'],
    groups: [],
    password_policy: {
      min_length: 8,
      require_lowercase: true,
      require_numbers: true,
      require_symbols: false,
      require_uppercase: false,
    },
  },
  data: {
    url: 'https://placeholder.appsync-api.ap-northeast-1.amazonaws.com/graphql',
    aws_region: 'ap-northeast-1',
    default_authorization_type: 'AMAZON_COGNITO_USER_POOLS',
    authorization_types: ['AWS_IAM'],
    model_introspection: { version: 1, models: {}, enums: {}, nonModels: {} },
  },
};

writeFileSync(OUTPUTS_PATH, `${JSON.stringify(placeholder, null, 2)}\n`);
console.warn(
  'amplify_outputs.json が無いため、ビルド用のプレースホルダを生成しました。' +
    'このままではアプリは動作しません。開発するには `pnpm exec ampx sandbox` を実行してください。',
);
