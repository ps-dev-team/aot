import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Standard Webhooks signature verification.
 *
 * Supabase signs send-email hook requests with the scheme at
 * https://www.standardwebhooks.com — an HMAC-SHA256 over
 * `{id}.{timestamp}.{body}`, sent as `v1,<base64>` in `webhook-signature`.
 * It is thirty lines and fully specified, so we verify it here rather than
 * take a dependency for it.
 *
 * The secret Supabase shows is `v1,whsec_<base64>`. Everything before the
 * `whsec_` is scheme metadata; the key itself is the base64 that follows.
 */

/** How far out of date a request may be, in seconds. Guards against replay. */
const TOLERANCE_SECONDS = 5 * 60;

export type WebhookVerification = { ok: true } | { ok: false; reason: string };

/** Pull the raw key out of `v1,whsec_…` (or a bare `whsec_…`, or raw base64). */
const decodeSecret = (secret: string): Buffer => {
  const withoutScheme = secret.includes(',') ? secret.slice(secret.indexOf(',') + 1) : secret;
  const base64 = withoutScheme.startsWith('whsec_')
    ? withoutScheme.slice('whsec_'.length)
    : withoutScheme;
  return Buffer.from(base64, 'base64');
};

/** Constant-time compare that tolerates different lengths without throwing. */
const matches = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

export type VerifyWebhookParams = {
  /** The request body EXACTLY as received — the signature covers the bytes, not the parsed object. */
  payload: string;
  headers: Headers;
  secret: string;
  /** Seconds since the epoch; injectable so the tolerance window is testable. */
  now?: number;
};

export const verifyWebhook = ({
  payload,
  headers,
  secret,
  now = Math.floor(Date.now() / 1000),
}: VerifyWebhookParams): WebhookVerification => {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signature = headers.get('webhook-signature');

  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing_headers' };

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: 'bad_timestamp' };
  if (Math.abs(now - sent) > TOLERANCE_SECONDS) return { ok: false, reason: 'stale_timestamp' };

  let key: Buffer;
  try {
    key = decodeSecret(secret);
  } catch {
    return { ok: false, reason: 'bad_secret' };
  }
  if (key.length === 0) return { ok: false, reason: 'bad_secret' };

  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');

  // The header carries a space-separated list so a secret can be rotated with
  // both keys live; any one version matching is enough.
  const offered = signature
    .split(' ')
    .map((part) => (part.startsWith('v1,') ? part.slice('v1,'.length) : null))
    .filter((part): part is string => part !== null);

  if (offered.length === 0) return { ok: false, reason: 'no_v1_signature' };
  if (!offered.some((candidate) => matches(candidate, expected))) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  return { ok: true };
};
