import type { Label, Recipe, RecipeInput } from '@/lib/recipes/types';

/**
 * レシピとラベルの永続化の契約（docs/design.md §3.3）
 *
 * ゲスト（localStorage）と正規ユーザー（DynamoDB）で同じ画面を使うため、
 * 画面コンポーネントは「データがどこに保存されるか」を一切知らない。
 * 実装を差し替えるのはこの層だけ。
 *
 * localStorage 側は同期的に処理できるが、**すべて Promise を返す**。
 * 契約が実装の都合で分かれてしまうと、呼び出し側が実装を意識することに
 * なり、差し替え可能である意味が無くなるため。
 */
export interface RecipeRepository {
  listRecipes(): Promise<Recipe[]>;
  getRecipe(id: string): Promise<Recipe | null>;
  createRecipe(input: RecipeInput): Promise<Recipe>;
  updateRecipe(id: string, input: RecipeInput): Promise<Recipe>;
  deleteRecipe(id: string): Promise<void>;

  listLabels(): Promise<Label[]>;
  createLabel(name: string): Promise<Label>;
  /**
   * ラベルを削除し、そのラベルを参照している全レシピから ID を取り除く。
   *
   * 参照整合性は DB では担保されない（§1.4）ため、この後始末は実装の
   * 責務として契約に含める。レシピ自体は削除しない。
   */
  deleteLabel(id: string): Promise<void>;

  /**
   * 画像の対応可否（§7.1）。画像は認証ユーザー限定で、ゲスト（localStorage）
   * には保存先が無い。画面はこのフラグだけを見てアップロード UI を出し分け、
   * 「ゲストだから」という理由は Repository の外に漏らさない。
   */
  readonly supportsImages: boolean;
  /** 画像を保存し、レシピに持たせる imageKey を返す。supportsImages が false なら失敗する */
  uploadImage(image: Blob): Promise<string>;
  /**
   * 表示用 URL をまとめて取得する。戻りは imageKey → URL の対応。
   * URL は署名付きで短命（最大1時間）のため、保存せず表示のたびに取得する
   */
  getImageUrls(imageKeys: string[]): Promise<Map<string, string>>;
  /**
   * 画像を削除する。差し替え・レシピ削除時の後始末としてベストエフォートで
   * 呼ばれ、失敗しても孤児が残るだけで整合性は壊れない（§7.1）
   */
  deleteImage(imageKey: string): Promise<void>;
}
