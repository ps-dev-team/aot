import { createServerDbClient } from '@aot/db';
import { cookies } from 'next/headers';

export type ServerDbClient = ReturnType<typeof createServerDbClient>;

export const createClient = async (): Promise<ServerDbClient> => {
  const cookieStore = await cookies();
  return createServerDbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only. Safe to
          // ignore: the proxy refreshes the session on every matched request.
        }
      },
    },
  );
};
