import { createServerDbClient } from '@aot/db';
import { NextResponse, type NextRequest } from 'next/server';

import { isProtectedPath } from './config/routes';

/**
 * Session refresh, and the guard.
 *
 * Two jobs, and only the second is path-dependent. The refresh has to run on
 * every matched request — Supabase SSR expects it, and skipping it on public
 * pages expires a browsing user's session silently. So the client is built and
 * `getClaims()` called regardless; only the redirect asks where you were going.
 *
 * Do not put code between building the client and calling `getClaims()`: the
 * cookie writes that carry a rotated token happen inside that call.
 */
export default async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    // Without Supabase configured there is no session to refresh and nothing to
    // guard. Constructing the client would throw and 500 every page, including
    // the public ones — a preview deployment missing its env should still render.
    return response;
  }

  const supabase = createServerDbClient(url, publishableKey, {
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) =>
      cookiesToSet.forEach(({ name, value, options }) => {
        // Written to the request too, so Server Components in this same render
        // see the refreshed token after a rotation.
        request.cookies.set(name, value);
        response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
      }),
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (isProtectedPath(request.nextUrl.pathname) && !claims) {
    const destination = request.nextUrl.clone();
    destination.pathname = '/login';
    destination.searchParams.set('redirect', request.nextUrl.pathname);

    const redirect = NextResponse.redirect(destination);
    // Carry what Supabase wrote — including the cookies that CLEAR a rejected
    // refresh token. A fresh response drops them, and the next request would
    // arrive with the same dead token and be redirected again, forever.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next's own assets and files with an extension. The auth
     * routes are deliberately included: they need the refresh too.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
