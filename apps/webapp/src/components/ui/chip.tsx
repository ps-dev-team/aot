import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type ChipTone = 'default' | 'brass' | 'oxblood' | 'ok' | 'teal';

/**
 * The prototype's `.chip` / `.pill`: eight-pixel Silkscreen in a one-pixel
 * rule. Fact ids, evidence ids, "repaired after 1 retry", "knowing falsehood".
 */
export const Chip = ({
  className,
  tone = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone }) => (
  <span
    className={cn(
      'inline-block border px-[5px] py-[2px] font-pix text-pix-xs whitespace-nowrap',
      tone === 'default' && 'border-rule text-ink-soft',
      tone === 'brass' && 'border-brass-dim text-brass',
      tone === 'oxblood' && 'border-oxblood text-oxblood',
      tone === 'ok' && 'border-ok text-ok',
      tone === 'teal' && 'border-teal text-teal',
      className,
    )}
    {...props}
  />
);
