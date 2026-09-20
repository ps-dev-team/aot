import { render } from '@react-email/render';
import type { ReactElement } from 'react';

import { emailFrom, emailReplyTo, getResend } from './client.js';
import { sendViaSmtp } from './smtp.js';

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  /** A react-email template element; rendered to both HTML and a text fallback. */
  react: ReactElement;
  idempotencyKey?: string;
};

export class EmailDeliveryError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super('Email delivery failed.');
    this.name = 'EmailDeliveryError';
  }
}

export type SendEmailResult = { id: string };

/**
 * The base transactional sender: render a template to HTML plus plain text and
 * hand it to Resend. Every typed sender goes through here, so the From, the
 * Reply-To and the text fallback are decided in one place rather than at each
 * call site.
 *
 * `EMAIL_TRANSPORT=smtp` swaps the destination for a local Mailpit — see
 * `smtp.ts`. That switch lives here, not in the senders, so nothing above this
 * line has to know whether an email really left the building.
 */
export const sendEmail = async ({
  to,
  subject,
  react,
  idempotencyKey,
}: SendEmailParams): Promise<SendEmailResult> => {
  const [html, text] = await Promise.all([render(react), render(react, { plainText: true })]);

  const from = emailFrom();
  const replyTo = emailReplyTo();

  if (process.env.EMAIL_TRANSPORT === 'smtp') {
    return sendViaSmtp({ from, to, subject, html, text, replyTo });
  }

  const { data, error } = await getResend().emails.send(
    {
      from,
      to,
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  if (error)
    throw new EmailDeliveryError(
      error.name,
      'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : undefined,
    );
  if (!data) throw new Error(`[@aot/email] Resend returned no data for "${subject}"`);
  return { id: data.id };
};
