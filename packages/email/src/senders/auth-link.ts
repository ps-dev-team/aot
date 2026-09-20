import { sendEmail, type SendEmailResult } from '../send.js';
import { AuthLinkEmail, authLinkSubject, type AuthLinkKind } from '../templates/auth-link.js';

export type SendAuthLinkEmailParams = {
  /** The account's email address, as Supabase has it. */
  to: string;
  kind: AuthLinkKind;
  /** Absolute URL to our `/callback` route, token included. */
  actionUrl: string;
  idempotencyKey?: string;
};

/**
 * Send a signup confirmation or password recovery link.
 *
 * Unlike a sender called from a server action, the caller here is Supabase's
 * send-email hook: Supabase decides an auth email is due and the webapp's
 * `/api/auth/email` route turns that into this call. Everything else is the
 * same shape as any other sender — subject and template live here, and the
 * caller never touches Resend or HTML.
 */
export const sendAuthLinkEmail = ({
  to,
  kind,
  actionUrl,
  idempotencyKey,
}: SendAuthLinkEmailParams): Promise<SendEmailResult> =>
  sendEmail({
    to,
    idempotencyKey,
    subject: authLinkSubject(kind),
    react: AuthLinkEmail({ kind, actionUrl }),
  });
