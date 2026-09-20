# @aot/world-agent

A Claude Code session that runs a World through a trial. The World is the
story; the trial — speaking order, phase budgets, verdict options, the
dilemma pair — is derived from it at boot into `trial.json`. The session is
the court's clerk: it spawns one character subagent per turn and pipes each
JSON action into a deterministic harness. When a character asks the court for
a ruling (an objection, a challenge, a request) the harness raises a gate; the
clerk spawns the **bench**, a second tool-less subagent that reads the public
record and recommends an option with a reason, and the human judge rules —
with the recommendation in front of them, or before it lands. Then the
verdict, the evaluation, the render. No subagent touches a file; the harness
owns every write. `CONTRACT.md` is the specification.

**Prerequisites.** Node ≥ 24 (runs `.ts` directly), `pnpm install` from the
repo root, Claude Code, and a world file from `packages/interview-agent`
(`worlds/<slug>.json` or `examples/`).

**Three commands.** In this folder, `claude`, then:

```
/run-world ../interview-agent/worlds/murder-of-mike.json   run it (or resume: /run-world runs/<slug>/<run-id>; add a number for --turns)
/evaluate runs/<slug>/<run-id>                             read the report; two run dirs to compare
/replay runs/<slug>/<run-id>                               open courtroom.html
```

`/run-world` asks once whether you rule from the terminal or from the
browser. For the browser: `pnpm viewer` from the repo root and open
`http://localhost:5173/#/court/<slug>/<run-id>` — the live courtroom, where
gates and the verdict are decided through the same `decide.ts` /
`verdict.ts`. The session blocks on `harness/wait.ts` meanwhile.

**Where runs live.** `runs/<slug>/<run-id>/` — the frozen world, the derived
`trial.json`, every event, the transcript, decisions (each with the bench's
recommendation, or `unadvised`), verdict, `metrics.json`, `report.md`,
`courtroom.html`. Never deleted, never edited by hand.
