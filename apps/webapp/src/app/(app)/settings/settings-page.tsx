import type { ReactNode } from 'react';

import { SectionLabel } from '@/components/ui';

/**
 * The frame each settings section sits in.
 *
 * One component rather than a copied header per page, so the measure and the
 * spacing cannot drift between sections.
 */
export const SettingsPage = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <div className="mx-auto w-full max-w-2xl p-6">
    <header className="mb-5">
      <SectionLabel>Settings</SectionLabel>
      <h1 className="font-pix text-pix-lg text-brass">{title}</h1>
      <p className="mt-1 text-[13px] text-ink-soft">{description}</p>
    </header>
    <div className="flex flex-col gap-5">{children}</div>
  </div>
);
