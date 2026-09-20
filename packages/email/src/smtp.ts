import type { Transporter } from 'nodemailer';

import type { SendEmailResult } from './send.js';

/**
 * Local/dev SMTP transport. Instead of hitting Resend, mail is delivered to the
 * Mailpit catcher the local Supabase stack already runs for auth emails, so
 * nothing leaves the machine and every email lands in one inbox.
 *
 * Activated by `EMAIL_TRANSPORT=smtp`. Host and port default to the Supabase
 * local Mailpit and are overridable with `SMTP_HOST` / `SMTP_PORT`. `nodemailer`
 * is imported lazily so the production path never loads it.
 */
let cached: Transporter | null = null;

const getTransporter = async (): Promise<Transporter> => {
  if (cached) return cached;
  const { createTransport } = await import('nodemailer');
  cached = createTransport({
    host: process.env.SMTP_HOST ?? '127.0.0.1',
    port: Number(process.env.SMTP_PORT ?? 54625),
    secure: false, // Mailpit listens plaintext and accepts unauthenticated mail
  });
  return cached;
};

export type SendViaSmtpParams = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export const sendViaSmtp = async ({
  from,
  to,
  subject,
  html,
  text,
  replyTo,
}: SendViaSmtpParams): Promise<SendEmailResult> => {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({ from, to, subject, html, text, replyTo });
  return { id: info.messageId };
};
