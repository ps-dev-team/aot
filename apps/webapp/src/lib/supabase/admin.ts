import { createAdminDbClient } from '@aot/db';

export type AdminDbClient = ReturnType<typeof createAdminDbClient>;

/**
 * Supabase client holding the SECRET key. Bypasses RLS, carries no session, and
 * must never be constructed anywhere the browser can reach.
 *
 * It exists for the writes the schema deliberately refuses to a user. It throws
 * loudly when unconfigured rather than returning a client that quietly does
 * nothing — a privileged write that silently no-ops leaves an account in a
 * state the rest of the flow assumes cannot happen.
 */
export const createAdminClient = (): AdminDbClient => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error('SUPABASE_SECRET_KEY and NEXT_PUBLIC_SUPABASE_URL are required');
  }

  return createAdminDbClient(url, secretKey);
};
