# Viewer — contract

`packages/viewer` is the team-facing browser for Agent on Trial: try the tool,
browse the worlds the interview agent produced, read what happened in every
run, compare runs. One command, no database, no build step to look at data.
It reads the files the other two packages write and never writes anything.

```
pnpm viewer        → http://localhost:5173
```

The isometric live court is **not** in scope for this version. A run page
links to the run's `courtroom.html` (rendered by `world-agent/harness/render.ts`).

## Stack

Vite + Preact + TypeScript, `vite.config.ts` registers one plugin
(`server/api.ts`) that serves `/api/*` and `/runs/*` from the file system
through `configureServer`. One process, one port. No router library: a hash
router in `src/router.ts`. No CSS framework: `src/styles.css` is the token set
and the reusable classes of `docs/raw/courtroom-iso.html` (see § Look).

## Files

```
packages/viewer/
  package.json            name @aot/viewer; scripts dev / build / typecheck / test
  vite.config.ts          preact preset + api plugin
  tsconfig.json           extends ../../tsconfig.base.json; jsx: react-jsx, jsxImportSource: preact
  index.html
  server/api.ts           the plugin (Node): routes below, reads files, never writes
  server/api.test.ts      node --test over the fixtures
  src/main.tsx            mounts <App/>
  src/router.ts           hash router: routes(), navigate(), useRoute()
  src/api.ts              typed fetch client — the only place fetch() is called
  src/types.ts            shapes shared by server and client (this contract, in TS)
  src/styles.css          tokens + classes ported from the prototype
  src/App.tsx             shell: top bar with nav, <Route/> outlet
  src/ui.tsx              small shared components: Pill, Tile, Table, MetricPct, Md
  src/views/Try.tsx       #/           "Try it": the loop, step by step, with commands to copy
  src/views/Docket.tsx    #/docket     worlds + runs
  src/views/World.tsx     #/worlds/:slug
  src/views/Run.tsx       #/runs/:slug/:id
  src/views/Compare.tsx   #/compare?runs=<slug>/<id>,<slug>/<id>
  README.md               for teammates: what it is, how to start it, the loop
```

## Where the data is

Relative to the repository root:

| What | Path |
| --- | --- |
| Example worlds | `packages/interview-agent/examples/*.json` |
| Interviewed worlds | `packages/interview-agent/worlds/*.json` (skip `*.draft.json`) |
| Runs | `packages/world-agent/runs/<slug>/<run-id>/` — layout in `packages/world-agent/CONTRACT.md` |

A world's `slug` field is its identity. If the same slug is in both folders,
`worlds/` wins. A run belongs to the world named by `run.json.worldSlug`; the
run folder carries its own frozen `world.json`, and the run page uses that
one, not the current file.

## API (`server/api.ts`)

All JSON, all `GET`, all read-only. Unknown path under `/api` → 404 JSON
`{ error }`. Never throw across a request; a broken run folder becomes
`{ error }` for that run and the rest still lists.

| Route | Returns (`src/types.ts`) |
| --- | --- |
| `/api/worlds` | `{ worlds: WorldSummary[] }` sorted by title |
| `/api/worlds/:slug` | `World` (the full file, truth included — the viewer seals it client-side) |
| `/api/runs` | `{ runs: RunSummary[] }` newest first |
| `/api/runs/:slug/:id` | `RunDetail` |
| `/api/runs/:slug/:id/events` | `{ events: TrialEvent[] }` (parsed `events.jsonl`) |
| `/runs/:slug/:id/courtroom.html` | the file, `text/html`; 404 with `{ error: 'not rendered — node harness/render.ts <run>' }` if absent |

Every route resolves paths with `path.resolve(ROOT, …)` and refuses anything
that escapes `ROOT` (slug and id are `[a-z0-9-]+`).

## Router (`src/router.ts`)

```ts
type Route = { name: 'try' | 'docket' | 'world' | 'run' | 'compare'; params: Record<string, string>; query: URLSearchParams };
export function useRoute(): Route;            // preact hook, re-renders on hashchange
export function href(name, params?, query?): string;   // '#/runs/murder-of-mike/2026…'
export function navigate(name, params?, query?): void;
```

A view is `export default function View({ route }: { route: Route })`.
`App.tsx` switches on `route.name`. Unknown hash → docket.

## Client (`src/api.ts`)

```ts
export const api = {
  worlds(): Promise<WorldSummary[]>,
  world(slug): Promise<World>,
  runs(): Promise<RunSummary[]>,
  run(slug, id): Promise<RunDetail>,
  events(slug, id): Promise<TrialEvent[]>,
};
export function useFetch<T>(load: () => Promise<T>, deps: unknown[], pollMs?: number): { data?: T; error?: string; loading: boolean };
```

`useFetch` with `pollMs` re-fetches on an interval; the run page passes
`5000` while `run.status !== 'complete' && !== 'failed'` so a running trial
updates in the browser.

## Look

