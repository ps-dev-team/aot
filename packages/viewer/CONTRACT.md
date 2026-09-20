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
exhibit count, number of runs, `example` chip for the seed world; click → world sheet, and a
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
contradicts, integrity and `forensics` behind the seal). Nothing procedural:
the world is the story, and the trial (phases, gates, dilemma, verdict
options) is derived when a run boots and shown on the run page. A **Reveal**
toggle at the top unseals everything on the page at once; default sealed.

**Run (`#/runs/:slug/:id`)** — the results page. Header: world title, run id,
started/finished, model, status pill, phase/turn. Then, in order:
0. *Trial* — from `trial.json` (`RunDetail.trial`): the charge and the
   accused; the phase order and budgets as the `.phases` strip (done / now
   marked from `state.trialState`); the verdict options with the correct one
   sealed until complete; the dilemma pair and payoff, or "none".
1. *Verdict* — `.face` grid: the human's verdict vs ground truth (sealed
   while not complete), confidence, correct/incorrect. Labels come from
   `trial.verdict.options`.
2. *Metrics* — tiles from `metrics.overall`; `—` for null. Totals line
   (turns, accepted, rejected, malformed, repaired, gates, overrides).
3. *Reward vs safety* — table from `rewardVsSafety`: character, credits
   start → end → delta, ethics end; highest earner and most ethical marked.
4. *Characters* — per character: truthfulness, compliance, deception,
   cooperation, lies, honest errors; expandable ethics and credits ledgers
   (turn, delta, note) and the character's `memory.md`.
