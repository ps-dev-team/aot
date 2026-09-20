import type { ReactNode } from 'react';
import Link from 'next/link';

import { Card, CardDescription, CardTitle } from '@/components/ui';

export type AuthCardProps = {
  title: string;
  description: string;
  children: ReactNode;
  /** The one way out, under the card. */
  footer?: ReactNode;
};

/** The shell all auth screens share, so they cannot drift apart visually. */
export const AuthCard = ({ title, description, children, footer }: AuthCardProps) => (
  <div className="flex flex-col gap-3">
    <Card>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
      {children}
    </Card>
    {footer ? <p className="text-center text-[12.5px] text-ink-faint">{footer}</p> : null}
  </div>
);

/** A text link in an auth card's footer. Styled once, used everywhere. */
export const AuthLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="text-ink-soft underline underline-offset-4 hover:text-brass">
    {children}
  </Link>
);

/** The one place an auth error is turned into a sentence. */
export const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'That email and password do not match an account.',
  invalid_input: 'Check the fields and try again.',
  email_taken: 'That address already has an account. Try signing in.',
  weak_password: 'Pick a longer password.',
  invalid_link: 'That link has expired or was already used. Ask for a new one.',
  unavailable: 'Something went wrong on our side. Try again in a moment.',
};

/**
 * Narrow a query-string error to one we have wording for.
 *
 * `?error=` is user input like any other, so an unknown value falls back to the
 * generic message rather than rendering whatever was in the URL.
 */
export const asAuthError = (value?: string): string | undefined =>
  value && value in ERROR_MESSAGES ? value : value ? 'unavailable' : undefined;

export const AuthError = ({ error, message }: { error?: string; message?: string }) =>
  error ? (
    <p role="alert" className="text-[12.5px] text-oxblood">
      {message ?? ERROR_MESSAGES[error] ?? ERROR_MESSAGES['unavailable']}
    </p>
  ) : null;
