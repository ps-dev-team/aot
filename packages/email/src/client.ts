import { Resend } from 'resend';

/**
 * Resend client and sender identity, read lazily from the environment so this
 * package imports cleanly — templates and their tests need no credentials.
 *
 * Set `RESEND_API_KEY`, `EMAIL_FROM` and optionally `EMAIL_REPLY_TO`. The same
 * Resend account and verified domain serve the Supabase auth-email path, since
 * both go through `sendEmail`.
 */
let cached: Resend | null = null;

export const getResend = (): Resend => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('[@aot/email] RESEND_API_KEY is not set');
  cached ??= new Resend(apiKey);
  return cached;
};

/** The `From` header. Override per deployment; the default is a safe placeholder. */
export const emailFrom = (): string => process.env.EMAIL_FROM ?? 'Acme <no-reply@example.com>';

/** Optional `Reply-To`; omitted when unset. */
export const emailReplyTo = (): string | undefined => process.env.EMAIL_REPLY_TO || undefined;
