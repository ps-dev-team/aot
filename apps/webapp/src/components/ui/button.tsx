import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

/**
 * The courtroom button: pixel face, square, one-pixel rule.
 *
 * `default` is the HUD control (`.pbtn` in the prototype): a rule that turns
 * brass on hover. `primary` is the brass fill (`.go`) for the one action on a
 * screen. `ghost` is text-only for "Cancel" and "Change email". `danger` is
 * oxblood, for the few things that cannot be undone.
 */
export const Button = ({
  className,
  variant = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) => (
  <button
    className={cn(
      'inline-flex items-center justify-center gap-2 px-[15px] py-2 font-pix text-pix-sm whitespace-nowrap transition-colors',
      'disabled:cursor-default',
      variant === 'default' &&
        'border border-rule text-ink hover:border-brass hover:text-brass disabled:border-rule disabled:text-ink-faint',
      variant === 'primary' &&
        'bg-brass text-brass-ink hover:bg-ink hover:text-bg disabled:bg-rule disabled:text-ink-faint',
      variant === 'ghost' && 'text-ink-soft hover:text-brass disabled:text-ink-faint',
      variant === 'danger' &&
        'border border-oxblood text-oxblood hover:bg-oxblood hover:text-panel disabled:border-rule disabled:text-ink-faint',
      className,
    )}
    type={props.type ?? 'button'}
    {...props}
  />
);
