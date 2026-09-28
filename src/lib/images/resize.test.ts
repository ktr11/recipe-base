import { describe, expect, it } from 'vitest';
import { fitWithin } from './resize';

// resizeToJpeg は createImageBitmap と canvas に依存し jsdom では動かないため、
// 寸法計算だけを検証する。変換自体は実ブラウザでの確認に委ねる。
describe('fitWithin', () => {
  it('長辺が上限以下ならそのまま返す', () => {
    expect(fitWithin(1600, 1200, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('横長の画像は幅を上限に合わせて縮める', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('縦長の画像は高さを上限に合わせて縮める', () => {
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('縦横比を保つ', () => {
    const { width, height } = fitWithin(4032, 3024, 1600);
    expect(width / height).toBeCloseTo(4032 / 3024, 2);
  });

  it('極端に細長い画像でも 0px にならない', () => {
    expect(fitWithin(10000, 2, 1600).height).toBeGreaterThanOrEqual(1);
  });
});