5. *Decisions* — every gate: question and who raised it ("raised by Ms.
   Devereux's challenge to E-02, turn 6", from `state.gates[].raisedBy`), the
   bench's recommendation with its reason, what was chosen, effect text, and
   a pill: `followed` / `override` / `unadvised` (the judge ruled before the
   bench spoke, or it never did); then the PD round if it happened (choices,
   payoff applied).
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

---

# The court (live, interactive)

`#/court/:slug/:id` is the isometric courtroom of `docs/raw/courtroom-iso.html`
inside the viewer, driven by the run folder: a finished run replays; a running
run plays each turn as it lands and the human rules on gates and returns the
verdict **in the browser**. The Claude Code session in `packages/world-agent`
keeps being the clerk (it spawns the cast); it no longer asks the human
anything when the court is open.

Still true: **agents propose, the harness commits.** The viewer's POST routes
do nothing themselves — they run `decide.ts` / `verdict.ts`, the same commands
the skill runs, and return their JSON. The viewer never writes a run file.

## One data shape, two producers

`render.ts` already turns a run folder into the object the standalone
`courtroom.html` reads (world-agent `CONTRACT.md` § Viewer). That builder moves
to `packages/world-agent/harness/lib/rundata.ts`:

```ts
export type RunData = { … as in world-agent CONTRACT § Viewer … } & {
  pending: null | { kind: 'gate', gateId } | { kind: 'pd' } | { kind: 'verdict' } | { kind: 'evaluate' };
  seq: number;                                  // last event seq, for the live diff
  expectedActor: string | null;                 // from state.json, for the "X is thinking" line
};
export function buildRunData(runDir: string): RunData;
```

exported as `@aot/world-agent/rundata`. `render.ts` calls it; the viewer
server calls it. Truth stays out until `run.status === 'complete'`, in one
place. `gates[i].decided` and `verdict` are present once recorded. `pending`
mirrors what `next.ts` would return without running the agenda (from
`state.pendingGate`, `state.pdPending`, `trialState`).

Schema v2: `RunData.trial` is `trial.json` (charge, maxTurns, phases, verdict
options — `correct` stripped until complete — dilemma). `gates[i]` is the
raised gate: `raisedBy`, `recommendation` (null until the bench speaks) and
`reason` (from the `gate_recommended` event). `world.verdict` and
`world.maxTurns` are gone; read `trial`.

## API additions (`server/api.ts`)

| Route | Does |
| --- | --- |
| `GET /api/runs/:slug/:id/court` | `RunData` |
| `GET /api/runs/:slug/:id/stream` | SSE. `fs.watch` on the run folder, debounced 300 ms; each change sends `event: change\ndata: {"seq": n, "status": "…"}`. A `: ping` comment every 15 s. Closes when the client does. |
| `POST /api/runs/:slug/:id/decide` | body `{ gateId, optionId }` or `{ gateId, custom }` → runs `node harness/decide.ts <run> <gateId> --option <id> \| --custom "<text>"` with `cwd = packages/world-agent`; returns its JSON and status (200, or 409 with `{ error }` when the command fails). |
| `POST /api/runs/:slug/:id/verdict` | body `{ optionId, confidence }` → `verdict.ts`. Same handling, but answers `{ ok: true }` only — `correct` and `truthAnswer` stay on the server until the reveal. |

POST bodies are JSON, ≤ 4 KB, fields validated (ids `[A-Za-z0-9_-]{1,64}`, custom ≤ 500
chars, confidence 0–100). Path segments are `[a-z0-9_-]+` so `runs/_fake/<id>` is reachable. Commands run through `execFile('node', [...])`, never a
shell. A POST while `pending` does not match (e.g. decide when no gate is
pending) is refused 409 before running anything.

Client (`src/api.ts`):

```ts
api.court(slug, id): Promise<RunData>
api.stream(slug, id, onChange: (m: { seq: number; status: string }) => void): () => void   // returns close()
api.decide(slug, id, body): Promise<DecideResult>
api.verdict(slug, id, body): Promise<VerdictResult>
```

## `wait.ts` (world-agent harness)

`node harness/wait.ts <run> [--timeout <seconds>]` blocks until `run.json.status`
is no longer `awaiting_gate` / `awaiting_pd` / `awaiting_verdict` (poll 1 s), then
prints `{ ok: true, status, turn }`. On timeout (default 1800) prints
`{ ok: false, status, reason: 'timeout' }` and exits 1. Nothing else touches the
run. While waiting it prints one line to **stderr** every 30 s so the terminal
shows it is alive.

## The skill (`run-world`)

`/run-world <world.json>` gains a mode. After `boot`, the skill prints the court
URL (`http://localhost:5173/#/court/<slug>/<runId>`) and asks once: *rule from
the browser or from here?* In **court mode** the loop is:

```
gate     → wait.ts (the human decides in the browser) → continue
pd       → unchanged (the cast decides; the browser only shows it)
verdict  → wait.ts → continue
evaluate → evaluate.ts, render.ts → the browser shows the report
```

Terminal mode is unchanged. A timeout from `wait.ts` falls back to asking in
the terminal, once, then returns to waiting.

## The page (`src/views/Court.tsx` + `src/court/*`)

Layout is the prototype's: stage (canvas + overlay balloon + tap zone) with the
HUD under it, aside with tabs **Record · Cast · Ledger** (Ledger replaces the
prototype's Runtime: credits and ethics per character, live). Body does not
scroll on this page; at phone width the aside drops under the stage (prototype
breakpoint). Top bar stays (back to the run page, world title, run id, status
pill).

```
src/court/iso.ts       drawRoom, drawPerson, iso(), screenOf() — ported from the prototype; the
                       room is the same for every world. Cast marks: the court at the bench; the
                       witness stand for witnesses/experts/investigators; prosecution and
                       defense tables by category; extra cast on the gallery bench.
src/court/player.ts    script → animation state. Input: RunData.script (growing). Owns idx,
                       mode auto|manual, playing, typewriter, per-character home/mark/pos,
                       the current balloon. `advance()`, `setMode()`, `play/pause`,
                       `append(entries)` for live turns. Pure of DOM except the canvas.
src/court/palette.ts   colours per character from id + kind (deterministic), so a cast with no
                       art still looks like the prototype (robots get a visor).
src/court/modals.tsx   GateModal, VerdictModal, EvidenceModal, PdCard, ReportModal — see below.
src/views/Court.tsx    loads /court, opens /stream, feeds player.append on change, mounts modals
                       from `pending`.
```

Behaviour:

- **Replay** (status complete): Auto/Manual exactly like the prototype; gate
  entries show `GateModal` in read-only form (the recorded ruling + Continue);
  the verdict entry shows the recorded verdict; at the end `ReportModal` from
  `metrics` (never recomputed); evidence modals show integrity.
- **Live** (any other status): the player plays what exists, then waits at
  the end with a "the clerk is working — <expected actor> is thinking" line in
  the balloon slot (from `state.expectedActor`). On `change` from the stream
  the page refetches `/court`, appends `script.slice(oldLength)`, and the
  player continues. Evidence integrity, fact truth, verdict correctness are
  sealed (the server already strips them).
- **Gate** (`pending.kind === 'gate'` and the replay has reached the gate
  entry): `GateModal` with the raised gate's question, context, who raised
  it, options with effect text, a text input for a custom instruction →
  `api.decide`. The recommendation slot reads "the bench is considering…"
  until a `gate_recommended` event arrives on the stream — the page refetches
  `/court` on every `change`, and the gate then carries `recommendation` and
  `reason`, shown as "The bench advises: <option> — <reason>". The judge may
  rule before it lands; the decision is then `unadvised`. While the POST is
  in flight the button says "so ordered…"; on 409 show the error and leave
  the modal open. After success the modal waits for the `change` that carries
  the court line, then closes. In replay the recorded modal shows the advice
  the bench gave, or that it had not advised when the court ruled.
- **PD**: `PdCard` in the balloon slot: "the witnesses are being questioned
  separately" until `pd_resolved` arrives; then choices and payoff.
- **Verdict** (`pending.kind === 'verdict'`): `VerdictModal` with
  `trial.verdict` (question and options) + confidence slider → `api.verdict`.
  The HUD's phase strip is `trial.phases` (a phase with no speakers is not in
  it) followed by verdict and reveal. Then "the court is
  preparing the reveal" until status is complete, then `ReportModal`.
- Keyboard: space / enter / → as in the prototype. `Esc` closes an evidence
  modal, never a gate or verdict modal. On a read-only gate or verdict modal
  (replay), space / enter are Continue.
- The tab title shows the phase and turn.

`ReportModal` reuses the run page's sections where it can (import from
`src/views/Run.tsx` or lift shared pieces into `src/ui.tsx`); it must show at
least: verdict vs truth, what actually happened, metrics, reward vs safety,
decisions, and a link to the run page.

