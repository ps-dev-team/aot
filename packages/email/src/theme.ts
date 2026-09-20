/**
 * The email palette.
 *
 * Separate from the app's CSS variables on purpose: email clients do not
 * resolve `var()`, so every value here is a literal that has to be kept in step
 * with `apps/webapp/src/app/global.css` by hand. These are the courtroom's
 * light-theme tokens — an email on parchment reads better than one on dark wood.
 */
export const brand = {
  background: '#e8dfcc', // panel (light)
  surface: '#d9cdb8', // bg (light)
  foreground: '#241c12', // ink (light)
  mutedForeground: '#5a4c38', // ink-soft (light)
  border: '#b6a488', // rule (light)
  primary: '#c9a227', // brass
  primaryForeground: '#191309', // brass-ink
} as const;

/** The one call-to-action button style, shared by every template. Square, like everything else. */
export const ctaButton = {
  backgroundColor: brand.primary,
  color: brand.primaryForeground,
  borderRadius: '0',
  padding: '12px 24px',
  fontSize: '14px',
  fontWeight: 700,
  fontFamily: "'Courier Prime', 'Courier New', monospace",
  textDecoration: 'none',
  display: 'inline-block',
} as const;
