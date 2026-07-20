import { describe, expect, it } from 'vitest';
import { resolveLabels, sanitizeLabelIds } from './labels';
import type { Label } from './types';

const labels: Label[] = [
  { id: 'main', name: '主菜' },
  { id: 'veg', name: '野菜' },
];

describe('resolveLabels', () => {
  it('ID からラベルを解決する', () => {
    expect(resolveLabels(['main'], labels).map((l) => l.name)).toEqual(['主菜']);
  });

  it('存在しない ID は無視する', () => {
    // 参照整合性の最終防衛線（設計書 §1.6）。
    // ラベル削除時の掃除が失敗しても表示は壊れない
    expect(resolveLabels(['main', 'deleted'], labels).map((l) => l.name)).toEqual([
      '主菜',
    ]);
  });

  it('すべて存在しない ID なら空になる', () => {
    expect(resolveLabels(['gone', 'also-gone'], labels)).toEqual([]);
  });

  it('指定した順序を保つ', () => {
    expect(resolveLabels(['veg', 'main'], labels).map((l) => l.id)).toEqual([
      'veg',
      'main',
    ]);
  });
});

describe('sanitizeLabelIds', () => {
  it('存在する ID だけを残す', () => {
    expect(sanitizeLabelIds(['main', 'deleted', 'veg'], labels)).toEqual([
      'main',
      'veg',
    ]);
  });
});
