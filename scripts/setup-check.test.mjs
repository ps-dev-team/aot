import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localChecks, remoteChecks } from './setup-check.mjs';
const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://testproject.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public',
  NEXT_PUBLIC_SITE_URL: 'https://app.test',
  AUTH_EMAIL_HOOK_SECRET: 'v1,whsec_' + Buffer.alloc(32, 1).toString('base64'),
  RESEND_API_KEY: 'synthetic-private',
  EMAIL_FROM: 'Test <noreply@verified.test>',
  AUTH_EMAIL_HOOK_URL: 'https://app.test/api/auth/email',
};
test('flags production SMTP and placeholder secrets without displaying them', () => {
  const result = localChecks({
    ...env,
    EMAIL_TRANSPORT: 'smtp',
    VERCEL_ENV: 'production',
    AUTH_EMAIL_HOOK_SECRET: 'secret-value',
  });
  assert(result.some((x) => x.level === 'fail'));
  assert(!JSON.stringify(result).includes('secret-value'));
});
test('validates signed non-email hook probes and sender domains', async () => {
  const results = await remoteChecks(env, async (url, opts) => {
    if (String(url).includes('/domains'))
      return Response.json({ data: [{ name: 'verified.test', status: 'verified' }] });
    assert.deepEqual(JSON.parse(opts.body), { setupProbe: true });
    assert(opts.headers['webhook-signature']);
    return Response.json(
      { error: { message: 'Unsupported email action or invalid payload.' } },
      { status: 400 },
    );
  });
  assert.equal(results.filter((x) => x.level === 'pass').length, 2);
});
test('does not mistake a protected endpoint or a mismatched policy for a passed check', async () => {
  const results = await remoteChecks(
    { ...env, SUPABASE_ACCESS_TOKEN: 'synthetic-management', AUTH_REGISTRATION: 'invite-only' },
    async (url) => {
      if (String(url).includes('api.supabase.com'))
        return Response.json({ disable_signup: false, hook_send_email_enabled: false });
      return new Response('', { status: 401 });
    },
  );
  assert(results.filter((x) => x.level === 'fail').length >= 3);
});
