import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const send = vi.hoisted(() => ({ code: vi.fn(), link: vi.fn(), invite: vi.fn() }));
vi.mock('@aot/email', () => ({
  sendAuthCodeEmail: send.code,
  sendAuthLinkEmail: send.link,
  sendAuthInviteEmail: send.invite,
  EmailDeliveryError: class extends Error {},
}));
vi.mock('@/lib/supabase/route', () => ({ siteBase: () => 'https://app.test' }));
import { POST } from './route';
const key = Buffer.alloc(32, 3);
function request(action: string, redirect = 'https://app.test/callback', signed = true, age = 0) {
  const body = JSON.stringify({
    user: { email: 'person@example.com' },
    email_data: {
      email_action_type: action,
      token: '123456',
      token_hash: 'synthetic-hash',
      redirect_to: redirect,
    },
  });
  const t = String(Math.floor(Date.now() / 1000) - age);
  const signature = createHmac('sha256', key).update(`id.${t}.${body}`).digest('base64');
  return new Request('https://app.test/api/auth/email', {
    method: 'POST',
    body,
    headers: signed
      ? { 'webhook-id': 'id', 'webhook-timestamp': t, 'webhook-signature': `v1,${signature}` }
      : {},
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AUTH_EMAIL_HOOK_SECRET', 'v1,whsec_' + key.toString('base64'));
  send.code.mockResolvedValue({ id: 'x' });
  send.link.mockResolvedValue({ id: 'x' });
  send.invite.mockResolvedValue({ id: 'x' });
});
afterEach(() => vi.unstubAllEnvs());
it.each(['magiclink', 'signup'])('sends OTP for %s with stable retry identity', async (action) => {
  expect((await POST(request(action, 'https://app.test/callback?method=otp'))).status).toBe(200);
  expect(send.code).toHaveBeenCalledWith({
    to: 'person@example.com',
    code: '123456',
    idempotencyKey: 'auth-email/id',
  });
});
it.each(['signup', 'recovery'])('preserves password %s links', async (action) => {
  expect((await POST(request(action))).status).toBe(200);
  expect(send.link).toHaveBeenCalled();
  const url = new URL(send.link.mock.calls[0][0].actionUrl);
  expect(url.searchParams.get('type')).toBe(action);
  expect(url.searchParams.get('token_hash')).toBe('synthetic-hash');
});
it('invitations point to OTP login without including an auth token', async () => {
  expect((await POST(request('invite'))).status).toBe(200);
  expect(send.invite).toHaveBeenCalledWith({
    to: 'person@example.com',
    loginUrl: 'https://app.test/login?method=otp',
    idempotencyKey: 'auth-email/id',
  });
});
it('rejects unsigned, stale and unsupported events', async () => {
  expect((await POST(request('signup', undefined, false))).status).toBe(401);
  expect((await POST(request('signup', undefined, true, 600))).status).toBe(401);
  expect((await POST(request('email_change'))).status).toBe(400);
  expect(send.link).not.toHaveBeenCalled();
});
it('rejects unapproved password-link origins', async () => {
  expect((await POST(request('recovery', 'https://evil.test/callback'))).status).toBe(400);
  expect(send.link).not.toHaveBeenCalled();
});
it('catches async provider failure and returns a JSON error', async () => {
  send.code.mockRejectedValue(new Error('provider details must stay private'));
  const r = await POST(request('magiclink'));
  expect(r.status).toBe(500);
  expect(await r.json()).toEqual({
    error: { http_code: 500, message: 'Could not send the email.' },
  });
});
