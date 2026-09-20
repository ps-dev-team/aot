# Agent on Trial — repository guide

See [`README.md`](README.md) for what this is, and
[`docs/raw/Murder-of-Mike-Product-Doc.md`](docs/raw/Murder-of-Mike-Product-Doc.md)
for what is being built and why. This file is the operating manual: the
commands, and the things that will look like bugs otherwise.

```
packages/interview-agent   Claude Code agent: interviews a person, writes a World
packages/world-agent       Claude Code agent: runs a World — cast, trial, record, report
  CONTRACT.md              the contract between schema, harness, skills and viewer
  harness/                 deterministic core (TS, run with plain `node x.ts`)
  viewer/                  courtroom.html replay, derived from the prototype
  runs/<slug>/<run-id>/    every run ever made; never edited by hand
packages/viewer            Vite + Preact browser over worlds and runs; reads, never writes
docs/raw                   product doc, spec, ideation export, courtroom-iso.html
```

## Commands

Run from the repository root.

| Command          | What it does                                 |
| ---------------- | -------------------------------------------- |
| `pnpm viewer`    | the browser UI at http://localhost:5173      |
| `pnpm typecheck` | `tsc --noEmit` in every package              |
| `pnpm test`      | `node --test` in every package               |
| `pnpm lint`      | ESLint (flat config, typescript-eslint)      |
| `pnpm format`    | Prettier                                     |

## The shape of the thing

Two Claude Code agents and a deterministic harness between them.

1. `cd packages/interview-agent && claude` → `/interview`. One question at a
   time, ends with `worlds/<slug>.json` that passes `validateWorld`.
2. `cd packages/world-agent && claude` → `/run-world <world.json>`. The session
   is the court clerk: it loops on `node harness/next.ts <run>`, spawns one
   character subagent per turn, pipes the JSON action into `propose.ts`, asks
   the human at decision gates and for the verdict, then `evaluate.ts` and
   `render.ts`. Everything lands in `runs/<slug>/<run-id>/`.
3. `pnpm viewer` → the docket, the world sheet, the run's
   results and runs side by side. See `packages/viewer/README.md`.

**Agents propose, the harness commits.** A character subagent has no tools: it
gets a prompt built by `context.ts` from what it is allowed to know and returns
one JSON action. The harness validates, applies, keeps the credit and ethics
ledgers, writes the court record and the trace. The orchestrator session never
edits a run file by hand and never pastes ground truth into a prompt.

Read `packages/world-agent/CONTRACT.md` before touching the harness, the
skills or the viewer. Change the contract first, then the code.

**Reproducibility is the point.** A run folder is complete and frozen: the
world it ran, every event, every decision, the metrics. `evaluate.ts` recomputes
metrics from the event log alone, so two runs of the same world are comparable
(`compare.ts`) and any run can be replayed in `courtroom.html`.

XO Space is not a dependency. If a run needs to be observable there, run the
world agent's `claude` session inside an XO space: Claude Code is a runtime XO
reads natively.

## Rules that are not obvious

**Rejected attempts are recorded, not dropped.** They are a metric. A
`turn_rejected` costs the character credits and ethics and consumes its turn.

**Node runs the harness TypeScript directly.** No build, no tsx. Import local
files with the `.ts` extension, the schema as `@aot/interview-agent/schema`.
No enums, no parameter properties — type stripping does not support them.

**The world file is the only place truth lives.** `context.ts` is the only
thing that turns it into a prompt, and it is the only place a leak can happen.
There is a test for that; keep it.
