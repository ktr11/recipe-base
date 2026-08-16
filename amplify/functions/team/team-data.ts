import {
  AdminAddUserToGroupCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  DeleteGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { client, cognito, unwrap, userPoolId } from './context';

/**
 * チームに紐づくデータの操作（docs/design.md §2.5 / §2.6）
 *
 * joinTeam と leaveTeam が共通して必要とする、レシピ・ラベルの移送と
 * 後始末をまとめる。Lambda は IAM 認可で動くため、どのチームのデータにも
 * 触れる。**触ってよい範囲の判断は呼び出し側の責務**である。
 */

type Page<T> = {
  data: T[];
  nextToken?: string | null;
  errors?: readonly { message: string }[] | null;
};

const listAll = async <T>(page: (nextToken?: string) => Promise<Page<T>>) => {
  const all: T[] = [];
  let nextToken: string | undefined;
  do {
    const result = await page(nextToken);
    if (result.errors && result.errors.length > 0) {
      throw new Error(`一覧の取得に失敗: ${JSON.stringify(result.errors)}`);
    }
    all.push(...result.data);
    nextToken = result.nextToken ?? undefined;
  } while (nextToken);
  return all;
};

const teamRecipes = (teamId: string) =>
  listAll((nextToken) =>
    client.models.Recipe.listRecipeByTeamId({ teamId }, { nextToken, limit: 200 }),
  );

const teamLabels = (teamId: string) =>
  listAll((nextToken) =>
    client.models.Label.listLabelByTeamId({ teamId }, { nextToken, limit: 200 }),
  );

/**
 * レシピとラベルの所属を移す（§2.5 手順7）
 *
 * 途中で失敗すると一部が旧チームに残る。この状態はユーザーからは
 * 「レシピが減った」ように見えるため、repairAccount が残りを拾って
 * 移送を完了させる（§2.7）。
 */
export const moveTeamData = async (from: string, to: string): Promise<void> => {
  for (const recipe of await teamRecipes(from)) {
    unwrap(
      await client.models.Recipe.update({ id: recipe.id, teamId: to }),
      'レシピの移送',
    );
  }
  for (const label of await teamLabels(from)) {
    unwrap(
      await client.models.Label.update({ id: label.id, teamId: to }),
      'ラベルの移送',
    );
  }
};

/** 誰も居なくなったチームのデータを消す（§2.6 手順5） */
export const deleteTeamData = async (teamId: string): Promise<void> => {
  for (const recipe of await teamRecipes(teamId)) {
    unwrap(await client.models.Recipe.delete({ id: recipe.id }), 'レシピの削除');
  }
  for (const label of await teamLabels(teamId)) {
    unwrap(await client.models.Label.delete({ id: label.id }), 'ラベルの削除');
  }
};

/**
 * チームのレコードと Cognito グループを消す。
 *
 * グループの削除は所属者が居なくなってから行う。順序を誤ると、
 * 所属したまま存在しないグループを指すユーザーが生まれる。
 */
export const deleteTeam = async (teamId: string): Promise<void> => {
  unwrap(await client.models.Team.delete({ teamId }), 'Team の削除');
  await cognito.send(
    new DeleteGroupCommand({ UserPoolId: userPoolId, GroupName: teamId }),
  );
};

/** グループに追加する。冪等で、既に所属していてもエラーにならない */
export const addToGroup = async (
  cognitoUsername: string,
  teamId: string,
): Promise<void> => {
  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: cognitoUsername,
      GroupName: teamId,
    }),
  );
};

/**
 * ユーザーが所属するグループ（＝チーム）の一覧。
 *
 * 1ユーザー1チームが原則なので、2つ以上返るのは joinTeam が途中で
 * 中断した痕跡になる（§2.7 の復旧に使う）。
 */
export const listUserTeamIds = async (
  cognitoUsername: string,
): Promise<string[]> => {
  const result = await cognito.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: userPoolId,
      Username: cognitoUsername,
      Limit: 60,
    }),
  );
  return (result.Groups ?? [])
    .map((group) => group.GroupName)
    .filter((name): name is string => Boolean(name));
};

export const removeFromGroup = async (
  cognitoUsername: string,
  teamId: string,
): Promise<void> => {
  await cognito.send(
    new AdminRemoveUserFromGroupCommand({
      UserPoolId: userPoolId,
      Username: cognitoUsername,
      GroupName: teamId,
    }),
  );
};

/**
 * メンバー数を増減する。増減後の値を返す。
 *
 * DynamoDB のアトミックカウンタは Amplify のデータクライアントからは
 * 使えないため、読んでから書く。家族規模で同時参加が競合する状況は
 * 現実的に発生せず、ずれても memberCount は上限判定の目安にしか
 * 使わないため、この単純さを採る。
 */
export const changeMemberCount = async (
  teamId: string,
  delta: number,
): Promise<number> => {
  const team = unwrap(await client.models.Team.get({ teamId }), 'Team の取得');
  const next = Math.max(0, team.memberCount + delta);
  unwrap(
    await client.models.Team.update({ teamId, memberCount: next }),
    'memberCount の更新',
  );
  return next;
};
