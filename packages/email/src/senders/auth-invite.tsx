import { Link, Text } from '@react-email/components';
import { EmailLayout } from '../templates/layout.js';
import { sendEmail } from '../send.js';

export function sendAuthInviteEmail({
  to,
  loginUrl,
  idempotencyKey,
}: {
  to: string;
  loginUrl: string;
  idempotencyKey?: string;
}) {
  return sendEmail({
    to,
    idempotencyKey,
    subject: 'You have been invited',
    react: (
      <EmailLayout preview="Your invitation to sign in." heading="You have been invited">
        <Text>
          Your account is ready. Open the login page and request a sign-in code using this email
          address.
        </Text>
        <Link href={loginUrl}>Open the login page</Link>
      </EmailLayout>
    ),
  });
}
