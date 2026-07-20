/**
 * トライアル制限（docs/design.md §4）
 *
 * ゲストが作成できる件数の上限。制限は「累計」ではなく「同時保有数」で、
 * 1件削除すれば1件作成できる。累計制にすると「消したのに作れない」となり
 * 試用の妨げにしかならないため。
 *
 * 正規ユーザーには一切の上限を設けない。
 */
export const TRIAL_LIMITS = {
  recipes: 3,
  labels: 3,
  ingredientsPerRecipe: 10,
} as const;

export type TrialLimitKind = keyof typeof TRIAL_LIMITS;

/**
 * 上限に達したことを表すエラー。
 *
 * UI 側で「どの上限か」に応じた文言と登録導線を出せるよう kind を持つ。
 */
export class TrialLimitError extends Error {
  constructor(
    readonly kind: TrialLimitKind,
    readonly limit: number,
  ) {
    super(`トライアルの上限に達しています (${kind}: ${limit})`);
    this.name = 'TrialLimitError';
  }
}

export const isTrialLimitError = (error: unknown): error is TrialLimitError =>
  error instanceof TrialLimitError;
