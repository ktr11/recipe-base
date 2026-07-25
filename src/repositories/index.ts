import { fetchAuthSession } from 'aws-amplify/auth';
import { AmplifyRepository } from './amplify-repository';
import { LocalStorageRepository } from './local-storage-repository';
import type { RecipeRepository } from './recipe-repository';

/**
 * 認証状態に応じて使用する Repository を決める（docs/design.md §3.3）
 *
 * ゲストは localStorage、正規ユーザーは DynamoDB。画面コンポーネントは
 * この関数の戻り値だけを見て、データがどこに保存されるかを知らない。
 * 差し替えの分岐はこの1箇所に閉じる。
 *
 * 認証状態の判定は非同期（fetchAuthSession）なので、この関数も Promise を
 * 返す。ゲストは AWS にアクセスせずトークンを持たないため（§5.1）、
 * トークンの有無で分ける。
 */
export const getRepository = async (): Promise<RecipeRepository> => {
  const session = await fetchAuthSession();
  return session.tokens ? new AmplifyRepository() : new LocalStorageRepository();
};

export type { RecipeRepository };
