import Link from 'next/link';
import type { ReactNode } from 'react';

import { logout } from '@/app/(auth)/actions';
import { Button } from '@/components/ui';

import { NavLinks } from './nav-links';

export type Account = { name: string; email: string };

/**
 * The bar across the top, in the shape of the prototype's HUD: brand on the
 * left, the navigation strip, a slot for page-specific actions, and the
 * signed-in person on the right.
 *
 * `actions` is a slot rather than a prop list because the right side is always
 * page-specific — a "New scenario" on one screen, a pause control on the next.
 */
export const Hud = ({ account, actions }: { account: Account; actions?: ReactNode }) => (
  <header className="flex h-11 shrink-0 items-center gap-3 border-b border-rule bg-panel px-[14px] font-pix text-pix-sm text-ink-faint">
    <Link className="text-brass hover:text-ink" href="/app">
      AGENT ON TRIAL
    </Link>

    <NavLinks />

    <span className="flex-1" />

    {actions}

    <Link
      className="max-w-48 truncate text-ink-soft hover:text-brass"
      href="/settings"
      title={account.email}
    >
      {account.name || account.email}
    </Link>

    {/* A form, so signing out is a POST rather than a link that mutates a
        session — and so it still works without JavaScript. */}
    <form action={logout}>
      <Button className="px-[11px] py-[6px]" type="submit">
        Sign out
      </Button>
    </form>
  </header>
);
