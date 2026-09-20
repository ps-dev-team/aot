import { AuthCard } from '../auth-card';
import { ResetPasswordForm } from './reset-password-form';

export const metadata = { title: 'Choose a new password' };

/**
 * Reached only from a recovery link, which `/callback` has already redeemed
 * into a session — so this page needs no token of its own. Without that session
 * the update simply fails, which is the honest outcome for a stale link.
 */
export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password" description="Then you are back in.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
