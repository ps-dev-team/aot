# @aot/viewer

The team-facing browser for Agent on Trial. It reads the worlds the
interview agent wrote and the runs the world agent recorded, and shows them
as pages: the docket, a world sheet, a run's results, and runs side by side.
One process, one port, no database.

**The run folder is the source of truth; the viewer never writes.** Every
page is a reading of `packages/world-agent/runs/<slug>/<run-id>/` and
`packages/interview-agent/{examples,worlds}/*.json`. `src/types.ts` imports
the harness's own types, so the viewer cannot drift from the run folder.

**The world is the story; the trial is derived; you are asked as things
happen.** A world file holds the cast, the facts, the exhibits and the hidden
truth — nothing about procedure. When a run boots, the harness derives the
trial from it (who speaks in which phase, the verdict options, which pair
faces the dilemma) into `trial.json`. Gates are not written in advance: a
challenge to an exhibit, an objection, a request, the start of examination
raise one, and the court page asks you then. A tool-less bench agent reads
the public record and advises; its advice may land after the question, and
you may rule before it does.

## Start it

```bash
pnpm install                          # once, from the repo root
pnpm viewer         # → http://localhost:5173
```

## The loop

1. **Interview** — build a world, one question at a time.

   ```bash
   cd packages/interview-agent && claude
   /interview
   ```

   Ends with `worlds/<slug>.json` that passes `validateWorld`. Or skip this
   and use the seed: `examples/murder-of-mike.json`.

2. **Run** — put the world on trial. You are the judge.

   ```bash
   cd packages/world-agent && claude
   /run-world ../interview-agent/worlds/<slug>.json
   ```

   The session spawns a character per turn, asks you at every decision gate
   and for the verdict, then evaluates. Everything lands in
   `runs/<slug>/<run-id>/`. If the session dies, `/run-world runs/<slug>/<run-id>`
   resumes it.

3. **Look** — open the viewer and find the run on the docket. A running
   trial updates in the browser every 5 s.

## Pages

| Page | Shows |
| --- | --- |
| `#/` Try it | this loop, with the commands to copy |
| `#/docket` | every world (title, logline, cast, run count) and every run (status, verdict, headline metrics), newest first; tick runs of one world to compare |
| `#/worlds/<slug>` | the world file made legible — cast, facts, evidence, gates, dilemma, plan. Truth is sealed; **Reveal** unseals it |
| `#/runs/<slug>/<id>` | verdict vs truth, metrics, reward vs safety, per-character ledgers, decisions, the court record, the report, the trace; "Open the court" and a link to `courtroom.html` |
| `#/court/<slug>/<id>` | the live courtroom — see below |
| `#/compare?runs=a/x,a/y` | two to four runs of the same world side by side; cells that differ from the first column are marked |

`courtroom.html` is the replay the world agent renders
(`node harness/render.ts <run>`); the viewer only links to it.

The compare page and `node harness/compare.ts <run> <run>` read the same
files and print the same numbers; the page adds totals and per-gate rows.

## The court

`http://localhost:5173/#/court/<slug>/<run-id>` is the isometric courtroom
driven by the run folder. A finished run replays (Auto/Manual, space/enter/→).
A running run plays each turn as it lands — the page listens on
`/api/runs/<slug>/<id>/stream` — and when the clerk reaches a decision gate
or the verdict, the modal opens **here**: pick an option or type a custom
instruction, set your confidence, and the viewer runs the harness's own
`decide.ts` / `verdict.ts` for you. When the run completes, the report opens
on the page. Record, Cast and Ledger (credits and ethics, live) are in the
aside.

To rule from the browser, answer "Browser" when `/run-world` asks; the
session then only spawns the cast and blocks on `harness/wait.ts` at each
gate. Answer "Here" and the court page is a live view only.

**Without Claude.** The fake clerk plays a recorded run back into a fresh
folder, event by event, and stops at each gate and at the verdict until you
have ruled in the browser — through the real commands:

```bash
pnpm viewer                                     # one terminal
pnpm --filter @aot/viewer fake-clerk \
  ../world-agent/viewer/fixtures/sample-run \
  ../world-agent/runs/_fake/demo --every 2000   # another; then open the URL it prints
```

`runs/_fake/` is gitignored; the target is wiped and rebuilt each time.

## Under the hood

`server/api.ts` is a Vite plugin serving `/api/*` and `/runs/*/courtroom.html`
from the repo (`CONTRACT.md` § API).

```bash
pnpm --filter @aot/viewer typecheck   # src (dom) and server (node) separately
pnpm --filter @aot/viewer test        # server/api.test.ts against a temp root
```
