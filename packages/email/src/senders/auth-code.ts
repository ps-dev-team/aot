import { sendEmail } from '../send.js';
import { AuthCodeEmail, authCodeSubject } from '../templates/auth-code.js';

export function sendAuthCodeEmail({
  to,
  code,
  idempotencyKey,
}: {
  to: string;
  code: string;
  idempotencyKey?: string;
}) {
  if (!/^\d{6,10}$/.test(code)) throw new Error('Invalid sign-in code.');
  return sendEmail({
    to,
    subject: authCodeSubject,
    react: AuthCodeEmail({ code }),
    idempotencyKey,
  });
}
