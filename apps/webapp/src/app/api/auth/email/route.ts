import {
  EmailDeliveryError,
  sendAuthCodeEmail,
  sendAuthInviteEmail,
  sendAuthLinkEmail,
} from '@aot/email';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyWebhook } from '@/lib/auth/webhook';
import { siteBase } from '@/lib/supabase/route';
export const runtime = 'nodejs';
const payloadSchema = z.object({
  user: z.object({ email: z.email() }),
  email_data: z.object({
    token: z.string().optional(),
    token_hash: z.string().optional(),
    redirect_to: z.string().optional(),
    email_action_type: z.enum(['signup', 'recovery', 'magiclink', 'invite']),
  }),
});
const fail = (status: number, message: string) =>
  NextResponse.json({ error: { http_code: status, message } }, { status });
export async function POST(request: Request) {
  const secret = process.env.AUTH_EMAIL_HOOK_SECRET;
  if (!secret) return fail(500, 'Email hook is not configured.');
  const body = await request.text();
  const verification = verifyWebhook({ payload: body, headers: request.headers, secret });
  if (!verification.ok) {
    console.warn('[auth-email-hook]', { code: verification.reason });
    return fail(401, 'Invalid webhook signature.');
  }
  try {
    const { user, email_data: email } = payloadSchema.parse(JSON.parse(body));
    const idempotencyKey = `auth-email/${request.headers.get('webhook-id')}`;
    if (email.email_action_type === 'invite') {
      await sendAuthInviteEmail({
        to: user.email,
        loginUrl: new URL('/login?method=otp', siteBase()).href,
        idempotencyKey,
      });
    } else if (
      email.email_action_type === 'magiclink' ||
      (email.email_action_type === 'signup' &&
        new URL(email.redirect_to || siteBase()).searchParams.get('method') === 'otp')
    ) {
      const code = z
        .string()
        .regex(/^\d{6,10}$/)
        .parse(email.token);
      await sendAuthCodeEmail({ to: user.email, code, idempotencyKey });
    } else {
      const tokenHash = z.string().min(1).parse(email.token_hash);
      const type = email.email_action_type;
      // Use trusted deployment configuration, never a webhook-supplied origin.
      // Explicit extra origins allow a hosted hook to serve localhost development.
      const requested = new URL(email.redirect_to || '/callback', siteBase());
      const allowed = [
        new URL(siteBase()).origin,
        ...(process.env.AUTH_REDIRECT_ORIGINS ?? '')
          .split(',')
          .filter(Boolean)
          .map((x) => new URL(x.trim()).origin),
      ];
      if (!allowed.includes(requested.origin)) return fail(400, 'Redirect origin is not allowed.');
      const url = new URL('/callback', requested.origin);
      url.searchParams.set('type', type);
      url.searchParams.set('token_hash', tokenHash);
      if (type === 'recovery') url.searchParams.set('next', '/reset-password');
      await sendAuthLinkEmail({
        to: user.email,
        kind: type === 'signup' ? 'confirmation' : 'recovery',
        actionUrl: url.href,
        idempotencyKey,
      });
    }
    return NextResponse.json({});
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return fail(400, 'Unsupported email action or invalid payload.');
    console.error(
      '[auth-email-hook]',
      error instanceof EmailDeliveryError
        ? { code: error.code, status: error.status }
        : { code: 'email_configuration_or_transport_failure' },
    );
    return fail(500, 'Could not send the email.');
  }
}
