import { redirect } from 'next/navigation';
import { authConfig } from '@/lib/auth/config';
import { AuthCard, AuthLink } from '../auth-card';
import { GoogleButton, OrDivider } from '../google-button';
import { SignupForm } from './signup-form';

export const metadata = { title: 'Create an account' };

export default function SignupPage() {
  const config = authConfig();
  if (!config.publicSignup) redirect('/login');
  if (config.emailMethod === 'otp') redirect('/login?method=otp');
  return (
    <AuthCard
      title="Create an account"
      description="It takes a minute."
      footer={
        <>
          Already have one? <AuthLink href="/login">Sign in</AuthLink>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {config.googleEnabled && (
          <>
            <GoogleButton />
            <OrDivider />
          </>
        )}
        <SignupForm />
      </div>
    </AuthCard>
  );
}
