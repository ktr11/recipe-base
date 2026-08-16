'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import LeaveTeamDialog from '@/components/team/LeaveTeamDialog';
import {
  type TeamOverview,
  fetchTeamOverview,
  isInviteCodeValid,
  issueInviteCode,
  joinTeam,
  leaveTeam,
  remainingMinutes,
  renameTeam,
} from '@/lib/team/api';

/**
 * チーム画面（docs/design.md §3.1 / §2.5 / §2.6）
 *
 * 認証必須。middleware が /team だけを保護しているため、ここでは
 * 未認証の分岐を持たない（§3.2）。
 *
 * 「チームを作る」操作は無い。全ユーザーはサインアップ時に自分1人のチームを
 * 持っており（§0 変更点2）、家族チームは**そのチームに人を招くこと**で
 * できあがる。この画面がやるのは、招く・入る・抜けるの3つ。
 */
export default function TeamPage() {
  const router = useRouter();

  const [team, setTeam] = useState<TeamOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [leaving, setLeaving] = useState(false);

  const apply = useCallback((overview: TeamOverview) => {
    setTeam(overview);
    setName(overview.name);
    setLoading(false);
  }, []);

  useEffect(() => {
    // アンマウント後に状態を更新しないためのガード
    let active = true;
    fetchTeamOverview().then(
      (overview) => {
        if (active) apply(overview);
      },
      (caught: unknown) => {
        if (!active) return;
        console.error(caught);
        setError(
          caught instanceof Error ? caught.message : 'チーム情報を取得できませんでした',
        );
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [apply]);

  /** 失敗しても画面を壊さないための共通処理。文言は Lambda 側のものを出す */
  const perform = async (action: () => Promise<string | null>) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const message = await action();
      apply(await fetchTeamOverview());
      if (message) setNotice(message);
      // 認証状態に依存するサーバーコンポーネントを描き直す
      router.refresh();
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : '操作に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-2xl p-6">
        <span className="loading loading-spinner" aria-label="読み込み中" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-2xl font-bold">チーム</h1>
      <div className="divider" />

      {error && (
        <div role="alert" className="alert alert-error mb-4 whitespace-pre-line">
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="alert" className="alert alert-success mb-4">
          <span>{notice}</span>
        </div>
      )}

      {team && (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="text-lg font-semibold">チーム名</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                type="text"
                className="input flex-1 min-w-40"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                disabled={busy || name.trim() === '' || name === team.name}
                onClick={() =>
                  perform(async () => {
                    await renameTeam(team.teamId, name.trim());
                    return 'チーム名を変更しました';
                  })
                }
              >
                変更
              </button>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">メンバー（{team.members.length}人）</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {team.members.map((member) => (
                <li key={member.userId} className="flex items-center gap-2">
                  <span>{member.displayName}</span>
                  {member.userId === team.myUserId && (
                    <span className="badge badge-sm">あなた</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">招待</h2>
            <p className="mt-1 text-sm opacity-70">
              コードを伝えると、このチームに参加してもらえます。有効期限は発行から1時間です。
            </p>

            {isInviteCodeValid(team.inviteCodeExpiresAt) && team.inviteCode ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <code className="text-2xl font-bold tracking-widest">
                  {team.inviteCode}
                </code>
                <span className="badge badge-ghost">
                  あと{remainingMinutes(team.inviteCodeExpiresAt as string)}分
                </span>
              </div>
            ) : (
              <p className="mt-2 opacity-70">有効な招待コードはありません。</p>
            )}

            <button
              type="button"
              className="btn btn-primary mt-3"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await issueInviteCode();
                  // 再発行すると旧コードは無効になる（§2.3）。伝えた相手が
                  // 使えなくなるため、その場で分かるようにしておく
                  return '招待コードを発行しました。以前のコードは使えなくなります';
                })
              }
            >
              {isInviteCodeValid(team.inviteCodeExpiresAt)
                ? '招待コードを再発行'
                : '招待コードを発行'}
            </button>
          </section>

          <section>
            <h2 className="text-lg font-semibold">別のチームに参加</h2>
            <p className="mt-1 text-sm opacity-70">
              受け取ったコードを入力してください。
              {team.members.length === 1
                ? '今のレシピは参加先のチームに引き継がれます。'
                : '今のチームのレシピは持ち出されず、このチームに残ります。'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                type="text"
                className="input flex-1 min-w-40 tracking-widest"
                placeholder="ABCD-2345"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                disabled={busy || inviteCode.trim() === ''}
                onClick={() =>
                  perform(async () => {
                    const teamName = await joinTeam(inviteCode.trim());
                    setInviteCode('');
                    return `${teamName} に参加しました`;
                  })
                }
              >
                参加する
              </button>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">チームから抜ける</h2>
            <button
              type="button"
              className="btn btn-outline btn-error mt-2"
              disabled={busy}
              onClick={() => setLeaving(true)}
            >
              抜ける
            </button>
          </section>
        </div>
      )}

      <LeaveTeamDialog
        open={leaving}
        busy={busy}
        onCancel={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          void perform(async () => {
            await leaveTeam();
            return '新しいチームに移りました';
          });
        }}
      />
    </main>
  );
}
