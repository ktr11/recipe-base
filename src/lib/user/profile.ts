import { getCurrentUser } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import {
  applyTheme,
  DEFAULT_THEME,
  isThemeId,
  readStoredTheme,
  type ThemeId,
} from '@/lib/theme';

/**
 * 自分の UserProfile の読み書き（docs/design.md §6.2 / §8）
 *
 * UserProfile は「Cognito 属性のチーム内向け投影」であり、表示名とテーマは
 * Cognito ではなくここに持つ。Cognito のカスタム属性を使わないのは、
 * User Pool のスキーマが作成時に凍結され、後から属性を足すにはプールの
 * 作り直し（＝全ユーザー消滅）が必要になるため（§6.2）。
 *
 * `teamId` はここからは書けない。フィールド単位で読み取り専用にしてあり、
 * 所属の変更は joinTeam / leaveTeam の責務（§1.7）。
 */

// generateClient は Amplify.configure の後でしか呼べない（amplify-repository と同じ理由）
let client: ReturnType<typeof generateClient<Schema>> | null = null;
const getClient = () => (client ??= generateClient<Schema>());

export const DISPLAY_NAME_MAX_LENGTH = 30;

export const DISPLAY_NAME_RULE = `1〜${DISPLAY_NAME_MAX_LENGTH}文字で入力してください`;

/**
 * 表示名の検証。問題なければ null、あれば理由を返す。
 *
 * **重複チェックはしない**（§8）。表示名はサインインに一切使わないため、
 * 家族に「パパ」が2人いても破綻しない。一意制約を付けると変更時の衝突処理が
 * 必要になるだけで利点がない。
 *
 * 前後の空白は保存側で落とすので、検証も trim 後の長さで行う。
 */
export const validateDisplayName = (name: string): string | null => {
  const trimmed = name.trim();
  if (trimmed.length === 0) return DISPLAY_NAME_RULE;
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) return DISPLAY_NAME_RULE;
  return null;
};

export type MyProfile = {
  userId: string;
  displayName: string;
  /** 保存済みのテーマ。既知の値でなければ null */
  theme: ThemeId | null;
};

const throwOnErrors = (
  errors: readonly { message: string }[] | null | undefined,
  fallback: string,
): void => {
  if (errors && errors.length > 0) {
    throw new Error(`${fallback}: ${errors.map((e) => e.message).join('\n')}`);
  }
};

export const fetchMyProfile = async (): Promise<MyProfile> => {
  const { userId } = await getCurrentUser();
  const result = await getClient().models.UserProfile.get({ userId });
  throwOnErrors(result.errors, 'プロフィールを取得できませんでした');

  if (!result.data) {
    // ensureAccountReady を通っていれば存在する（§2.7）。ここに来るのは
    // 修復より前に呼んだ場合で、呼び出し順の誤りとして扱う
    throw new Error('プロフィールが見つかりませんでした');
  }

  return {
    userId,
    displayName: result.data.displayName,
    theme: isThemeId(result.data.theme) ? result.data.theme : null,
  };
};

/** 表示名を変更する。保存した値（前後の空白を落としたもの）を返す */
export const updateDisplayName = async (name: string): Promise<string> => {
  const invalid = validateDisplayName(name);
  if (invalid) throw new Error(invalid);

  const trimmed = name.trim();
  const { userId } = await getCurrentUser();
  const result = await getClient().models.UserProfile.update({
    userId,
    displayName: trimmed,
  });
  throwOnErrors(result.errors, '表示名を変更できませんでした');

  return trimmed;
};

/**
 * テーマをサーバーへ控える。
 *
 * ⚠️ **これは表示のための保存ではない。** 描画上の真実は常に localStorage で、
 * 初回描画は ThemeScript が既に済ませている（§6.2）。ここへの保存は
 * 別端末で同じテーマを引き当てるための控えでしかない。
 */
export const saveTheme = async (theme: ThemeId): Promise<void> => {
  const { userId } = await getCurrentUser();
  const result = await getClient().models.UserProfile.update({ userId, theme });
  throwOnErrors(result.errors, 'テーマを保存できませんでした');
};

/**
 * サインイン直後にテーマを端末とサーバーで揃える（§6.2）
 *
 * 規則は「**この端末に選択があればそれが正**」:
 *
 *   選択がある → サーバーへ押し上げる。ゲストで選んだテーマが登録後も
 *                残り、かつ他の端末から引けるようになる
 *   選択が無い → サーバーの値を採用する。新しい端末で前の選択が復元される
 *
 * ローカルを優先するのは、ゲストで night を選んだ直後に登録した人が、
 * 作られたばかりの UserProfile の既定値 light で上書きされるのを防ぐため。
 *
 * ⚠️ **既知の限界**: スキーマ既定値が 'light' であるため、サーバー側の
 * 'light' は「light を選んだ」のか「まだ選んでいない」のかを区別できない。
 * 区別できない値を採用すると、テーマ未選択の利用者が新しい端末で
 * OS のダークモード設定に従えなくなる（ThemeScript は未選択のとき
 * data-theme を書かず、CSS の --prefersdark に委ねている）。
 * したがって既定値と一致する場合は採用しない。この1点だけ同期されない。
 *
 * **この関数は例外を投げない。** テーマは装飾であり、同期に失敗しても
 * サインインを止める理由にならない。失敗はログに残す。
 */
export const syncThemeWithProfile = async (): Promise<void> => {
  try {
    const local = readStoredTheme();

    if (local) {
      await saveTheme(local);
      return;
    }

    const { theme } = await fetchMyProfile();
    if (theme && theme !== DEFAULT_THEME) {
      applyTheme(theme);
    }
  } catch (caught) {
    console.error(caught);
  }
};