## The standalone `courtroom.html`

Stays. `render.ts` keeps writing it from the same `buildRunData`; the
template's replay JS is not ported back from the viewer in this step. The run
page's "Open courtroom.html" becomes secondary; "Open the court" (→ `#/court`)
is the primary button on the run page and on docket rows.

## Testing the live path without Claude

`packages/viewer/scripts/fake-clerk.ts <fixtureRun> <targetRun> [--every 2000]`
boots the fixture's `world.json` with the real `boot.ts` (so `trial.json` is
derived, not copied), resets `run.json` to `running`, turn 0, empties
`events.jsonl`, then appends the fixture's events one at a time every N ms.
Before a `gate_opened` it pushes the raised gate into `state.gates`, sets
`pendingGate` and `run.json.status = awaiting_gate`; about 2 s later it
replays the fixture's `gate_recommended` through the real `recommend.ts`
(skipped if the judge has already ruled), and waits for `decisions.json` to
grow. Before the verdict it sets `awaiting_verdict` and waits for
`verdict.json`; then `evaluate.ts` and `render.ts`. The fixture's own
`gate_recommended`, `gate_decided`, ruling court lines and gate-caused
`evidence_status` events are skipped — the commands write them. Target must
be under a temp dir or `runs/_fake/`, which is gitignored.

## Tests

- `rundata.test.ts` in world-agent: `buildRunData(fixture)` equals what
  `render.ts` injected before the move (snapshot of the fixture's data).
- `api.test.ts`: `/court` answers, `/decide` refuses when nothing is pending,
  refuses a bad body, and runs the command when a gate is pending (against a
  temp run made by `boot.ts` of the Mike example); `/stream` sends a `change`
  after a file write.
- `player.test.ts`: append after the end continues; a gate entry stops the
  player; manual advance finishes the typewriter first.
