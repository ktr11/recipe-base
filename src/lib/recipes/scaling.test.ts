import { describe, expect, it } from 'vitest';
import {
  clampServings,
  formatIngredient,
  formatQuantity,
  MAX_SERVINGS,
  MIN_SERVINGS,
  scaleIngredient,
  scaleIngredients,
  servingsFactor,
} from './scaling';
import type { Ingredient } from './types';

const ing = (
  name: string,
  quantity: number | null,
  unit: string | null,
): Ingredient => ({ name, quantity, unit });

describe('formatQuantity', () => {
  it('小数第1位で四捨五入する', () => {
    expect(formatQuantity(0.66)).toBe('0.7');
  });

  it('末尾の 0 を落とす', () => {
    expect(formatQuantity(2.0)).toBe('2');
  });

  it('割り切れない値は小数で表示する', () => {
    expect(formatQuantity(1.5)).toBe('1.5');
  });
});

describe('servingsFactor', () => {
  it('目標 ÷ 基準 を返す', () => {
    expect(servingsFactor(2, 3)).toBe(1.5);
  });

  it('基準が 0 のときは 1 倍として扱う', () => {
    // 0 除算で Infinity や NaN を画面に出さないための保険
    expect(servingsFactor(0, 4)).toBe(1);
  });

  it('基準が負のときも 1 倍として扱う', () => {
    expect(servingsFactor(-2, 4)).toBe(1);
  });
});

describe('scaleIngredient', () => {
  it('数量をスケールする', () => {
    expect(scaleIngredient(ing('玉ねぎ', 1, '個'), 1.5).quantity).toBe(1.5);
  });

  it('数量が null の材料はスケールしない', () => {
    // 「適量 × 1.5倍」は意味を成さない（設計書 §6.4）
    const salt = ing('塩', null, '適量');

    expect(scaleIngredient(salt, 1.5)).toEqual(salt);
  });

  it('スケール結果を小数第1位に丸める', () => {
    expect(scaleIngredient(ing('牛肉', 200, 'g'), 1 / 3).quantity).toBe(66.7);
  });

  it('元の材料を変更しない', () => {
    const original = ing('玉ねぎ', 1, '個');

    scaleIngredient(original, 2);

    expect(original.quantity).toBe(1);
  });
});

describe('scaleIngredients', () => {
  it('2人前を3人前にすると 1.5 倍になる', () => {
    const scaled = scaleIngredients(
      [ing('玉ねぎ', 1, '個'), ing('牛肉', 200, 'g')],
      2,
      3,
    );

    expect(scaled.map((i) => i.quantity)).toEqual([1.5, 300]);
  });

  it('スケール不能な材料を混ぜても、他の材料は正しく変換される', () => {
    const scaled = scaleIngredients(
      [ing('玉ねぎ', 1, '個'), ing('塩', null, '適量'), ing('卵', 2, null)],
      2,
      3,
    );

    expect(scaled.map((i) => i.quantity)).toEqual([1.5, null, 3]);
  });

  it('人数が同じなら値は変わらない', () => {
    const ingredients = [ing('玉ねぎ', 1, '個')];

    expect(scaleIngredients(ingredients, 2, 2)).toEqual(ingredients);
  });
});

describe('formatIngredient', () => {
  it('数量と単位を並べて表示する', () => {
    expect(formatIngredient(ing('玉ねぎ', 1.5, '個'))).toBe('玉ねぎ 1.5個');
  });

  it('数量が無い材料は単位だけ表示する', () => {
    expect(formatIngredient(ing('塩', null, '適量'))).toBe('塩 適量');
  });

  it('単位が無い材料は数量だけ表示する', () => {
    expect(formatIngredient(ing('卵', 2, null))).toBe('卵 2');
  });

  it('数量も単位も無ければ名前だけ表示する', () => {
    expect(formatIngredient(ing('お好みの野菜', null, null))).toBe('お好みの野菜');
  });
});

describe('clampServings', () => {
  it(`下限は ${MIN_SERVINGS} 人前`, () => {
    expect(clampServings(0)).toBe(MIN_SERVINGS);
  });

  it(`上限は ${MAX_SERVINGS} 人前`, () => {
    expect(clampServings(99)).toBe(MAX_SERVINGS);
  });

  it('範囲内の値はそのまま返す', () => {
    expect(clampServings(4)).toBe(4);
  });
});

describe('人前の範囲', () => {
  it('設計書 §6.4 の通りである', () => {
    // 定数を参照するテストだけだと値の誤りを検出できないため固定する
    expect({ MIN_SERVINGS, MAX_SERVINGS }).toEqual({
      MIN_SERVINGS: 1,
      MAX_SERVINGS: 12,
    });
  });
});
