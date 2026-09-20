import type { ReactNode } from 'react';

/** Settings has one section for now, so no side navigation: the page is the area. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <div className="min-w-0 flex-1 overflow-y-auto bg-stage">{children}</div>;
}
