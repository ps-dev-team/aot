import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The prototype's `.card`: panel fill, a two-pixel brass border, and the hard
 * offset shadow. It is the surface every modal, form and report sits on.
 */
export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('border-2 border-brass bg-panel p-[18px_20px] shadow-hard-lg', className)}
    {...props}
  />
);

export const CardTitle = ({ children, className }: { children: ReactNode; className?: string }) => (
  <h3 className={cn('mb-2 font-pix text-pix-lg leading-snug text-brass', className)}>{children}</h3>
);

export const CardDescription = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <p className={cn('mb-[13px] text-[13px] leading-normal text-ink-soft', className)}>{children}</p>
);

/** The pixel-face section label (`h4` in the prototype). */
export const SectionLabel = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => <h4 className={cn('mb-[9px] font-pix text-pix-sm text-ink-faint', className)}>{children}</h4>;
