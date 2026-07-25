import { LocalStorageRepository } from './local-storage-repository';
import type { RecipeRepository } from './recipe-repository';

/**
 * 使用する Repository を決める（docs/design.md §3.3）
 *
 * 現時点ではゲスト用のみ。正規ユーザー向けの AmplifyRepository は
 * ステップ8 で追加し、認証状態に応じてここで差し替える。
 *
 * 画面コンポーネントはこの関数の戻り値だけを見て、データがどこに
 * 保存されるかを知らない。
 */
export const getRepository = (): RecipeRepository => new LocalStorageRepository();

/** ゲストかどうか。トライアル制限の表示に使う */
export const isGuest = (): boolean => true;

export type { RecipeRepository };
