import { describe, expect, it } from 'vitest';
import {
  INVITE_CODE_ALPHABET,
  generateInviteCode,
  normalizeInviteCode,
} from '../../amplify/shared/invite-code';

/**
 * 招待コードの生成（docs/design.md §10.1 / §2.3）
 *
 * 設計書が「壊れやすい」と名指ししている箇所。紛らわしい文字が1つでも
 * 混ざると、口頭で伝えたコードが通らない事故になる。しかも生成は乱数なので、
 * 手で動かして確かめても混入に気付けない。
 *
 * Lambda 側のモジュールだが、node:crypto しか使わない純粋な処理なので
 * AWS への接続は要らない。単体テストで扱う。
 */
describe('generateInviteCode', () => {
  // 乱数なので1回では意味がない。全字母がほぼ確実に出る回数を回す
  const codes = Array.from({ length: 500 }, () => generateInviteCode());

  it('4文字ずつハイフンで区切った8桁である', () => {
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
  });

  it('紛らわしい文字（0 O 1 I L）を含まない', () => {
    for (const code of codes) {
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });

  it('字母に無い文字を含まない', () => {
    for (const code of codes) {
      for (const char of code.replace('-', '')) {
        expect(INVITE_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it('毎回異なる値を返す', () => {
    // 31^8 通りあるため、500件で重複が出るなら乱数の使い方が誤っている
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('normalizeInviteCode', () => {
  it('保存されている形はそのまま通す', () => {
    expect(normalizeInviteCode('ABCD-2345')).toBe('ABCD-2345');
  });

  it('小文字・ハイフン無し・空白を吸収する', () => {
    expect(normalizeInviteCode('abcd2345')).toBe('ABCD-2345');
    expect(normalizeInviteCode(' abcd-2345 ')).toBe('ABCD-2345');
    expect(normalizeInviteCode('ABCD 2345')).toBe('ABCD-2345');
  });

  it('生成したコードは正規化しても変わらない', () => {
    const code = generateInviteCode();
    expect(normalizeInviteCode(code)).toBe(code);
  });
});
