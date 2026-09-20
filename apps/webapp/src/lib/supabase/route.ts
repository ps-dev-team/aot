import { createServerDbClient } from '@aot/db';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

import type { ServerDbClient } from './server';

/**
 * Supabase client for Route Handlers that finish with a redirect.
 *
 * Cookie mutations made through `cookies()` are NOT applied to a `NextResponse`
 * you construct yourself, so auth cookies written during the request — the
 * session set by an OAuth exchange, or the ones cleared on sign-out — would be
 * silently dropped. Every mutation is captured here and `applyCookies(response)`
 * replays it onto the outgoing response.
 */
export const createRouteClient = async (): Promise<{
  supabase: ServerDbClient;
  applyCookies: (response: NextResponse) => void;
}> => {
  const cookieStore = await cookies();
  const pending: Parameters<typeof cookieStore.set>[] = [];
  const supabase = createServerDbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) =>
        cookiesToSet.forEach(({ name, value, options }) => {
          const opts = options as Parameters<typeof cookieStore.set>[2];
          cookieStore.set(name, value, opts);
          pending.push([name, value, opts]);
        }),
    },
  );
  return {
    supabase,
    applyCookies: (response) => pending.forEach((args) => response.cookies.set(...args)),
  };
};

/**
 * The origin to build absolute redirects from.
 *
 * Configured rather than taken from the request: in dev Next reports
 * `localhost` while the browser may be on `127.0.0.1`, and those are distinct
 * cookie hosts — redirecting across them drops the auth cookies the route just
 * set, landing the person back on login with no explanation.
 */
export const siteBase = (fallback = 'http://localhost:3000'): string =>
  process.env.NEXT_PUBLIC_SITE_URL ?? fallback;
