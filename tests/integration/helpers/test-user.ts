import { randomUUID } from 'node:crypto';
import {
  AdminAddUserToGroupCommand,
  AdminConfirmSignUpCommand,
  AdminDeleteUserCommand,
  AdminRemoveUserFromGroupCommand,
  DeleteGroupCommand,
  SignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signIn, signOut } from 'aws-amplify/auth';
import { cognito, outputs, userPoolClientId, userPoolId } from './backend';

Amplify.configure(outputs as Parameters<typeof Amplify.configure>[0]);

/** パスワードポリシー（8文字以上・英字と数字）を満たす固定値 */
const PASSWORD = 'testpass123';

export type TestUser = {
  email: string;
  sub: string;
  teamId: string;
  idToken: string;
};

const decodeJwtPayload = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf-8'));

/**
 * テスト用ユーザーを作り、個人チームが生成された状態にする。
 *
 * AdminCreateUser ではなく SignUp + AdminConfirmSignUp を使うのが要点。
 * postConfirmation トリガーは確認処理で発火するため、AdminCreateUser では
 * 個人チームが作られず、検証したい状態にならない。
 *
 * メールは example.com 宛のダミー。Cognito は送信を試みるが、
 * テストは受信を必要としない（確認は Admin API で行う）。
 */
export const createTestUser = async (): Promise<TestUser> => {
  const email = `authz-test-${randomUUID()}@example.com`;

  const signUpResult = await cognito.send(
    new SignUpCommand({
      ClientId: userPoolClientId,
      Username: email,
      Password: PASSWORD,
      UserAttributes: [{ Name: 'email', Value: email }],
    }),
  );

  // ここで postConfirmation が発火し、個人チームが生成される
  await cognito.send(
    new AdminConfirmSignUpCommand({ UserPoolId: userPoolId, Username: email }),
  );

  const idToken = await signInAs(email);
  const claims = decodeJwtPayload(idToken);
  const groups = (claims['cognito:groups'] as string[] | undefined) ?? [];

  if (groups.length !== 1) {
    throw new Error(
      `個人チームのグループが1つだけ付与されているはずが ${groups.length} 個でした: ${JSON.stringify(groups)}`,
    );
  }

  return {
    email,
    sub: signUpResult.UserSub as string,
    teamId: groups[0],
    idToken,
  };
};

/**
 * サインインして ID トークンを取得する。
 *
 * App Client が SRP しか許可していないため Amplify の signIn を使う。
 * テストのために ALLOW_USER_PASSWORD_AUTH を有効化するのは、
 * 本番の認証設定を緩めることになるので採らない。
 *
 * Amplify のセッションはプロセス内で1つなので、取得後は必ずサインアウトし、
 * 以降は取り出した文字列としてのトークンだけを使う。
 */
const signInAs = async (email: string): Promise<string> => {
  await signOut().catch(() => {
    /* 未サインインなら何もしなくてよい */
  });

  await signIn({ username: email, password: PASSWORD });
  const session = await fetchAuthSession({ forceRefresh: true });
  const idToken = session.tokens?.idToken?.toString();

  await signOut();

  if (!idToken) {
    throw new Error(`ID トークンを取得できませんでした: ${email}`);
  }
  return idToken;
};

/**
 * 別のユーザーを、指定チームのメンバーにする。
 *
 * joinTeam はステップ10 で実装するため、現時点では Cognito グループの
 * 付け替えを直接行って「同じチームに2人いる」状態を作る。
 * joinTeam が行う処理のうち、認可に効く部分だけを再現している。
 */
export const moveUserToTeam = async (
  user: TestUser,
  teamId: string,
): Promise<TestUser> => {
  await cognito.send(
    new AdminRemoveUserFromGroupCommand({
      UserPoolId: userPoolId,
      Username: user.email,
      GroupName: user.teamId,
    }),
  );
  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: user.email,
      GroupName: teamId,
    }),
  );

  // グループ変更はトークンに即座には反映されない。取り直す必要がある。
  const idToken = await signInAs(user.email);
  return { ...user, teamId, idToken };
};

/** テストで作ったユーザーと、その個人チームの Cognito グループを削除する */
export const deleteTestUser = async (user: TestUser): Promise<void> => {
  await cognito
    .send(
      new AdminDeleteUserCommand({
        UserPoolId: userPoolId,
        Username: user.email,
      }),
    )
    .catch(() => {
      /* 後片付けの失敗はテスト結果に影響させない */
    });

  await cognito
    .send(
      new DeleteGroupCommand({
        UserPoolId: userPoolId,
        GroupName: user.teamId,
      }),
    )
    .catch(() => {
      /* 同上 */
    });
};
