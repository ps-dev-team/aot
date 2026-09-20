import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * A labelled control. The label is set in the pixel face like every other
 * heading in the courtroom (`h4` in the prototype); hint and error sit under
 * the control in the body face so they read as prose.
 *
 * The `<label>` wraps the control rather than pointing at it with `htmlFor`,
 * so the association holds without threading an id into every input.
 */
export const Field = ({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn('flex flex-col gap-[6px]', className)}>
    <label className="flex flex-col gap-[6px]">
      <span className="font-pix text-pix-sm text-ink-faint">{label}</span>
      {children}
    </label>
    {error ? (
      <p className="text-[12px] text-oxblood" role="alert">
        {error}
      </p>
    ) : hint ? (
      <p className="text-[12px] text-ink-faint">{hint}</p>
    ) : null}
  </div>
);
