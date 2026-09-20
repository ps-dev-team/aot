import { AuthCard, AuthLink, AuthError, asAuthError } from '../auth-card';
import { GoogleButton, OrDivider } from '../google-button';
import { LoginForm } from './login-form';
import { OtpForm } from './otp-form';
import { authConfig } from '@/lib/auth/config';
export const metadata = { title: 'Sign in' };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string; method?: string }>;
}) {
  const { redirect, error, method } = await searchParams;
  const config = authConfig();
  const otp = (method === 'otp' || method === 'password' ? method : config.emailMethod) === 'otp';
  const alternative = new URLSearchParams({ method: otp ? 'password' : 'otp' });
  if (redirect) alternative.set('redirect', redirect);
  return (
    <AuthCard
      title="Sign in"
      description={config.publicSignup ? 'Welcome back.' : 'Access is by invitation only.'}
      footer={
        config.publicSignup ? (
          <>
            No account? <AuthLink href="/signup">Create one</AuthLink>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {config.googleEnabled && (
          <>
            <GoogleButton redirect={redirect} />
            <OrDivider />
          </>
        )}
        {otp ? (
          <>
            <AuthError error={asAuthError(error)} />
            <OtpForm redirect={redirect} />
          </>
        ) : (
          <LoginForm redirect={redirect} initialError={error} />
        )}
        <AuthLink href={'/login?' + alternative.toString()}>
          {otp ? 'Use a password instead' : 'Use an email code instead'}
        </AuthLink>
      </div>
    </AuthCard>
  );
}
