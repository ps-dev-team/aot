import { NextResponse } from 'next/server';

import { createRouteClient, siteBase } from '@/lib/supabase/route';

import { safeRedirect } from '../schemas';

/**
 * Where every authenticated arrival lands: Google's OAuth return, and the links
 * in the confirmation and recovery emails.
 *
 * OAuth comes back with a PKCE `code`. The emails deliberately carry a
 * `token_hash` instead of Supabase's default `ConfirmationURL` — a token_hash
 * is redeemed with `verifyOtp` and needs no `code_verifier` cookie, so a link
 * opened on a phone after signing up on a laptop still works. Both are handled
 * here, and `/api/auth/email` is what builds those links; the two move together.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const base = siteBase(origin);

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  // Same rule as the login form, and the same reason: this arrives inside a
  // link someone else may have written.
  const next = safeRedirect(searchParams.get('next'));

  if (
    tokenHash &&
    !['signup', 'recovery', 'invite', 'email', 'magiclink'].includes(type ?? 'email')
  ) {
    return NextResponse.redirect(`${base}/login?error=invalid_link`);
  }
  if (!code && !tokenHash) {
    return NextResponse.redirect(`${base}/login?error=invalid_link`);
  }

  const { supabase, applyCookies } = await createRouteClient();
  const { data, error } = tokenHash
    ? await supabase.auth.verifyOtp({
        type: (type as 'signup' | 'recovery' | 'invite' | 'email' | 'magiclink') ?? 'email',
        token_hash: tokenHash,
      })
    : await supabase.auth.exchangeCodeForSession(code ?? '');

  if (error || !data.user) {
    return NextResponse.redirect(`${base}/login?error=invalid_link`);
  }

  const response = NextResponse.redirect(`${base}${next}`);
  applyCookies(response);
  return response;
}
