import type { GuestStore } from '@/repositories/guest-storage';
import type { RecipeRepository } from '@/repositories/recipe-repository';

/**
 * ゲストデータの引き継ぎ（docs/design.md §5.3 / §5.4）
 *
 * localStorage のレシピとラベルを、サインイン済みユーザーのチームへ移す。
 * 呼び出し側は **先にトークンを取り直しておくこと**（§5.3）。まだ権限の
 * 無いトークンで書き込むと全て Unauthorized になる。
 *
 * 引数を RecipeRepository と GuestStore の2つに絞ってあるのは、この処理の
 * 難しさが「順序」と「冪等性」にあり、保存先の実体には無いため。どちらも
 * 差し替えられるので、テストは AWS もブラウザも使わずに書ける。
 */

export type MigrationSummary = {
  /** 引き継いだレシピの件数（前回までに送信済みのものを含む） */
  recipes: number;
  labels: number;
};

export const migrateGuestData = async (
  target: RecipeRepository,
  store: GuestStore,
): Promise<MigrationSummary> => {
  const labels = store.readLabels();
  const recipes = store.readRecipes();

  // ⚠️ ラベルが先（§5.3）。レシピの labelIds はローカル生成 ID を指しており、
  // サーバー ID への対応表が無いと付け替えられない。順序を逆にすると
  // ラベルが全て外れたレシピが出来上がる
  const idMap = new Map<string, string>();
  for (const label of labels) {
    if (label.migratedId) {
      // 前回の試行で送信済み。作り直さず、その時の対応をそのまま使う
      idMap.set(label.id, label.migratedId);
      continue;
    }

    const created = await target.createLabel(label.name);
    // 1件ごとに印を付ける。まとめて最後に書くと、途中で切れた分が
    // 次の試行で二重登録される
    store.markLabelMigrated(label.id, created.id);
    idMap.set(label.id, created.id);
  }

  for (const recipe of recipes) {
    if (recipe.migrated) continue;

    await target.createRecipe({
      title: recipe.title,
      url: recipe.url,
      servings: recipe.servings,
      ingredients: recipe.ingredients,
      // 対応表に無い ID は落とす。存在しないラベルへの参照を持ち込まない（§1.6）
      labelIds: recipe.labelIds
        .map((id) => idMap.get(id))
        .filter((id): id is string => id !== undefined),
      memo: recipe.memo,
    });
    store.markRecipeMigrated(recipe.id);
  }

  // ここに到達したのは全件成功した時だけ。途中で例外が出れば localStorage は
  // 残り、印の付いていないものだけを次の試行で送れる（§5.4）
  store.clear();

  return { recipes: recipes.length, labels: labels.length };
};
