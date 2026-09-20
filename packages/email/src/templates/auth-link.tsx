import { Button, Link, Section, Text } from '@react-email/components';

import { brand, ctaButton } from '../theme.js';
import { EmailLayout } from './layout.js';

/**
 * Which auth link this is. These are the `email_action_type` values Supabase's
 * send-email hook fires that the product has flows for; anything else (magic
 * link, email change, reinvite) is deliberately unhandled — the hook returns an
 * error rather than sending something unwritten.
 */
export type AuthLinkKind = 'confirmation' | 'recovery';

export type AuthLinkEmailProps = {
  kind: AuthLinkKind;
  /** Absolute URL to our `/callback` route, token included. */
  actionUrl: string;
};

const COPY: Record<
  AuthLinkKind,
  { subject: string; preview: string; heading: string; intro: string; cta: string; ignore: string }
> = {
  confirmation: {
    subject: 'Confirm your email address',
    preview: 'One click and your account is ready.',
    heading: 'Confirm your email',
    intro: 'Confirm this address and your account is ready to use.',
    cta: 'Confirm email',
    ignore: 'If you did not create an account, you can safely ignore this email.',
  },
  recovery: {
    subject: 'Reset your password',
    preview: 'A link to set a new password.',
    heading: 'Reset your password',
    intro: 'Use the link below to choose a new password. It expires in an hour.',
    cta: 'Set a new password',
    ignore: 'If you did not ask for this, nothing has changed and you can ignore this email.',
  },
};

/** Subject line for an auth link. */
export const authLinkSubject = (kind: AuthLinkKind): string => COPY[kind].subject;

/**
 * Signup confirmation and password recovery.
 *
 * These are normally raw HTML in `supabase/templates/*.html`, rendered by
 * Supabase's own Go template engine — which means a second copy of the product
 * voice, no brand shell, and a subject line stored as a plain string somewhere
 * else entirely. Here they come through the same layout and the same sender as
 * every other email; Supabase only tells us when to send one, through the
 * webapp's `/api/auth/email` hook.
 *
 * `actionUrl` points at our `/callback` route carrying a `token_hash`, NOT at
 * Supabase's `/verify` endpoint: a token_hash is redeemed with `verifyOtp` and
 * needs no `code_verifier` cookie, so a link opened on a phone after signing up
 * on a laptop still works. That route is the other half of this file — they
 * have to move together.
 */
export const AuthLinkEmail = ({ kind, actionUrl }: AuthLinkEmailProps) => {
  const copy = COPY[kind];
  return (
    <EmailLayout preview={copy.preview} heading={copy.heading}>
      <Text style={paragraph}>{copy.intro}</Text>

      <Section style={ctaWrap}>
        <Button href={actionUrl} style={ctaButton}>
          {copy.cta}
        </Button>
      </Section>

      <Text style={paragraph}>Or paste this link into your browser:</Text>
      <Link href={actionUrl} style={fallbackLink}>
        {actionUrl}
      </Link>

      <Text style={closing}>{copy.ignore}</Text>
    </EmailLayout>
  );
};

const paragraph = {
  margin: '0 0 16px',
  fontSize: '14px',
  lineHeight: '20px',
  color: brand.foreground,
};

const ctaWrap = { textAlign: 'center' as const, padding: '8px 0 24px' };

const fallbackLink = {
  display: 'block',
  marginBottom: '24px',
  fontSize: '12px',
  lineHeight: '18px',
  color: brand.mutedForeground,
  wordBreak: 'break-all' as const,
};

const closing = { margin: 0, fontSize: '14px', lineHeight: '20px', color: brand.mutedForeground };