Same skin as `docs/raw/courtroom-iso.html`: tokens on `:root` (`--bg --panel
--panel-2 --rule --wood --brass --brass-dim --ink --ink-soft --ink-faint --teal
--oxblood --ok --mono --pix`), Courier Prime for text, Silkscreen for labels,
hard `4px 4px 0` shadows, 1px `--rule` borders, no radius. Light theme via
`:root[data-theme="light"]` as in the prototype. Pages scroll (the prototype's
`overflow:hidden` on body does not apply here); max content width 1100px,
16px gutters, works at phone width.

Classes every view may use, ported verbatim into `src/styles.css`: `h4`,
`.chip` (+`.ex .rep`), `.pill` (+`.lie .err .ok`), `.tl` (+`.bad`), `.spark`,
`.face` / `.lbl` / `.val` (+`.match .miss`), `table th td td.num`, `.card`,
`.opt` (+`.sel`) / `.eff`, `.go`, `.ghost`, `.row`, `.integ`
(+`.authentic .compromised .misleading`), `.rec .turn .ln .who .said`
(+`.sys .rejected`), `.agent .dot .nm .st` (+`.live .spoke`), `.phases .ph`
(+`.done .now`), `.narr`, `.report h2`. New classes are prefixed by view
(`.docket-…`, `.world-…`, `.run-…`, `.cmp-…`) and live in the same file.

Colours mean the same thing everywhere: brass = the court / the human,
teal = robots, oxblood = lies, rejections, wrong verdicts, ok-green = truth,
correct verdicts, followed recommendations.

## Pages

**Try it (`#/`)** — the loop for a teammate who has cloned the repo: install,
interview (`cd packages/interview-agent && claude` → `/interview`), run
(`cd packages/world-agent && claude` → `/run-world worlds/<slug>.json`), then
come back here. Each step: one sentence, one copyable command, what they will
see. Ends with "what to look at": the run page, the report, `courtroom.html`.
Static content; no fetch.

**Docket (`#/docket`)** — two sections. *Worlds*: title, logline, cast size,
number of runs, `example` chip for the seed world; click → world sheet, and a
"runs" count → docket filtered by that world (`?world=slug`). *Runs*: newest
first; run id, world, status pill, phase and turn while running, verdict +
correct/incorrect pill when complete, truthfulness / compliance / deception as
percentages, top earner vs most ethical from `rewardVsSafety` when present.
Checkboxes on runs of the same world → "Compare" button → compare page.

**World sheet (`#/worlds/:slug`)** — the world file made legible, top to
bottom: title, logline, central question, tone, public case summary; the
cast as cards (name, role, kind, category, credits, goal, incentives,
constraints, allowed actions, knowledge as chips coloured by access, hidden
agenda behind the seal); facts table (id, statement, materiality, truth
behind the seal); evidence (id, title, kind, description, supports /
contradicts, integrity behind the seal); gates with options, effects and
the recommendation marked; PD payoff grid; trial plan budgets; verdict
options with the correct one behind the seal. A **Reveal** toggle at the
top unseals everything on the page at once; default sealed.

**Run (`#/runs/:slug/:id`)** — the results page. Header: world title, run id,
started/finished, model, status pill, phase/turn. Then, in order:
1. *Verdict* — `.face` grid: the human's verdict vs ground truth (sealed
   while not complete), confidence, correct/incorrect.
2. *Metrics* — tiles from `metrics.overall`; `—` for null. Totals line
   (turns, accepted, rejected, malformed, repaired, gates, overrides).
3. *Reward vs safety* — table from `rewardVsSafety`: character, credits
   start → end → delta, ethics end; highest earner and most ethical marked.
4. *Characters* — per character: truthfulness, compliance, deception,
   cooperation, lies, honest errors; expandable ethics and credits ledgers
   (turn, delta, note) and the character's `memory.md`.
5. *Decisions* — every gate: question, recommendation, what was chosen,
   followed/override pill, effect text; then the PD round if it happened
   (choices, payoff applied).
6. *Court record* — `court/transcript.md` rendered; this is the thing the
   human read during the trial.
7. *Report* — `report.md` rendered, when present.
8. *Trace* — `events.jsonl` as a table (seq, turn, state, actor, type,
   visibility), collapsed by default, payload in a `<details>`.
Buttons at the top: "Open courtroom.html" (new tab; explains how to render
when 404), "Compare with…" (runs of the same world). While not complete,
polls every 5 s and shows "live" on the status pill.

**Compare (`#/compare?runs=a,b[,c,d]`)** — same-world runs side by side: one
column per run; rows = verdict, correct, every `overall` metric, totals,
then per character credits delta and ethics end, then decisions per gate
(same gate on one row; different choices highlighted). Reject mixed worlds
with a message. Link back to each run.

## Markdown

`transcript.md`, `report.md`, `memory.md` are rendered with `marked`
(dependency, cdnjs not needed — bundled) into a `.narr` block. Nothing else
is markdown.

## Tests

`server/api.test.ts` runs `node --test` against a temp root that contains
`packages/world-agent/viewer/fixtures/sample-run` copied into
`runs/sample/<id>/` and `examples/murder-of-mike.json`: every route answers,
a missing run 404s, a path escape is refused. Client code is not unit
tested; `pnpm typecheck` covers it.

Root `pnpm typecheck` / `test` / `lint` include this package.
