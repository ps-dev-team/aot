import { AuthCard, AuthLink } from '../auth-card';
import { ResetRequestForm } from './reset-request-form';

export const metadata = { title: 'Reset your password' };

export default function ResetRequestPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="We will email you a link."
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    >
      <ResetRequestForm />
    </AuthCard>
  );
}
