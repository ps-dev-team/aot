/**
 * Which paths need a session.
 *
 * A prefix list rather than a decorator on each page, because the guard runs in
 * the proxy — before any page code — and the proxy has only the URL to go on.
 * Everything not listed here is public, which is the safer default to get wrong
 * in a bootstrap: a public page that should be private is visible in review, a
 * private page that should be public is a support ticket.
 */
const PROTECTED_PREFIXES = ['/app', '/scenarios', '/trials', '/settings'] as const;

export const isProtectedPath = (pathname: string): boolean =>
  PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

/** Where a signed-in person goes when they have no particular destination. */
export const DEFAULT_LANDING = '/app';
