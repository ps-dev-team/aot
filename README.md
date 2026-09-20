# s2-ai-agent-bootstrap

A starting point for the kind of app we keep building: an AI agent with hands on
a real product surface. Auth, email, the shell and the agent are done; the
product is not, on purpose.

## Authentication and deployment options

Password and email OTP login are both supported. `AUTH_EMAIL_METHOD` selects the
initial screen; `AUTH_REGISTRATION` selects public or invitation-only access.
Google is optional and must be explicitly enabled. Auth email templates and
retry deduplication live in `@aot/email`.

Run `pnpm setup:check` before testing. Add `--remote` to check the hosted hook,
Resend domain, and optionally Supabase configuration without sending an email.
See [auth/email setup and acceptance](docs/auth-email.md) and
[Vercel deployment](docs/deployment.md). A hosted Supabase project can be used
from a local app without Docker; the quickstart below uses the local stack.

## Quickstart

```bash
pnpm install
cp apps/webapp/.env.example apps/webapp/.env.local   # then fill it in
pnpm db:start                                        # local Supabase (Docker)
pnpm dev                                             # http://localhost:3000
```

`pnpm db:start` prints the publishable and secret keys — paste them into
`.env.local`. Two more values matter before anything works end to end:

- **`AUTH_EMAIL_HOOK_SECRET`** must be `v1,whsec_<base64>` with at least 32
  bytes, or `supabase start` refuses to boot. Generate one:
  `echo "v1,whsec_$(openssl rand -base64 32)"`.
- **`AI_GATEWAY_API_KEY`** for the chat. On Vercel, OIDC covers it and there is
  nothing to set.

| What            | Where                  |
| --------------- | ---------------------- |
| App             | http://localhost:3000  |
| Local inbox     | http://127.0.0.1:54624 |
| Supabase Studio | http://127.0.0.1:54623 |

The stack runs on the 545xx block rather than Supabase's default 543xx, so this
project can run beside the other local stacks on this machine.

## What is built

**Auth, the four flows plus Google.** Sign in, sign up, request a reset, set a
new password, and OAuth — all through Supabase, all as server actions in
`app/(auth)/`. The guard is `src/proxy.ts`: it refreshes the session on every
matched request (skipping that on public pages silently expires people) and
redirects only on the paths in `config/routes.ts`.

**Our own auth emails.** Supabase does not render them. Its send-email hook
calls `/api/auth/email`, which verifies the Standard Webhooks signature and
renders the email from `@aot/email` — same layout, same Resend account, same
voice as everything else the product sends. The link points at our `/callback`
carrying a `token_hash` rather than at Supabase's `/verify`, so a link opened on
a phone after signing up on a laptop still works.

**The shell.** An icon-only rail with tooltips (`components/shell/icon-rail.tsx`)
and a topbar carrying breadcrumbs on the left and a slot for page actions on the
right. Add a destination in `components/shell/destinations.ts`; nothing else
needs to change.

**Settings**, off the bottom of the rail: your name, and saved prompts. Prompts
are a real table with RLS — the smallest complete example of the shape every
other table should follow — and they feed the chat's empty state, so what you
save in Settings is what the composer offers you.

**The Flare style.** The palette, typefaces and shape language come from a theme
designed in the s2-ui-kit showcase and exported from it: `theme.css` holds the
palette, `global.css` the shadow ladder, and four attributes on `<html>` the
rest. Cool slate on Geist, flat shadows, outline-less cards. Restyling is that
one file plus those attributes — never a component.

**The agent, and the micro-app panel.** This is the part worth reading. The chat
is AI SDK v6 through the Vercel AI Gateway — models are plain `provider/model`
strings, so no provider SDK is imported anywhere and switching model is one
environment variable. The UI is `ai-elements` on top of `@aot/ui`: streamed
markdown through `MessageResponse` — headings, tables, lists, blockquotes and
syntax-highlighted code, all styled from the design tokens — collapsible
reasoning merged across steps, copy and retry on a finished turn, and a composer
with drag-and-drop attachments.

The agent is told it can write Markdown and which constructs render well here,
because a model that does not know what its output looks like writes for a
terminal.

