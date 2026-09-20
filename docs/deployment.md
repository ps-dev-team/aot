# Vercel deployment

`apps/webapp/vercel.json` versions the Next.js framework and
`pnpm exec nx build webapp` command. Nx builds the app's shared dependencies.

In the Vercel project, set Root Directory to **apps/webapp** and enable
**Include source files outside the Root Directory**. Leave Install Command and
Output Directory at their defaults. Use Node 24.x, matching the supported tooling.
The build creates `apps/webapp/.next`; a project rooted at `.` will look in the
wrong place even if compilation passes. The root setting cannot live in vercel.json.

Keep one intended Vercel project per app/environment. If a repository is linked
to multiple projects, identify which owns the production domain before changing
settings or secrets. Configure environment values on that project and redeploy
after changes. Preview success does not establish production readiness.

See [auth and email](auth-email.md) for hook activation, the canonical host,
registration policy, and the required real-inbox checks. Deployment protection
must not intercept server-to-server email-hook requests; the hook has its own
signature verification. Keep credentials ignored and use project-scoped values.

Run `pnpm setup:check --remote` against the intended environment, then record
build success, provider acceptance, inbox arrival, and completed login separately.
