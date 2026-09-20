'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

import { DESTINATIONS } from './destinations';

/**
 * The phase strip, repurposed as navigation: a row of pixel-face labels in one
 * rule, the current one filled brass (`.phases` / `.ph.now` in the prototype).
 */
export const NavLinks = () => {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex border border-rule">
      {DESTINATIONS.map(({ href, label }) => {
        // `startsWith` so a nested route keeps its section lit, but not for the
        // root destination, which would then match everything.
        const active = pathname === href || (href !== '/app' && pathname.startsWith(`${href}/`));
        return (
          <Link
            aria-current={active ? 'page' : undefined}
            className={cn(
              'border-r border-rule px-2 py-1 font-pix text-pix-xs uppercase last:border-r-0',
              active ? 'bg-brass text-brass-ink' : 'text-ink-faint hover:text-ink',
            )}
            href={href}
            key={href}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
};
