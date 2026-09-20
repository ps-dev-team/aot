import { AuthCard, AuthLink } from '../auth-card';

export const metadata = { title: 'Check your email' };

export default function ConfirmEmailPage() {
  return (
    <AuthCard
      title="Check your email"
      description="We sent you a confirmation link."
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    >
      <p className="text-[13px] text-ink-soft">
        Open it on any device — the link does not care which browser asked for it.
      </p>
    </AuthCard>
  );
}
