import { fetchAuthSession } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { Ingredient, Label, Recipe, RecipeInput } from '@/lib/recipes/types';
import type { RecipeRepository } from './recipe-repository';

/**
 * 正規ユーザー用の実装（docs/design.md §3.3 / §8）
 *
 * LocalStorageRepository と同じ RecipeRepository の契約を満たす。画面
 * コンポーネントはどちらが使われているかを知らず、切り替えは getRepository
 * だけが行う（§3.3）。
 *
 * ⚠️ トライアル制限は持たない（§4.2）。上限はゲストのローカルデータにだけ
 * 課すもので、正規ユーザーには一切の上限が無い。サーバー側での強制も不要。
 *
 * DynamoDB 側の Recipe は teamId / imageKey / createdAt など画面が知らない
 * フィールドを持つ。ここが唯一その差を吸収する境界であり、読み出しでは
 * 画面向けの Recipe 型へ、書き込みでは teamId を補って DynamoDB 側へ変換する。
 */

// generateClient は Amplify.configure の後でしか呼べない。モジュール読み込み
// 時点では設定が済んでいないことがあるため、初回利用時に遅延生成する。
let client: ReturnType<typeof generateClient<Schema>> | null = null;
const getClient = () => (client ??= generateClient<Schema>());

type RecipeModel = Schema['Recipe']['type'];
type LabelModel = Schema['Label']['type'];

/**
 * 現在のユーザーの teamId を取得する。
 *
 * teamId は所属する Cognito グループ名そのもの（§1.2）で、1ユーザーは常に
 * ちょうど1つのチームに属する。グループが無いのは post-confirmation の失敗で
 * 「確認済みだがチームが無い」状態に陥ったケースで、その場合は repairAccount
 * による修復が必要になる（§2.7）。ここでは書き込み先が定まらないため中断する。
 */
const currentTeamId = async (): Promise<string> => {
  const session = await fetchAuthSession();
  const groups = session.tokens?.idToken?.payload['cognito:groups'];
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error(
      'チームに所属していません。アカウントの修復が必要です（§2.7）。',
    );
  }
  return String(groups[0]);
};

/** DynamoDB の Recipe を画面向けの Recipe 型へ変換する */
const toRecipe = (model: RecipeModel): Recipe => ({
  id: model.id,
  title: model.title,
  url: model.url ?? null,
  servings: model.servings,
  ingredients: (model.ingredients ?? [])
    .filter((i): i is NonNullable<typeof i> => i != null)
    .map(
      (i): Ingredient => ({
        name: i.name,
        quantity: i.quantity ?? null,
        unit: i.unit ?? null,
      }),
    ),
  // 存在しない labelId を残さないための最終防衛線は表示側にあるが（§1.6）、
  // 配列内の null は型の都合で生じ得るのでここで落としておく
  labelIds: (model.labelIds ?? []).filter((id): id is string => id != null),
  memo: model.memo ?? null,
  updatedAt: model.updatedAt,
});

const toLabel = (model: LabelModel): Label => ({
  id: model.id,
  name: model.name,
});

/** 作成・更新で DynamoDB に渡すフィールド。teamId は呼び出し側で補う */
const writeFields = (input: RecipeInput) => ({
  title: input.title,
  url: input.url,
  servings: input.servings,
  ingredients: input.ingredients,
  labelIds: input.labelIds,
  memo: input.memo,
});

type Page<T> = {
  data: T[];
  nextToken?: string | null;
  errors?: readonly { message: string }[] | null;
};

/** ページングを辿って全件を取得する。全件をクライアントに載せる方針（§1.5） */
const listAll = async <T>(
  page: (nextToken?: string) => Promise<Page<T>>,
): Promise<T[]> => {
  const all: T[] = [];
  let nextToken: string | undefined;
  do {
    const result = await page(nextToken);
    throwOnErrors(result.errors);
    all.push(...result.data);
    nextToken = result.nextToken ?? undefined;
  } while (nextToken);
  return all;
};

const throwOnErrors = (errors?: readonly { message: string }[] | null): void => {
  if (errors && errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join('; '));
  }
};

const mustExist = <T>(data: T | null | undefined, what: string): T => {
  if (data == null) {
    throw new Error(`${what}に失敗しました`);
  }
  return data;
};

export class AmplifyRepository implements RecipeRepository {
  async listRecipes(): Promise<Recipe[]> {
    const models = await listAll<RecipeModel>((nextToken) =>
      getClient().models.Recipe.list({ nextToken, limit: 200 }),
    );
    return models.map(toRecipe);
  }

  async getRecipe(id: string): Promise<Recipe | null> {
    const { data, errors } = await getClient().models.Recipe.get({ id });
    throwOnErrors(errors);
    // 他チームのレシピは認可で弾かれ data が null になる。ID 直指定でも
    // 取得できないことは統合テストで確認する（§10.2）
    return data ? toRecipe(data) : null;
  }

  async createRecipe(input: RecipeInput): Promise<Recipe> {
    const teamId = await currentTeamId();
    const { data, errors } = await getClient().models.Recipe.create({
      teamId,
      ...writeFields(input),
    });
    throwOnErrors(errors);
    return toRecipe(mustExist(data, 'レシピの作成'));
  }

  async updateRecipe(id: string, input: RecipeInput): Promise<Recipe> {
    // teamId は変更しない。所属の付け替えは joinTeam / leaveTeam の責務（§2.5）
    const { data, errors } = await getClient().models.Recipe.update({
      id,
      ...writeFields(input),
    });
    throwOnErrors(errors);
    return toRecipe(mustExist(data, 'レシピの更新'));
  }

  async deleteRecipe(id: string): Promise<void> {
    const { errors } = await getClient().models.Recipe.delete({ id });
    throwOnErrors(errors);
  }

  async listLabels(): Promise<Label[]> {
    const models = await listAll<LabelModel>((nextToken) =>
      getClient().models.Label.list({ nextToken, limit: 200 }),
    );
    return models.map(toLabel);
  }

  async createLabel(name: string): Promise<Label> {
    const teamId = await currentTeamId();
    const { data, errors } = await getClient().models.Label.create({ teamId, name });
    throwOnErrors(errors);
    return toLabel(mustExist(data, 'ラベルの作成'));
  }

  async deleteLabel(id: string): Promise<void> {
    const { errors } = await getClient().models.Label.delete({ id });
    throwOnErrors(errors);

    // 参照している全レシピから ID を取り除く（§1.6）。レシピ自体は削除しない。
    // 外部キー制約が無いため、この後始末は Repository の責務として契約に含まれる。
    const recipes = await this.listRecipes();
    await Promise.all(
      recipes
        .filter((recipe) => recipe.labelIds.includes(id))
        .map(async (recipe) => {
          const { errors: updateErrors } = await getClient().models.Recipe.update({
            id: recipe.id,
            labelIds: recipe.labelIds.filter((labelId) => labelId !== id),
          });
          throwOnErrors(updateErrors);
        }),
    );
  }
}
