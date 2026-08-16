import { randomInt } from 'node:crypto';

/**
 * 招待コード（docs/design.md §2.3）
 *
 * 口頭や手入力で伝えられることが要件なので、UUID は使わない。紛らわしい
 * 文字（`0` `O` `1` `I` `L`）を字母から除き、4文字ずつハイフンで区切る。
 *
 * **保存する形と表示する形を同じにしてある。** 表示用の整形を画面側に置くと、
 * 同じ規則がサーバーとクライアントの2箇所に生まれる。DynamoDB には
 * `ABCD-2345` の形のまま入れ、画面はそれをそのまま出す。入力の揺れ
 * （小文字・ハイフン無し・空白）は照合前に normalizeInviteCode が吸収する。
 */

/** 紛らわしい文字を除いた字母。0 O 1 I L を含めないこと */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** ハイフンを除いた長さ */
export const INVITE_CODE_LENGTH = 8;

const GROUP_SIZE = 4;

export const generateInviteCode = (): string => {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    // Math.random は使わない。招待コードは当てられると他人のチームに
    // 入れてしまうため、暗号論的な乱数から採る
    code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return format(code);
};

const format = (raw: string): string =>
  `${raw.slice(0, GROUP_SIZE)}-${raw.slice(GROUP_SIZE)}`;

/**
 * 入力された招待コードを、保存されている形に揃える。
 *
 * 小文字・ハイフンの有無・前後の空白を吸収する。字母に無い文字が混ざって
 * いる場合は照合しても見つからないため、ここでは弾かずそのまま整形する
 * （「無効なコード」の判定は照合結果に一本化する）。
 */
export const normalizeInviteCode = (input: string): string => {
  const stripped = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return format(stripped.slice(0, INVITE_CODE_LENGTH));
};

/** 発行から1時間で失効する（§2.3）。常時有効な共有コードは持たない */
export const INVITE_CODE_TTL_MS = 60 * 60 * 1000;
