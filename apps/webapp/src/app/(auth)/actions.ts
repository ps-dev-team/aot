'use server';

import { authConfig } from '@/lib/auth/config';
import { authFailure } from '@/lib/auth/errors';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { siteBase } from '@/lib/supabase/route';

import {
  loginSchema,
  resetPasswordSchema,
  resetRequestSchema,
  safeRedirect,
  signupSchema,
} from './schemas';

/**
 * The four password flows and Google, as server actions.
 *
 * They all return a small tagged state rather than throwing, because the forms
 * render the message and a thrown error in a Server Action reaches the client
 * as a generic digest with nothing useful in it.
 */

export type AuthState = {
  error?: 'invalid_credentials' | 'invalid_input' | 'email_taken' | 'weak_password' | 'unavailable';
  message?: string;
  done?: boolean;
};

/**
 * Sign in with an email and a password.
 *
 * One message for both a wrong password and an unknown address, deliberately:
 * telling them apart tells an attacker which addresses have accounts here.
 */
export const login = async (_previous: AuthState, formData: FormData): Promise<AuthState> => {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    redirect: formData.get('redirect') ?? undefined,
  });

  if (!parsed.success) return { error: 'invalid_input' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === 'invalid_credentials') return { error: 'invalid_credentials' };
    return { error: error.status === 400 ? 'invalid_credentials' : 'unavailable' };
  }

  redirect(safeRedirect(parsed.data.redirect));
};

/**
 * Create an account.
 *
 * Supabase sends nothing itself: the confirmation link is rendered by
 * `@aot/email` from the send-email hook in `/api/auth/email`. `emailRedirectTo`
 * is where that link points once the token is appended.
 */
export const signup = async (_previous: AuthState, formData: FormData): Promise<AuthState> => {
  if (!authConfig().publicSignup)
    return { error: 'unavailable', message: 'Access is by invitation only.' };
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    name: formData.get('name'),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: 'invalid_input', message: issue?.message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
      emailRedirectTo: `${siteBase()}/callback?type=signup`,
    },
  });

  if (error) {
    if (error.code === 'user_already_exists') return { error: 'email_taken' };
    if (error.code === 'weak_password') return { error: 'weak_password', message: error.message };
    return { error: 'unavailable' };
  }

  redirect('/confirm-email');
};

/**
 * Ask for a recovery link.
 *
 * Always reports success, whether or not the address has an account — the
 * alternative is a free membership oracle for anyone with a list of emails.
 */
export const requestReset = async (
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> => {
  const parsed = resetRequestSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: 'invalid_input' };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteBase()}/callback?type=recovery&next=/reset-password`,
  });

  if (error) return { error: 'unavailable', message: authFailure(error, 'password_reset') };
  return { done: true };
};

/**
 * Set a new password.
 *
 * Reached only from the recovery link, which the callback has already redeemed
 * into a session — so this is an ordinary authenticated update, and Supabase
 * refuses it if that session is missing.
 */
export const resetPassword = async (
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> => {
  const parsed = resetPasswordSchema.safeParse({ password: formData.get('password') });
  if (!parsed.success) {
    return { error: 'invalid_input', message: parsed.error.issues[0]?.message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    if (error.code === 'weak_password') return { error: 'weak_password', message: error.message };
    return { error: 'unavailable' };
  }

  redirect('/app');
};

/** Start Google's OAuth dance; `/callback` finishes it. */
export const loginWithGoogle = async (formData: FormData): Promise<void> => {
  if (!authConfig().googleEnabled) redirect('/login?error=unavailable');
  const requested = safeRedirect(formData.get('redirect')?.toString());

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${siteBase()}/callback?next=${encodeURIComponent(requested)}` },
  });

  if (error || !data.url) redirect('/login?error=unavailable');
  redirect(data.url);
};

/** Sign out, from anywhere. */
export const logout = async (): Promise<void> => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
};
