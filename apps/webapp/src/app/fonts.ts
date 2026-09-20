import { Courier_Prime, Silkscreen } from 'next/font/google';

/**
 * The courtroom's two typefaces, from `docs/raw/courtroom-iso.html`.
 *
 * Courier Prime is the body: transcript, testimony, evidence, forms. Silkscreen
 * is the pixel face for labels, chips, buttons, headings and the HUD — anything
 * that reads as *interface* rather than *record*. Self-hosted through
 * `next/font` so no visitor makes a request to Google at runtime.
 */
export const courier = Courier_Prime({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-mono',
});

export const silkscreen = Silkscreen({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-pix',
});
