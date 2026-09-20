import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth }) }));
vi.mock('@/lib/supabase/route', () => ({ siteBase: () => 'https://app.test' }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('redirect:' + url);
  },
}));
import { requestCode, verifyCode } from './otp-actions';
import { signup, loginWithGoogle } from './actions';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AUTH_REGISTRATION', 'public');
  vi.stubEnv('AUTH_GOOGLE_ENABLED', 'false');
});
afterEach(() => vi.unstubAllEnvs());
function form() {
  const f = new FormData();
  f.set('email', 'Person@example.com');
  return f;
}
it('public OTP requests create users and mark code-style signup emails', async () => {
  auth.signInWithOtp.mockResolvedValue({ error: null });
  await requestCode({}, form());
  expect(auth.signInWithOtp).toHaveBeenCalledWith({
    email: 'person@example.com',
    options: {
      shouldCreateUser: true,
      emailRedirectTo: 'https://app.test/callback?type=email&method=otp',
    },
  });
});
it('invite-only requests never provision users or disclose missing accounts', async () => {
  vi.stubEnv('AUTH_REGISTRATION', 'invite-only');
  auth.signInWithOtp.mockResolvedValue({ error: { code: 'otp_disabled' } });
  expect(await requestCode({}, form())).toEqual({ sent: true, email: 'person@example.com' });
  expect(auth.signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(false);
  expect(await signup({}, form())).toMatchObject({ error: 'unavailable' });
  expect(auth.signUp).not.toHaveBeenCalled();
});
it('uses a safe redirect after verifying the code', async () => {
  auth.verifyOtp.mockResolvedValue({ error: null });
  const f = form();
  f.set('token', '123 456');
  f.set('redirect', 'https://evil.test');
  await expect(verifyCode({}, f)).rejects.toThrow('redirect:/app');
  expect(auth.verifyOtp).toHaveBeenCalledWith({
    email: 'person@example.com',
    token: '123456',
    type: 'email',
  });
});
it('blocks disabled Google login before calling Supabase', async () => {
  await expect(loginWithGoogle(form())).rejects.toThrow('redirect:/login?error=unavailable');
  expect(auth.signInWithOAuth).not.toHaveBeenCalled();
});
it('reports hourly limits separately from resend throttles', async () => {
  auth.signInWithOtp.mockResolvedValue({
    error: { code: 'over_email_send_rate_limit', status: 429 },
  });
  expect((await requestCode({}, form())).error).toContain('Email sending');
  auth.signInWithOtp.mockResolvedValue({ error: { code: 'over_request_rate_limit', status: 429 } });
  expect((await requestCode({}, form())).error).toContain('wait before');
});

it('retains configured Google login', async () => {
  vi.stubEnv('AUTH_GOOGLE_ENABLED', 'true');
  auth.signInWithOAuth.mockResolvedValue({
    data: { url: 'https://accounts.google.com/test' },
    error: null,
  });
  await expect(loginWithGoogle(form())).rejects.toThrow(
    'redirect:https://accounts.google.com/test',
  );
  expect(auth.signInWithOAuth).toHaveBeenCalled();
});
