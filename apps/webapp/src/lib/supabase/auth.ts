import type { ServerDbClient } from './server';

/**
 * The authenticated user's id from the validated JWT claims, or `null`.
 * Centralizes the `getClaims()` access every server action and page needs.
 */
export const getUserId = async (supabase: ServerDbClient): Promise<string | null> => {
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
};
