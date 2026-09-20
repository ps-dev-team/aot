/**
 * Everywhere the top bar can take you.
 *
 * One array, so adding a section is a single entry — the bar derives its own
 * active state from the path and needs nothing else. Plain data, no icons: the
 * courtroom's navigation is words in the pixel face, like the HUD's phase strip.
 */
export type Destination = { href: string; label: string };

export const DESTINATIONS: Destination[] = [
  { href: '/app', label: 'Home' },
  { href: '/scenarios', label: 'Scenarios' },
  { href: '/trials', label: 'Trials' },
];
