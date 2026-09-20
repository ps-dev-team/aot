# Decisions

The things a future reader would otherwise re-litigate. Add to it when you
decide something the next person would have to work out again.

## The AI Gateway rather than a provider SDK

No `@ai-sdk/anthropic`, no `openai` package. Models are `provider/model` strings
and the gateway resolves them, so switching model — or provider — is
`AI_MODEL=…` rather than a refactor, and there is exactly one credential to
manage. The cost is a dependency on Vercel's gateway for every call; the benefit
is that no provider's SDK gets to shape the code that calls it.

## Our own auth emails

Supabase can send signup and recovery mail from its own templates. That means a
second copy of the product voice, no brand shell, a subject line stored as a
plain string in a dashboard, and no way to test the thing your users actually
receive. The send-email hook costs one route and a signature check, and puts
those emails through the same layout, sender and inbox as every other one.

## `token_hash` links, not `ConfirmationURL`

Supabase's default link hits its own `/verify` endpoint and relies on a PKCE
`code_verifier` cookie — which lives in the browser that started the flow. Sign
up on a laptop, open the link on a phone, and it fails. A `token_hash` redeemed
with `verifyOtp` has no such dependency.

## No i18n

insight-lab routes everything through `[lang]` with next-intl. Most projects
starting from this template are single-language at the point they start. Adding
it later is a route group and a dictionary; carrying it from day one is a
segment in every path and a locale argument in every helper.

## No component library; the prototype is the design system

`docs/raw/courtroom-iso.html` was designed first, as a single file, and it is
the look. Re-theming shadcn to pixel faces, square corners and hard shadows
would have meant fighting every primitive's defaults — so the tokens were lifted
into a Tailwind `@theme` and the five primitives the prototype actually uses
were written by hand in `components/ui/`. The cost is that a dialog, a tabs
strip or a menu has to be written when needed; the benefit is that what ships
is exactly what was drawn.

## The application owns the truth; agents propose

Ground truth, evidence integrity, knowledge grants and accepted trial state are
database rows the orchestrator reads and writes. An agent's structured output
is a proposal: the orchestrator validates every identifier and permission and
commits one event, or records the rejection. This is what makes the evaluation
deterministic — the metrics are a fold over the event log — and it is why XO
observes execution rather than owning it. See spec §3 and §13.

