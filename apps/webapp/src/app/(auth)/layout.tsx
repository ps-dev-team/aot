import type { ReactNode } from 'react';

/**
 * The frame every auth screen sits in: the dark stage, one centred card.
 *
 * No navigation on purpose — someone on these pages has exactly one job, and
 * the only way out is finishing it or the link back to sign in.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-stage p-5">
      <p className="mb-5 font-pix text-pix-md tracking-wide text-brass">AGENT ON TRIAL</p>
      <main className="w-full max-w-sm">{children}</main>
    </div>
  );
}
