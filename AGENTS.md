# Agent on Trial — repository guide

See [`README.md`](README.md) for what is built and why, and
[`docs/raw/AI-Courtroom-Agent-Benchmark-Specification.md`](docs/raw/AI-Courtroom-Agent-Benchmark-Specification.md)
for what is being built. This file is the operating manual: the commands, and
the things that will look like bugs otherwise.

```
apps/webapp       the Next.js app. Owns .env.local
packages/db       @aot/db — Supabase clients + generated types
packages/email    @aot/email — templates, Resend, local SMTP
packages/db/supabase — config.toml, migrations, the local stack
docs/raw          spec, ideation export, courtroom-iso.html prototype
```

## Commands

Run from the repository root.

| Command          | What it does                                         |
| ---------------- | ---------------------------------------------------- |
| `pnpm dev`       | Next dev server on :3000                             |
| `pnpm build`     | Build every project                                  |
| `pnpm typecheck` | `tsc --noEmit` in every project                      |
| `pnpm lint`      | ESLint in every project, through Nx                  |
| `pnpm test`      | Vitest                                               |
| `pnpm db:start`  | Local Supabase (also `:stop`, `:reset`)              |
| `pnpm db:types`  | Regenerate `packages/db/src/types/database.types.ts` |
| `pnpm mail`      | Open the local inbox                                 |

`pnpm lint` must run through Nx: `@nx/enforce-module-boundaries` reads a cached
project graph, and a bare `eslint` invocation silently skips it.

## The order of work

Read the spec's Implementation Plan before starting anything. **Milestone Zero
comes first and alone**: one AI SDK `ToolLoopAgent` turn with `Output.object`,
its run visible in XO Space. Do not scaffold the courtroom, the scenario creator
or the database schema until that spike is proven and its integration contract
is written down.

## Style

**No component library.** The look is `docs/raw/courtroom-iso.html`, and the
tokens are in `apps/webapp/src/app/global.css`. Use the utilities the `@theme`
generates (`bg-panel`, `text-brass`, `border-rule`, `font-pix`, `text-pix-sm`,
`shadow-hard`) and the primitives in `components/ui/`. Before adding a
primitive, check whether the prototype has the thing — it usually does, as a
class — and port that.

**Two faces, and they mean different things.** Courier Prime (`font-mono`, the
default) is the record: transcript, testimony, evidence, prose. Silkscreen
(`font-pix`) is the interface: labels, chips, buttons, headings, the HUD. Never
set body text in the pixel face; it only reads at 8–13px.

**Nothing is rounded, and depth is a hard offset.** `--radius-*` is zeroed in
the theme. Use `shadow-hard` / `shadow-hard-lg`, never a blur.

**Colour has meaning.** Brass is the court and the active thing. Teal is a
robot speaking. Oxblood is an error, a rejection, or a lie. `ok` green is a
truth-aligned claim or a recovered failure. Do not use them decoratively.

## Rules that are not obvious

**The dev server has to be on :3000.** `supabase/config.toml` points the
send-email hook at `host.docker.internal:3000`. On another port, signup and
password reset fail with "something went wrong". Change both together.

**`AUTH_EMAIL_HOOK_SECRET` has a format, not just a value.** Supabase validates
it as `v1,whsec_<base64>`, minimum 32 bytes, and refuses to start otherwise.
`echo "v1,whsec_$(openssl rand -base64 32)"`.

**This stack runs on 546xx.** Several local stacks run on this machine at once
and the defaults collide. If you copy config from another project, bring the
ports with it.

**Redirects are built from `NEXT_PUBLIC_SITE_URL`, never from the request.** In
dev Next reports `localhost` while the browser may be on `127.0.0.1`; those are
distinct cookie hosts, and redirecting across them drops the auth cookies.

**Do not put code between building a Supabase client and `getClaims()`.** The
cookie writes that carry a rotated refresh token happen inside that call. This
is why `proxy.ts` looks like it does.

**`getClaims()` is stale for anything a person can change.** The app layout uses
`getUser()` for what it _displays_, and claims only for the guard. Server
actions that touch it revalidate `'/'` at layout scope.

**RLS is not a grant.** A table needs both: policies decide _which rows_, and
`grant ... to authenticated` decides whether the role may touch the table at
all. Forgetting the grant fails as `permission denied for table x`.

**`pnpm db:types` generates from the database URL, not the project config.**
The CLI's `--local` path fails on this hand-written `config.toml`. The database
URL works and is pinned to the same port block. Until the first migration
lands, `database.types.ts` is a hand-written empty shape.

**`Field` wraps the control in its `<label>`.** No `htmlFor`, no id threading —
and it is why `getByRole('textbox', { name: 'Email' })` works in the specs. Do
not put a second labelled control inside one `Field`.

**Do not `kill -9` the dev server.** It leaves Turbopack's PostCSS worker
half-written and the next start panics on `global.css`. `rm -rf .next` fixes it.

**A failed AI turn is silent unless you make it speak.** The AI SDK masks every
server-side error as "An error occurred." `lib/ai/errors.ts` maps the ones that
actually happen (rate limit, no credential, model unavailable, timeout) to a
sentence; log the full error server-side, send only the sentence to the client.

**Agents propose, the orchestrator commits.** No tool an agent calls writes to
the database. It returns a proposed action; the deterministic orchestrator
validates identifiers and permissions, then appends one event in one
transaction. Rejected attempts are recorded, not dropped — they are a metric.

## Auth and email changes

Read `docs/auth-email.md` before changing auth or deployment settings. Run
`pnpm test`, `pnpm test:setup`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
Do not start/reset a database or send real email merely to run unit tests.
Never log auth tokens or full email-provider errors.
