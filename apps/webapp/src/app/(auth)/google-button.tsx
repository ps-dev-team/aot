import { Button } from '@/components/ui';

import { loginWithGoogle } from './actions';

/**
 * Google sign-in.
 *
 * A form posting to a server action rather than a client-side call, so the
 * OAuth redirect is issued by the server and no Supabase key or redirect URL
 * has to be assembled in the browser.
 */
export const GoogleButton = ({ redirect }: { redirect?: string }) => (
  <form action={loginWithGoogle}>
    {redirect ? <input type="hidden" name="redirect" value={redirect} /> : null}
    <Button type="submit" className="w-full">
      <GoogleMark />
      Continue with Google
    </Button>
  </form>
);

/* Google's mark, inline: it must keep its own colours, so it is not an icon font. */
const GoogleMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-4">
    <path
      fill="#4285F4"
      d="M23.06 12.25c0-.82-.07-1.6-.21-2.36H12v4.47h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.49Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.1 0 5.71-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.02-6.45-4.74H1.7v2.98A11.5 11.5 0 0 0 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.55 14.68a6.9 6.9 0 0 1 0-4.36V7.34H1.7a11.5 11.5 0 0 0 0 10.32l3.85-2.98Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.69 0 3.2.58 4.4 1.72l3.3-3.3C17.7 1.2 15.1 0 12 0 7.52 0 3.65 2.57 1.7 6.34l3.85 2.98C6.46 6.77 9 4.75 12 4.75Z"
    />
  </svg>
);

/** The "or" rule between the provider button and the password form. */
export const OrDivider = () => (
  <div className="flex items-center gap-2">
    <span className="h-px flex-1 bg-rule" />
    <span className="font-pix text-pix-xs text-ink-faint">or</span>
    <span className="h-px flex-1 bg-rule" />
  </div>
);
