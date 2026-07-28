'use client';

import { useCallback, useState } from 'react';
import { migrateGuestData } from '@/lib/migration/migrate-guest-data';
import { setImportNotice } from '@/lib/migration/notice';
import { AmplifyRepository } from '@/repositories/amplify-repository';
import { hasGuestData, localStorageGuestStore } from '@/repositories/guest-storage';

/**
 * ゲストデータの引き継ぎの進行（docs/design.md §5.3 / §5.5）
 *
 * 新規登録と既存アカウントへのサインインで扱いを変える。**一貫性より
 * 実際の期待値を優先した非対称な扱い**である:
 *
 *   auto（新規登録）… 確認せずに取り込む。登録直後は連続性への期待が
 *                     最も高く、ダイアログは邪魔にしかならない
 *   ask（サインイン）… 確認してから取り込む。既にレシピを持つ家族チームに
 *                     試し打ちのダミーが黙って混入するのは防ぐ必要がある
 *
 * ⚠️ begin を呼ぶのは、認証とトークンの取り直しを終えた後（§5.3）。
 * まだ権限の無いトークンで書き込むと全て Unauthorized になる。
 *
 * 進行はすべてイベントハンドラから始める。エフェクトで自動的に走らせると、
 * 「認証できたか」という React の外の出来事を状態の副作用として扱うことに
 * なり、二重実行の防止を自前で書く羽目になる。
 */

export type GuestImportPhase = 'idle' | 'ask' | 'running' | 'error';

export const useGuestImport = (onDone: () => void) => {
  const [phase, setPhase] = useState<GuestImportPhase>('idle');
  const [counts, setCounts] = useState({ recipes: 0, labels: 0 });

  /** 取り込みを実行する。成功したらそのまま onDone へ抜ける */
  const run = useCallback(async () => {
    setPhase('running');
    try {
      // ここは必ず認証済み。ゲスト用の実装に書き込んでは意味が無いため、
      // getRepository の判定に委ねず送信先を明示する
      const summary = await migrateGuestData(
        new AmplifyRepository(),
        localStorageGuestStore,
      );
      setImportNotice(summary);
      onDone();
    } catch (caught) {
      console.error(caught);
      // 黙って破棄しない（§5.4）。localStorage は残っており、印の付いて
      // いないものだけが次の試行で送られる
      setPhase('error');
    }
  }, [onDone]);

  /** 認証直後に呼ぶ。引き継ぐものが無ければ、何も出さずに onDone へ抜ける */
  const begin = useCallback(
    async (mode: 'auto' | 'ask') => {
      if (!hasGuestData()) {
        onDone();
        return;
      }

      if (mode === 'auto') {
        await run();
        return;
      }

      setCounts({
        recipes: localStorageGuestStore.readRecipes().length,
        labels: localStorageGuestStore.readLabels().length,
      });
      setPhase('ask');
    },
    [onDone, run],
  );

  /** 「追加しない」。破棄はこの選択をした時にだけ行う（§5.5） */
  const discard = useCallback(() => {
    localStorageGuestStore.clear();
    onDone();
  }, [onDone]);

  return { phase, counts, begin, run, discard, skip: onDone };
};
