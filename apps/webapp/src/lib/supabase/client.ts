import { createBrowserDbClient } from '@aot/db';

export type BrowserDbClient = ReturnType<typeof createBrowserDbClient>;

export const createClient = (): BrowserDbClient =>
  createBrowserDbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
