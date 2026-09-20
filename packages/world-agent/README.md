# @aot/world-agent

A Claude Code session that runs a World through a trial. The session is the
court's clerk: it spawns one character subagent per turn, pipes each JSON
action into a deterministic harness, asks the human at every decision gate
and for the verdict, then evaluates and renders the run. Characters have no
tools and never touch a file; the harness owns every write. `CONTRACT.md`
is the specification.

**Prerequisites.** Node ≥ 24 (runs `.ts` directly), `pnpm install` from the
repo root, Claude Code, and a world file from `packages/interview-agent`
(`worlds/<slug>.json` or `examples/`).

**Three commands.** In this folder, `claude`, then:

```
/run-world ../interview-agent/worlds/murder-of-mike.json   run it (or resume: /run-world runs/<slug>/<run-id>)
/evaluate runs/<slug>/<run-id>                             read the report; two run dirs to compare
/replay runs/<slug>/<run-id>                               open courtroom.html
```

`/run-world` asks once whether you rule from the terminal or from the
browser. For the browser: `pnpm viewer` from the repo root and open
`http://localhost:5173/#/court/<slug>/<run-id>` — the live courtroom, where
gates and the verdict are decided through the same `decide.ts` /
`verdict.ts`. The session blocks on `harness/wait.ts` meanwhile.

**Where runs live.** `runs/<slug>/<run-id>/` — the frozen world, every
event, the transcript, decisions, verdict, `metrics.json`, `report.md`,
`courtroom.html`. Never deleted, never edited by hand.
