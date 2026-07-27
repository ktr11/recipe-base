import { describe, expect, it } from 'vitest';
import { DEFAULT_REDIRECT, safeRedirect } from './redirect';

describe('safeRedirect', () => {
  it('サイト内の絶対パスは通す', () => {
    expect(safeRedirect('/team')).toBe('/team');
    expect(safeRedirect('/recipes/abc?x=1')).toBe('/recipes/abc?x=1');
  });

  it('指定が無ければ既定の行き先にする', () => {
    expect(safeRedirect(null)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirect('')).toBe(DEFAULT_REDIRECT);
  });

  it('外部サイトへ誘導する値は弾く', () => {
    // ?redirect= はアドレスバーから書き換えられる。オープンリダイレクトの防止
    expect(safeRedirect('https://evil.example')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirect('//evil.example')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirect('/\\evil.example')).toBe(DEFAULT_REDIRECT);
  });

  it('javascript: スキームを弾く', () => {
    expect(safeRedirect('javascript:alert(1)')).toBe(DEFAULT_REDIRECT);
  });

  it('相対パスは通さない', () => {
    expect(safeRedirect('recipes')).toBe(DEFAULT_REDIRECT);
  });
});
