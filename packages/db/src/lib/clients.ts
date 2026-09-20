import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../types/database.types.js';

/**
 * Every Supabase client the product builds, in one place.
 *
 * Three of them, and the difference is which key they carry — which is the
 * difference between "this user, under RLS" and "no user, RLS bypassed". Naming
 * them apart here means a call site cannot pick the privileged one by accident:
 * it has to import the word `Admin`.
 *
 * The cookie adapter is injected rather than imported because this package must
 * not know about Next. The app passes `cookies()` in; a route handler passes a
 * capturing adapter (see `lib/supabase/route.ts`), and the same factory serves
 * both.
 */
export type CookieAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; value: string; options?: unknown }[]) => void;
};

/** Session path — publishable key, browser. */
export const createBrowserDbClient = (url: string, publishableKey: string) =>
  createBrowserClient<Database>(url, publishableKey);

/** Session path — publishable key, cookie-bound. The framework supplies the adapter. */
export const createServerDbClient = (url: string, publishableKey: string, cookies: CookieAdapter) =>
  createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (toSet) => cookies.setAll(toSet),
    },
  });

/**
 * Privileged path — secret key, NO session. Server-only, bypasses RLS.
 *
 * It exists for the writes the schema deliberately refuses to a user. Keep it
 * out of anything the browser can reach: the guarantees RLS gives only hold
 * while this key stays on the server.
 */
export const createAdminDbClient = (url: string, secretKey: string) =>
  createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
