import { describe, expect, it } from 'vitest';
import { filterRecipes, normalizeForSearch, sortByUpdatedAtDesc } from './search';
import type { Ingredient, Recipe } from './types';

const recipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  id: 'r1',
  title: 'レシピ',
  url: null,
  servings: 2,
  ingredients: [],
  labelIds: [],
  memo: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const ing = (name: string): Ingredient => ({ name, quantity: 1, unit: '個' });

describe('normalizeForSearch', () => {
  it('全角英数を半角に揃える', () => {
    expect(normalizeForSearch('ＡＢＣ１２３')).toBe('abc123');
  });

  it('大文字小文字を無視する', () => {
    expect(normalizeForSearch('Curry')).toBe(normalizeForSearch('curry'));
  });

  it('カタカナとひらがなを同一視する', () => {
    expect(normalizeForSearch('タマネギ')).toBe(normalizeForSearch('たまねぎ'));
  });

  it('半角カナも同一視する', () => {
    expect(normalizeForSearch('ﾀﾏﾈｷﾞ')).toBe(normalizeForSearch('たまねぎ'));
  });

  it('前後の空白を落とす', () => {
    expect(normalizeForSearch('  カレー  ')).toBe('かれー');
  });

  it('【既知の限界】漢字とかなの揺れは吸収できない', () => {
    // 形態素解析辞書が必要になるため v1 の対象外（設計書 §6.5）。
    // 仕様として明示的に固定しておく
    expect(normalizeForSearch('玉ねぎ')).not.toBe(normalizeForSearch('たまねぎ'));
  });
});

describe('filterRecipes', () => {
  const curry = recipe({
    id: 'curry',
    title: 'カレーライス',
    ingredients: [ing('たまねぎ'), ing('にんじん')],
    labelIds: ['main', 'veg'],
  });
  const salad = recipe({
    id: 'salad',
    title: 'サラダ',
    ingredients: [ing('レタス')],
    labelIds: ['veg'],
  });
  const soup = recipe({
    id: 'soup',
    title: 'スープ',
    ingredients: [ing('たまねぎ')],
    labelIds: ['main'],
  });
  const all = [curry, salad, soup];

  it('条件が空なら全件返す', () => {
    expect(filterRecipes(all, {})).toHaveLength(3);
  });

  it('料理名の部分一致で絞り込む', () => {
    expect(filterRecipes(all, { title: 'カレー' }).map((r) => r.id)).toEqual(['curry']);
  });

  it('料理名は表記ゆれを吸収する', () => {
    expect(filterRecipes(all, { title: 'かれー' }).map((r) => r.id)).toEqual(['curry']);
  });

  it('材料名の部分一致で絞り込む', () => {
    expect(filterRecipes(all, { ingredient: 'たまねぎ' }).map((r) => r.id)).toEqual([
      'curry',
      'soup',
    ]);
  });

  it('材料はどれか1つが一致すればよい', () => {
    expect(filterRecipes(all, { ingredient: 'にんじん' }).map((r) => r.id)).toEqual([
      'curry',
    ]);
  });

  it('ラベルで絞り込む', () => {
    expect(filterRecipes(all, { labelIds: ['veg'] }).map((r) => r.id)).toEqual([
      'curry',
      'salad',
    ]);
  });

  it('ラベルを複数選ぶと AND になる（すべて持つレシピだけ残る）', () => {
    // 「主菜」＋「野菜」で、両方を持つカレーだけが残る（設計書 §6.5）
    expect(filterRecipes(all, { labelIds: ['main', 'veg'] }).map((r) => r.id)).toEqual([
      'curry',
    ]);
  });

  it('料理名・材料・ラベルの複数条件は AND になる', () => {
    expect(
      filterRecipes(all, { title: 'カレー', ingredient: 'にんじん', labelIds: ['main'] }),
    ).toHaveLength(1);

    // 材料の条件だけ外れると 0 件になる
    expect(
      filterRecipes(all, { title: 'カレー', ingredient: 'レタス', labelIds: ['main'] }),
    ).toHaveLength(0);
  });

  it('空白だけの条件は指定なしとして扱う', () => {
    expect(filterRecipes(all, { title: '   ' })).toHaveLength(3);
  });
});

describe('sortByUpdatedAtDesc', () => {
  it('更新日時の新しい順に並べる', () => {
    const older = recipe({ id: 'older', updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = recipe({ id: 'newer', updatedAt: '2026-06-01T00:00:00.000Z' });

    expect(sortByUpdatedAtDesc([older, newer]).map((r) => r.id)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('元の配列を変更しない', () => {
    const list = [
      recipe({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }),
      recipe({ id: 'b', updatedAt: '2026-06-01T00:00:00.000Z' }),
    ];

    sortByUpdatedAtDesc(list);

    expect(list.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
