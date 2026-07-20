import { graphqlUrl } from './backend';

export type GraphQLResult<T> = {
  data: T | null;
  errors?: { message: string; errorType?: string }[];
};

/**
 * ID トークンを直接付けて AppSync を叩く。
 *
 * Amplify の generated client を経由しないのは意図的。
 * 検証したいのは「サーバー側で認可が強制されているか」であり、
 * クライアントライブラリの絞り込みを挟むと、何が守っているのかが
 * 分からなくなるため。トークン以外に何も信頼しない形で叩く。
 */
export const gql = async <T>(
  idToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GraphQLResult<T>> => {
  const response = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: idToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  return (await response.json()) as GraphQLResult<T>;
};

/** 認可エラーかどうか。AppSync は Unauthorized を errorType で返す */
export const isUnauthorized = (result: GraphQLResult<unknown>): boolean =>
  (result.errors ?? []).some(
    (e) =>
      e.errorType === 'Unauthorized' ||
      /unauthorized|not authorized/i.test(e.message),
  );
