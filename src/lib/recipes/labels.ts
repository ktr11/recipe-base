import type { Label } from './types';

/**
 * ラベル参照の解決（docs/design.md §1.6）
 *
 * labelIds は外部キー制約を持たないため、削除済みラベルの ID が残り得る。
 * ラベル削除時に参照を取り除く処理は Repository が行うが、それが途中で
 * 失敗しても表示が壊れないよう、**読み込み側で存在しない ID を無視する**。
 *
 * これが参照整合性の最終防衛線であり、掃除が失敗しても UI 上の不整合は
 * 発生しない。
 */
export const resolveLabels = (labelIds: string[], labels: Label[]): Label[] => {
  const byId = new Map(labels.map((label) => [label.id, label]));
  return labelIds
    .map((id) => byId.get(id))
    .filter((label): label is Label => label !== undefined);
};

/** 存在するラベルの ID だけを残す */
export const sanitizeLabelIds = (labelIds: string[], labels: Label[]): string[] =>
  resolveLabels(labelIds, labels).map((label) => label.id);
