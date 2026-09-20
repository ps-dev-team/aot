import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Hud } from '@/components/shell/hud';
import { createClient } from '@/lib/supabase/server';

/**
 * The signed-in shell: HUD on top, page fills the rest.
 *
 * The session is read again here even though the proxy already guarded the
 * path. That is not redundancy for its own sake — the proxy validates a token
 * and redirects, but it cannot hand the page a user, and a layout that assumes
 * one without checking is one refactor away from rendering for nobody.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();

  /*
   * `getUser()` rather than `getClaims()` here, deliberately.
   *
   * Claims come out of the JWT, which is only rewritten when the token rotates
   * — so a name changed a moment ago keeps showing the old one for up to an
   * hour, which reads as "the save did not work". `getUser()` asks the auth
   * server and comes back current.
   */
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) redirect('/login');

  const account = {
    name: (user.user_metadata?.['name'] as string | undefined) ?? '',
    email: user.email ?? '',
  };

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <Hud account={account} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
