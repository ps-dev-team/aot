import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function localChecks(env) {
  const out = [];
  const add = (level, message) => out.push({ level, message });
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SITE_URL',
    'AUTH_EMAIL_HOOK_SECRET',
  ];
  if (env.EMAIL_TRANSPORT !== 'smtp') required.push('RESEND_API_KEY', 'EMAIL_FROM');
  for (const key of required)
    if (!env[key] || /REPLACE_ME|your[-_]|example\.com/i.test(env[key]))
      add('fail', `${key} is missing or contains a placeholder.`);
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SITE_URL']) {
    try {
      const url = new URL(env[key]);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      add('fail', `${key} must be an absolute HTTP(S) URL.`);
    }
  }
  const secret = (env.AUTH_EMAIL_HOOK_SECRET ?? '').replace(/^v1,/, '').replace(/^whsec_/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(secret) || Buffer.from(secret, 'base64').length < 32)
    add('fail', 'AUTH_EMAIL_HOOK_SECRET must contain at least 32 random bytes in webhook format.');
  for (const [key, values] of [
    ['AUTH_REGISTRATION', ['public', 'invite-only']],
    ['AUTH_EMAIL_METHOD', ['password', 'otp']],
    ['AUTH_GOOGLE_ENABLED', ['true', 'false']],
    ['EMAIL_TRANSPORT', ['smtp', 'resend']],
  ])
    if (env[key] && !values.includes(env[key])) add('fail', `${key} has an unsupported value.`);
  if (env.EMAIL_TRANSPORT === 'smtp' && env.VERCEL_ENV)
    add('fail', 'Hosted deployments must not use the local SMTP transport.');
  if (env.AUTH_GOOGLE_ENABLED === 'true')
    add(
      'warn',
      'Confirm Google is enabled with valid credentials in the selected Supabase project.',
    );
  if (env.AUTH_REGISTRATION === 'invite-only')
    add('warn', 'Supabase public signups must also be disabled, including OAuth provisioning.');
  add(
    'info',
    'Vercel root: apps/webapp; include files outside root; leave output directory at framework default.',
  );
  return out;
}
export async function remoteChecks(env, fetcher = fetch) {
  const out = [];
  const add = (level, message) => out.push({ level, message });
  async function call(url, options = {}) {
    return fetcher(url, { ...options, signal: AbortSignal.timeout(10000), redirect: 'manual' });
  }
  if (env.AUTH_EMAIL_HOOK_URL) {
    try {
      const url = new URL(env.AUTH_EMAIL_HOOK_URL);
      if (
        url.protocol !== 'https:' ||
        url.pathname !== '/api/auth/email' ||
        /^(localhost|127\.)/.test(url.hostname)
      )
        throw new Error('invalid_hook_url');
      const body = JSON.stringify({ setupProbe: true });
      const id = 'setup-' + crypto.randomUUID();
      const time = String(Math.floor(Date.now() / 1000));
      const secret = (env.AUTH_EMAIL_HOOK_SECRET ?? '').replace(/^v1,/, '').replace(/^whsec_/, '');
      const signature = createHmac('sha256', Buffer.from(secret, 'base64'))
        .update(`${id}.${time}.${body}`)
        .digest('base64');
      const r = await call(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'webhook-id': id,
          'webhook-timestamp': time,
          'webhook-signature': `v1,${signature}`,
        },
        body,
      });
      const data = await r.json().catch(() => null);
      if (
        r.status === 400 &&
        data?.error?.message === 'Unsupported email action or invalid payload.'
      )
        add('pass', 'Hosted hook verifies the configured secret and rejects the non-email probe.');
      else
        add(
          'fail',
          `Hook probe returned HTTP ${r.status}; check canonical URL, deployment protection, deployed secret, and handler version.`,
        );
    } catch {
      add('fail', 'Hook probe failed. Check the HTTPS URL and reachability.');
    }
  } else add('warn', 'AUTH_EMAIL_HOOK_URL is unset; hosted hook reachability was not checked.');
  if (env.RESEND_API_KEY && env.EMAIL_TRANSPORT !== 'smtp') {
    try {
      const r = await call('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      });
      const j = await r.json();
      if (r.status === 403)
        add('warn', 'Resend key cannot list domains. Verify the sender domain in Resend manually.');
      else if (!r.ok)
        add('fail', `Resend domain check returned HTTP ${r.status}. Check the API key.`);
      else {
        const address = (env.EMAIL_FROM ?? '').match(/<?([^<>\s]+@[^<>\s]+)>?$/)?.[1];
        const domain = address?.split('@')[1]?.toLowerCase();
        const found = j.data?.find((d) => d.name.toLowerCase() === domain);
        add(
          found?.status === 'verified' ? 'pass' : 'fail',
          found?.status === 'verified'
            ? 'Sender domain is verified in Resend.'
            : 'Sender domain is not verified in this Resend account.',
        );
      }
    } catch {
      add('fail', 'Unable to check Resend domains.');
    }
  }
  if (env.SUPABASE_ACCESS_TOKEN) {
    try {
      const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;
      if (!/^[a-z0-9]+\.supabase\.co$/.test(host)) throw new Error();
      const ref = host.split('.')[0];
      const r = await call(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
        headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
      });
      if (!r.ok) add('fail', `Supabase configuration check returned HTTP ${r.status}.`);
      else {
        const j = await r.json();
        add(
          j.disable_signup === (env.AUTH_REGISTRATION === 'invite-only') ? 'pass' : 'fail',
          'Remote Supabase signup policy ' +
            (j.disable_signup === (env.AUTH_REGISTRATION === 'invite-only')
              ? 'matches.'
              : 'does not match AUTH_REGISTRATION.'),
        );
        add(
          j.hook_send_email_enabled ? 'pass' : 'fail',
          j.hook_send_email_enabled
            ? 'Remote email hook is enabled.'
            : 'Remote email hook is disabled.',
        );
        if (env.AUTH_EMAIL_HOOK_URL)
          add(
            j.hook_send_email_uri === env.AUTH_EMAIL_HOOK_URL ? 'pass' : 'fail',
            'Remote hook URL ' +
              (j.hook_send_email_uri === env.AUTH_EMAIL_HOOK_URL
                ? 'matches.'
                : 'does not match the expected endpoint.'),
          );
        add(
          'info',
          `Remote hourly email quota: ${j.rate_limit_email_sent ?? 'unavailable'}; resend interval: ${j.smtp_max_frequency ?? 'unavailable'} seconds.`,
        );
      }
    } catch {
      add('fail', 'Unable to read hosted Supabase configuration.');
    }
  } else
    add(
      'warn',
      'SUPABASE_ACCESS_TOKEN is unset; remote signup policy, hook configuration, and rate limits were not verified.',
    );
  return out;
}
async function main() {
  const index = process.argv.indexOf('--env-file');
  const files =
    index >= 0 ? [process.argv[index + 1]] : ['apps/webapp/.env', 'apps/webapp/.env.local'];
  let values = {};
  for (const file of files)
    if (file && existsSync(file)) values = { ...values, ...parseEnv(readFileSync(file, 'utf8')) };
  const env = { ...values, ...process.env };
  const results = localChecks(env);
  if (process.argv.includes('--remote')) results.push(...(await remoteChecks(env)));
  for (const { level, message } of results) console.log(`${level.toUpperCase()}: ${message}`);
  console.log(
    'No real email was sent. Inbox arrival and successful login require the acceptance test in docs/auth-email.md.',
  );
  process.exitCode = results.some((x) => x.level === 'fail') ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
