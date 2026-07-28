import { beforeEach, describe, expect, it } from 'vitest';
import type { Label, Recipe, RecipeInput } from '@/lib/recipes/types';
import type {
  GuestStore,
  StoredLabel,
  StoredRecipe,
} from '@/repositories/guest-storage';
import type { RecipeRepository } from '@/repositories/recipe-repository';
import { migrateGuestData } from './migrate-guest-data';

/**
 * 引き継ぎのテスト（docs/design.md §10.1）
 *
 * 設計書が「見落としやすい」と名指ししている2点を検証する:
 *   - ラベル ID の付け替え（順序を誤るとラベルが全部外れる / §5.3）
 *   - migrated フラグによる冪等性（再試行で二重登録しない / §5.4）
 *
 * 保存先も送信先も差し替えられるため、localStorage も AWS も使わない。
 */

const storedRecipe = (overrides: Partial<StoredRecipe> = {}): StoredRecipe => ({
  id: 'local-recipe',
  title: '肉じゃが',
  url: null,
  servings: 2,
  ingredients: [],
  labelIds: [],
  memo: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/** localStorage の代わり。読み書きの記録がそのまま検証対象になる */
class FakeGuestStore implements GuestStore {
  cleared = false;

  constructor(
    private recipes: StoredRecipe[] = [],
    private labels: StoredLabel[] = [],
  ) {}

  readRecipes() {
    return this.recipes;
  }

  readLabels() {
    return this.labels;
  }

  markRecipeMigrated(id: string) {
    this.recipes = this.recipes.map((r) =>
      r.id === id ? { ...r, migrated: true } : r,
    );
  }

  markLabelMigrated(localId: string, serverId: string) {
    this.labels = this.labels.map((l) =>
      l.id === localId ? { ...l, migratedId: serverId } : l,
    );
  }

  clear() {
    this.cleared = true;
    this.recipes = [];
    this.labels = [];
  }
}

/** 送信先。createLabel / createRecipe だけを使う */
class FakeRepository implements RecipeRepository {
  recipes: Recipe[] = [];
  labels: Label[] = [];
  /** n 件目の作成で失敗させる（0 なら失敗しない）。通信断の再現に使う */
  failRecipeAt = 0;
  private counter = 0;

  private nextId(prefix: string) {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  async createLabel(name: string): Promise<Label> {
    const label: Label = { id: this.nextId('server-label'), name };
    this.labels.push(label);
    return label;
  }

  async createRecipe(input: RecipeInput): Promise<Recipe> {
    if (this.failRecipeAt !== 0 && this.recipes.length + 1 === this.failRecipeAt) {
      throw new Error('通信が切れました');
    }
    const recipe: Recipe = {
      ...input,
      id: this.nextId('server-recipe'),
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    this.recipes.push(recipe);
    return recipe;
  }

  async listRecipes(): Promise<Recipe[]> {
    return this.recipes;
  }
  async getRecipe(): Promise<Recipe | null> {
    return null;
  }
  async updateRecipe(): Promise<Recipe> {
    throw new Error('使用しない');
  }
  async deleteRecipe(): Promise<void> {}
  async listLabels(): Promise<Label[]> {
    return this.labels;
  }
  async deleteLabel(): Promise<void> {}
}

describe('migrateGuestData', () => {
  let target: FakeRepository;

  beforeEach(() => {
    target = new FakeRepository();
  });

  it('レシピとラベルをまとめて送る', async () => {
    const store = new FakeGuestStore(
      [storedRecipe({ id: 'r1' }), storedRecipe({ id: 'r2', title: 'カレー' })],
      [{ id: 'l1', name: '主菜' }],
    );

    const summary = await migrateGuestData(target, store);

    expect(target.recipes).toHaveLength(2);
    expect(target.labels).toHaveLength(1);
    expect(summary).toEqual({ recipes: 2, labels: 1 });
  });

  it('レシピの labelIds をサーバー側の ID に付け替える', async () => {
    const store = new FakeGuestStore(
      [storedRecipe({ labelIds: ['l1', 'l2'] })],
      [
        { id: 'l1', name: '主菜' },
        { id: 'l2', name: '野菜' },
      ],
    );

    await migrateGuestData(target, store);

    const serverIds = target.labels.map((l) => l.id);
    expect(target.recipes[0].labelIds).toEqual(serverIds);
    // ローカル ID が残っていない（残ると表示側で無視され、ラベルが外れて見える）
    expect(target.recipes[0].labelIds).not.toContain('l1');
  });

  it('対応するラベルが無い labelId は落とす', async () => {
    const store = new FakeGuestStore(
      [storedRecipe({ labelIds: ['l1', '既に削除された'] })],
      [{ id: 'l1', name: '主菜' }],
    );

    await migrateGuestData(target, store);

    expect(target.recipes[0].labelIds).toEqual([target.labels[0].id]);
  });

  it('全件成功した場合にだけ localStorage を消す', async () => {
    const store = new FakeGuestStore([storedRecipe()], []);

    await migrateGuestData(target, store);

    expect(store.cleared).toBe(true);
  });

  it('途中で失敗した場合は消さず、送信済みのものに印を付ける', async () => {
    const store = new FakeGuestStore(
      [storedRecipe({ id: 'r1' }), storedRecipe({ id: 'r2' })],
      [{ id: 'l1', name: '主菜' }],
    );
    target.failRecipeAt = 2;

    await expect(migrateGuestData(target, store)).rejects.toThrow('通信が切れました');

    expect(store.cleared).toBe(false);
    expect(store.readRecipes().map((r) => r.migrated)).toEqual([true, undefined]);
    expect(store.readLabels()[0].migratedId).toBe(target.labels[0].id);
  });

  it('再試行しても二重登録しない', async () => {
    const store = new FakeGuestStore(
      [storedRecipe({ id: 'r1', labelIds: ['l1'] }), storedRecipe({ id: 'r2' })],
      [{ id: 'l1', name: '主菜' }],
    );
    target.failRecipeAt = 2;
    await expect(migrateGuestData(target, store)).rejects.toThrow();

    target.failRecipeAt = 0;
    await migrateGuestData(target, store);

    expect(target.recipes).toHaveLength(2);
    // ラベルも作り直さない
    expect(target.labels).toHaveLength(1);
    expect(store.cleared).toBe(true);
  });

  it('再試行で作り直さないラベルにも、レシピを正しく紐づける', async () => {
    // 1件目の送信で失敗させ、ラベルだけが送信済みの状態を作る
    const store = new FakeGuestStore(
      [storedRecipe({ id: 'r1', labelIds: ['l1'] })],
      [{ id: 'l1', name: '主菜' }],
    );
    target.failRecipeAt = 1;
    await expect(migrateGuestData(target, store)).rejects.toThrow();

    target.failRecipeAt = 0;
    await migrateGuestData(target, store);

    // 対応表は localStorage 側の migratedId から復元される。
    // ここが boolean だと、再試行時にラベルが外れる
    expect(target.recipes[0].labelIds).toEqual([target.labels[0].id]);
  });

  it('引き継ぐものが無ければ何も作らない', async () => {
    const store = new FakeGuestStore([], []);

    const summary = await migrateGuestData(target, store);

    expect(summary).toEqual({ recipes: 0, labels: 0 });
    expect(target.recipes).toHaveLength(0);
  });
});
