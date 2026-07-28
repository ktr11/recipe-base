import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';

// generateClient は Amplify.configure の後でしか呼べない（amplify-repository と同じ理由）
let client: ReturnType<typeof generateClient<Schema>> | null = null;
const getClient = () => (client ??= generateClient<Schema>());

/**
 * サインイン直後にアカウントが使える状態かを確かめ、必要なら修復する
 * （docs/design.md §2.7 / §5.3）
 *
 * postConfirmation は失敗しても例外を投げずにサインアップを成立させる。
 * その結果「確認済みだがチームが無い」ユーザーが生まれ得るので、対になる
 * 復旧をクライアント側のこの関数が担う。ここを通さないと、そのユーザーは
 * レシピの読み書きが全て Unauthorized になり、原因も分からないまま詰む。
 *
 * ⚠️ 順序が重要（§5.3）。repairAccount は Cognito グループへの所属を作るが、
 * **既に発行済みのトークンにはそのグループが入っていない**。修復後に
 * forceRefresh でトークンを取り直すまで、書き込みは Unauthorized のままになる。
 *
 * 判定に UserProfile の有無を使うのは、これがチーム生成の最後に作られる
 * レコードだから（amplify/shared/personal-team.ts）。存在すれば、その前段の
 * グループ作成とチーム作成も終わっている。
 */
export const ensureAccountReady = async (): Promise<void> => {
  const { userId } = await getCurrentUser();
  const profile = await getClient().models.UserProfile.get({ userId });

  // 取得に失敗した場合は修復を試みない。ネットワーク断や一時的な障害で
  // 「無い」と誤判定してチームを作り直すと、既存のレシピから切り離された
  // 新しいチームにユーザーを移してしまう
  if (profile.errors) {
    throw new Error(
      `アカウント情報の取得に失敗しました: ${JSON.stringify(profile.errors)}`,
    );
  }

  if (profile.data) return;

  const repaired = await getClient().mutations.repairAccount();
  if (repaired.errors) {
    throw new Error(
      `アカウントの修復に失敗しました: ${JSON.stringify(repaired.errors)}`,
    );
  }

  // 新しいグループのクレームを載せたトークンを取り直す
  await fetchAuthSession({ forceRefresh: true });
};
