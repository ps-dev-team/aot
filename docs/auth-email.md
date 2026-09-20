# Authentication and email

The bootstrap supports password and email-code login, with optional Google.
Supabase owns accounts, sessions, tokens, and rate limits. `@aot/email` owns
subjects, React Email templates, HTML/plain-text rendering, and delivery.

## Choose the login and registration policy

| Variable              | Default    | Meaning                                                               |
| --------------------- | ---------- | --------------------------------------------------------------------- |
| `AUTH_EMAIL_METHOD`   | `password` | Initial login screen: `password` or `otp`. Both remain accessible.    |
| `AUTH_REGISTRATION`   | `public`   | `public` or `invite-only`, enforced by signup and OTP server actions. |
| `AUTH_GOOGLE_ENABLED` | `false`    | Show and allow Google only after configuring that provider.           |

For **invite-only**, also disable **Allow new users to sign up** in the selected
Supabase project's Authentication settings. This is required to block direct
public API registration and new OAuth accounts; hiding a button is insufficient.
The app setting cannot change the hosted database's policy. Existing accounts
retain access. Administrators invite users from the Supabase Users dashboard.
Invitation emails direct recipients to OTP login; subsequent codes authenticate
the existing account. No invitation token is put in that login link.

For public OTP signup, the same two-step form creates an account when needed.
The form replaces email entry with code entry after a successful request. Resend
uses that address, Change email returns to entry, and verification preserves a
safe requested app destination. Unknown accounts in invite-only mode receive
neutral wording. Provider throttling still applies to requests and verification.

## Email events

| Supabase event          | Package sender                                |
| ----------------------- | --------------------------------------------- |
| `signup`, password flow | `sendAuthLinkEmail`, confirmation link        |
| `signup`, OTP flow      | `sendAuthCodeEmail`, numeric code             |
| `magiclink`             | `sendAuthCodeEmail`, numeric code             |
| `recovery`              | `sendAuthLinkEmail`, password reset link      |
| `invite`                | `sendAuthInviteEmail`, link to request a code |

The OTP action marks its redirect with `method=otp` so first-time users receive
codes while password signup continues to receive confirmation links. Unsupported
events, including email changes, are rejected explicitly until their templates
and token handling are implemented. Do not enable new auth flows without them.

The hook verifies Standard Webhooks signatures before reading the email payload.
Its ID becomes the Resend idempotency key, deduplicating retries within Resend's
retention window. SMTP delivery has no provider idempotency guarantee.
Errors log stable codes/statuses, never OTPs, token hashes, full payloads, or
provider messages. The user gets a safe failure message rather than a false
claim that delivery succeeded.

## Local database and local inbox

The existing quickstart remains supported. Use `EMAIL_TRANSPORT=smtp` and the
545xx Supabase stack. Its hook targets `host.docker.internal:3000/api/auth/email`.
Generate a webhook secret with at least 32 random bytes and supply the same value
to Supabase and Next. Open Mailpit at `http://127.0.0.1:54624`.

## Local app with hosted Supabase

Docker is optional. Set the app's Supabase URL and keys to the selected hosted
project and run `pnpm dev`; do not run `db:start` or `db:reset` for that project.
Run linked CLI commands from `packages/db`. Inspect migration plans before
applying them. Local `config.toml` is not proof that hosted settings were applied.
Do not push the entire auth config to change one field: reconcile existing
settings and update only the intended field in the dashboard or Management API.

A hosted Supabase service cannot reach a laptop's localhost. Deploy the email
hook first, or explicitly configure a development HTTPS tunnel. A hosted app
endpoint can serve login requests from the local app. For password links, add
`http://localhost:3000` to both Supabase's allowed redirect URLs and the hosted
app's `AUTH_REDIRECT_ORIGINS`. OTP verification happens in the requesting browser.
Do not copy production credentials into a new project without explicit approval.

## Hosted email activation

1. Set `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` on the deployed
   app. The From domain must be verified in the account that owns that key.
   `EMAIL_REPLY_TO` is optional. Never ship local SMTP settings to Vercel.
2. Deploy the app. Set `NEXT_PUBLIC_SITE_URL` to its canonical HTTPS origin,
   including `www` if the bare domain redirects there.
3. In Supabase Authentication → Hooks → Send Email, choose HTTPS and use the
   canonical `/api/auth/email` URL. Generate a secret and set the identical
   `AUTH_EMAIL_HOOK_SECRET` on the receiving deployment, then redeploy and enable
   the hook. It must be reachable without an interactive deployment-login page.
4. Set `AUTH_EMAIL_HOOK_URL` to that endpoint and run `pnpm setup:check --remote`.
   This signs an invalid, non-email probe. It never sends a real email.
5. Run the real-inbox acceptance below. A build or HTTP 200 alone cannot prove
   inbox arrival or completion of sign-in.

Environment changes require a new deployment. Supabase email template bodies
are not needed once this hook is enabled; package templates ship with app code.
While it is disabled, Supabase uses its own configured sender and templates.

## Diagnostics

`pnpm setup:check` checks local environment configuration without sending email.
Add `--env-file path/to/file` to select a file, or `--remote` for network checks.
Shell environment values take precedence. Credentials are never printed.

Remote checks probe the signed endpoint and, when permitted, inspect Resend
sender domains. An optional `SUPABASE_ACCESS_TOKEN` allows read-only verification
of the selected project's signup policy, hook URL/enabled state, and limits.
Missing permissions are reported as unverified; a sending-only Resend key does
not prove domain verification. No configuration is changed by the checker.

| Failure             | Where to investigate                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| Hook timeout        | Exact HTTPS URL, redirects, deployment protection, server availability  |
| Hook 401            | Signature secret mismatch or deployment protection                      |
| Hook 500            | Structured app log code, sender domain, provider credentials, transport |
| Email sending quota | Project-wide hourly email quota in Supabase Auth rate limits            |
| Resend cooldown     | Per-address minimum interval, separate from the hourly quota            |
| Code rejected       | Latest code, expiration, email spelling, repeated attempts              |

Never guess a reset time from a generic 429. Do not bake a high testing quota into
all projects. User-safe error messages live in `lib/auth/errors.ts`.

## Acceptance evidence

Automated tests use synthetic addresses, mock Supabase/provider boundaries, and
verify real signature validation and template rendering. They do not send email.
For a project with its own configured test environment, record these separately:

- Public mode: new-user OTP and password signup, receipt of the correct email,
  successful verification, and a session that survives reload.
- Invite-only mode: rejected direct public signup, no new account from an unknown
  OTP request, an administrator's invitation, and successful invited-user OTP.
- Password login and reset remain functional. Google works when enabled and
  cannot provision uninvited accounts with remote public signup disabled.
- Invalid/expired code and resend throttling display useful errors.
- Anonymous API requests fail and one user cannot read another user's data.
- Repeat from localhost with the hosted hook and from the deployed app.

Do not mark inbox delivery complete based on admin-generated OTP verification.
