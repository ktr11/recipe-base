import { describe, expect, it } from 'vitest';
import {
  DISPLAY_NAME_MAX_LENGTH,
  validateDisplayName,
} from './profile';

/**
 * 表示名の検証（docs/design.md §8）
 *
 * 保存側が前後の空白を落とすため、検証も trim 後の長さで行う必要がある。
 * ここがズレると「空白だけの表示名」がメンバー一覧に空欄として並ぶ。
 */
describe('validateDisplayName', () => {
  it('通常の名前を受け入れる', () => {
    expect(validateDisplayName('パパ')).toBeNull();
    expect(validateDisplayName('a')).toBeNull();
  });

  it('空文字と空白のみを拒否する', () => {
    expect(validateDisplayName('')).not.toBeNull();
    expect(validateDisplayName('   ')).not.toBeNull();
    expect(validateDisplayName('　')).not.toBeNull();
  });

  it('前後に空白があっても、中身があれば受け入れる', () => {
    expect(validateDisplayName('  パパ  ')).toBeNull();
  });

  it('上限ちょうどは通し、超えたら拒否する', () => {
    const max = 'あ'.repeat(DISPLAY_NAME_MAX_LENGTH);
    expect(validateDisplayName(max)).toBeNull();
    expect(validateDisplayName(`${max}あ`)).not.toBeNull();
  });

  it('長さの判定は trim 後で行う（空白で上限を超えても通す）', () => {
    const max = 'あ'.repeat(DISPLAY_NAME_MAX_LENGTH);
    expect(validateDisplayName(`  ${max}  `)).toBeNull();
  });
});
