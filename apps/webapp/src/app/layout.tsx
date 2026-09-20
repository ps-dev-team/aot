import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { courier, silkscreen } from './fonts';
import './global.css';

export const metadata: Metadata = {
  title: { default: 'Agent on Trial', template: '%s · Agent on Trial' },
  description: 'An AI courtroom agent benchmark.',
};

/**
 * The root. The two font variables are the only thing the identity needs from
 * this tag — everything else is in `global.css`. `data-theme="light"` on
 * <html> flips the palette; the default is the dark courtroom.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={`${courier.variable} ${silkscreen.variable}`} lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