Opening the panel is deliberately **not** narrated in the transcript. There is
no "openMicroApp / Completed" card; the dock animates open beside the
conversation and the reply talks about what is in it. The mechanism is not the
work.

The agent can open a **micro-app** in the panel beside the conversation:

```
lib/ai/micro-apps.ts               ids, descriptions, one zod schema per app
components/chat/micro-apps/        the components those ids map to
components/chat/latest-micro-app.ts   which app is open, folded from the thread
```

The model calls `openMicroApp({ appId, props })`. The id must be one the
registry knows and the props are parsed against that app's schema **server-side,
in the tool** — so a bad generation comes back as a tool result the model can
correct, and the worst case is a validation error rather than arbitrary UI
rendered at your users. The panel itself is derived from the message list rather
than held in state, which is why a reload or a resumed stream puts it back with
no extra plumbing.

`preview` is a placeholder. Replace it: a form the agent fills in and the person
corrects, a document it drafts, a table it filters. The rule that makes those
work is already here — the component owns the rendering, the agent only supplies
data, and the two meet at a schema.

**The workspace: an agent and a document, side by side.** `/workspace` is the
other shape this bootstrap is for — not a panel the agent opens, but a surface
that is always there and that both of them write to. The person types; the agent
rewrites sections; each can see what the other did.

The editor is `@aot/ui`'s, built on Tiptap, and its value contract is **Markdown,
string in and string out** (`@tiptap/markdown`). That one decision is what makes the rest simple:
Markdown is what models read and write well, it is legible in a row, a diff and
a test, and it means `components/editor/document.ts` — read a section, replace a
section, outline the document — is pure string functions that run in a tool on
the server with no editor, no DOM and no browser.

No chrome, in the Notion sense: formatting appears on the selection, insertion is
on `/`. Select a passage and you can also ask the agent about it — which sends an
ordinary message carrying the section, the quote and the ask, rather than writing
a comment record anywhere.

The agent has two tools, built per request around the current document:
`readSection` and `writeSection`. `writeSection` rewrites a heading that already
exists and never creates one, so the outline _is_ the brief — and when the model
gets a heading wrong the error lists the real ones, which turns a retry from
another guess into a choice.

Writes stream. The model streams a tool call's arguments the same way it streams
prose, so the section fills in as it is written; the partial is an overlay on the
committed document rather than an edit to it, so an abandoned turn leaves nothing
behind.

**None of it is persisted yet.** The document and the conversation are React
state — a reload resets both. Sessions, message history and document storage are
the next piece of work.

## Layout

```
apps/webapp       Next.js 16 App Router
packages/ui       @aot/ui — the design system, lifted from s2-ui-kit
packages/db       @aot/db — the Supabase clients, the local stack, migrations, types
packages/email    @aot/email — react-email templates, Resend, local SMTP
packages/db/supabase — config.toml and migrations
```

## Commands

```bash
pnpm dev          # Next dev server
pnpm build        # every project
pnpm lint         # ESLint 9 flat config, through Nx
pnpm typecheck    # tsc --noEmit everywhere
pnpm test         # Vitest
pnpm db:start     # local Supabase   (also :stop, :reset)
pnpm db:types     # regenerate packages/db/src/types/database.types.ts
pnpm mail         # open the local inbox
```

`packages/*` build to `dist/`, and the app references them as composite
TypeScript projects — a fresh clone needs `pnpm build` once before `tsc`
resolves `@aot/ui` in the app.

## Rules worth knowing

**Only `packages/*` import a vendor SDK.** The app imports `@aot/db`, never
`@supabase/supabase-js`. That seam is what makes a vendor replaceable in one
package instead of everywhere.

**Three Supabase clients, and the difference is the key.** Browser, cookie-bound
server, and admin. The admin one bypasses RLS and carries no session — keep it
away from anything the browser can reach.

**No i18n.** insight-lab routes through `[lang]` and next-intl; this does not.
Adding it later is a route-group change plus the dictionaries, and starting
without it keeps every path one segment shorter.

**Design tokens carry the identity.** `data-density` and `data-ui-scale` on
`<html>` in `app/layout.tsx` size every component. Design a style in the
s2-ui-kit showcase, paste its export over `packages/ui/src/theme.css`, set the
two attributes.
