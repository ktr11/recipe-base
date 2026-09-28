// 開発用の確認済みテストユーザーを作る。
//
// 使い方: node scripts/create-dev-user.mjs <名前>
// 例:     node scripts/create-dev-user.mjs alice
//         → dev-alice@example.com / devpass123 の確認済みユーザーができる
//
// サインアップ自体はローカルでも本物が動くが、メール確認の手間があるため、
// 統合テスト（tests/integration/helpers/test-user.ts）と同じ
// SignUp + AdminConfirmSignUp で確認済みの状態まで進める。確認の時点で
// postConfirmation が発火し、個人チームも通常どおり生成される。
//
// - 作成先は amplify_outputs.json が指す環境（＝手元の sandbox）
// - AdminConfirmSignUp は Admin API なので、実行にはローカルの AWS 資格情報が
//   必要（sandbox をデプロイできる環境なら揃っている）
// - 作ったユーザーは sandbox に残るので、一度作れば使い回せる
// - メールは example.com 宛のダミー。Cognito は送信を試みるが届かなくてよい
import { readFileSync } from 'node:fs';
import {
  AdminConfirmSignUpCommand,
  CognitoIdentityProviderClient,
  SignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';

/** パスワードポリシー（8文字以上・英字と数字）を満たす固定値 */
const PASSWORD = 'devpass123';

const name = process.argv[2];
if (!name || !/^[a-z0-9-]+$/.test(name)) {
  console.error('使い方: node scripts/create-dev-user.mjs <名前>');
  console.error('  名前は英小文字・数字・ハイフンのみ。メールアドレスの一部になる。');
  process.exit(1);
}

let outputs;
try {
  outputs = JSON.parse(
    readFileSync(new URL('../amplify_outputs.json', import.meta.url), 'utf-8'),
  );
} catch {
  console.error(
    'amplify_outputs.json がありません。先に `pnpm exec ampx sandbox` でデプロイしてください。',
  );
  process.exit(1);
}

const {
  user_pool_id: userPoolId,
  user_pool_client_id: clientId,
  aws_region: region,
} = outputs.auth;

if (userPoolId === 'placeholder_pool_id') {
  console.error(
    'amplify_outputs.json が CI 用のプレースホルダです。' +
      '`pnpm exec ampx sandbox` で本物に置き換えてください。',
  );
  process.exit(1);
}

const email = `dev-${name}@example.com`;
const cognito = new CognitoIdentityProviderClient({ region });

try {
  await cognito.send(
    new SignUpCommand({
      ClientId: clientId,
      Username: email,
      Password: PASSWORD,
      UserAttributes: [{ Name: 'email', Value: email }],
    }),
  );
} catch (error) {
  if (error.name === 'UsernameExistsException') {
    console.log(`${email} は既に存在します。そのままサインインできます。`);
    console.log(`  メールアドレス: ${email}`);
    console.log(`  パスワード:     ${PASSWORD}`);
    process.exit(0);
  }
  throw error;
}

// ここで postConfirmation が発火し、個人チームが生成される
await cognito.send(
  new AdminConfirmSignUpCommand({ UserPoolId: userPoolId, Username: email }),
);

console.log('確認済みのテストユーザーを作成しました。');
console.log(`  メールアドレス: ${email}`);
console.log(`  パスワード:     ${PASSWORD}`);
console.log('チーム機能を試すときは、シークレットウィンドウで別ユーザーとしてサインインすると1台で確認できる。');
