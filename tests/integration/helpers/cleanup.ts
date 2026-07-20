import { DeleteItemCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { dynamodb } from './backend';

/**
 * テストが作った DynamoDB のレコードを消す。
 *
 * Team は認可上メンバーでも削除できず（read / update のみ）、
 * UserProfile も同様に削除経路が無いため、GraphQL 経由では消せない。
 * 放置すると sandbox にテスト実行のたびにゴミが溜まるので、
 * 後片付けに限りテーブルを直接操作する。
 */
let tableCache: Record<string, string> | null = null;

const resolveTableNames = async (): Promise<Record<string, string>> => {
  if (tableCache) return tableCache;

  const { TableNames = [] } = await dynamodb.send(new ListTablesCommand({}));
  const find = (model: string) => {
    const name = TableNames.find((t) => t.startsWith(`${model}-`));
    if (!name) throw new Error(`${model} のテーブルが見つかりません`);
    return name;
  };

  tableCache = {
    Team: find('Team'),
    UserProfile: find('UserProfile'),
  };
  return tableCache;
};

export const deleteTeamRecords = async (params: {
  teamId: string;
  userId: string;
}): Promise<void> => {
  const tables = await resolveTableNames();

  await Promise.all([
    dynamodb.send(
      new DeleteItemCommand({
        TableName: tables.Team,
        Key: { teamId: { S: params.teamId } },
      }),
    ),
    dynamodb.send(
      new DeleteItemCommand({
        TableName: tables.UserProfile,
        Key: { userId: { S: params.userId } },
      }),
    ),
  ]).catch(() => {
    /* 後片付けの失敗はテスト結果に影響させない */
  });
};
