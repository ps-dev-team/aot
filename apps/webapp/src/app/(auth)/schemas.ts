import { z } from 'zod';

import { DEFAULT_LANDING } from '@/config/routes';

/**
 * Every auth form's input, in one file.
 *
 * They share more than they differ — an email is an email in all four flows —
 * and keeping them together is what stops the password rule drifting between
 * signup and reset, which is the bug you only find months later when someone
 * cannot sign in with the password they were allowed to choose.
 */

const email = z.string().trim().toLowerCase().pipe(z.email());

/**
 * Twelve characters and nothing else.
 *
 * Composition rules (an uppercase, a digit, a symbol) push people towards
 * `Password1!` and are worse than length. Supabase enforces its own minimum
 * too; keep this at or above it or the form will accept what the API rejects.
 */
const password = z.string().min(12, 'Use at least 12 characters');

export const loginSchema = z.object({
  email,
  password: z.string().min(1),
  redirect: z.string().optional(),
});

export const signupSchema = z.object({
  email,
  password,
  name: z.string().trim().min(1, 'Tell us what to call you').max(120),
});

export const resetRequestSchema = z.object({ email });

export const resetPasswordSchema = z.object({ password });

/**
 * Only same-origin paths, and never back to an auth page.
 *
 * `redirect` arrives as user input — in a query string anyone can write — so a
 * bare `//evil.example` or `https://evil.example` would otherwise turn our
 * login into an open redirect someone can put in an email.
 */
export const safeRedirect = (requested: string | undefined | null, fallback = DEFAULT_LANDING) => {
  if (!requested) return fallback;
  if (!requested.startsWith('/') || requested.startsWith('//')) return fallback;
  if (AUTH_PATHS.some((path) => requested === path || requested.startsWith(`${path}/`))) {
    return fallback;
  }
  return requested;
};

const AUTH_PATHS = ['/login', '/signup', '/reset-request', '/reset-password', '/callback'];
