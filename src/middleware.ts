import { fetchAuthSession } from 'aws-amplify/auth/server';
import { type NextRequest, NextResponse } from 'next/server';
import { runWithAmplifyServerContext } from '@/lib/amplify/server';

/**
 * 認証が必要なルートの保護（docs/design.md §3.2）
 *
 * 保護対象は /team のみ。理由は設計上、他のページがすべてゲストでも
 * 利用できるため:
 *   - /recipes, /labels はゲストのデータを localStorage で扱う
 *   - /settings はテーマ設定だけゲストに開放し、アカウント関連の項目は
 *     ページ内で出し分ける
 *
 * middleware を広く掛けるとゲストの導線を塞いでしまうので、ここは
 * 意図的に最小限にしている。
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const authenticated = await runWithAmplifyServerContext({
    nextServerContext: { request, response },
    operation: async (contextSpec) => {
      try {
        const session = await fetchAuthSession(contextSpec);
        return session.tokens?.accessToken !== undefined;
      } catch {
        // 未認証の場合は例外になる。エラーではなく通常の分岐として扱う
        return false;
      }
    },
  });

  if (!authenticated) {
    const signInUrl = new URL('/auth/sign-in', request.url);
    // サインイン後に元のページへ戻せるようにしておく
    signInUrl.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  matcher: ['/team/:path*'],
};
