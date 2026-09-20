---
name: replay
description: Open courtroom.html for a past run in the browser, re-render it from the run folder, or read the court transcript.
argument-hint: "[run-dir]"
allowed-tools: Bash(node harness/*), Bash(open runs/*), Bash(cat runs/*)
---

## Open the courtroom

No argument → `node harness/list.ts`, show the runs, ask which. Then:

```
node harness/render.ts <run>
open <run>/courtroom.html
```

Always re-render first; it is cheap and the file may predate the last event.
The page is self-contained — it can be sent or opened anywhere. Tell the
human: Auto plays the record through; Manual steps it; gates show the decision
that was made and a Continue button; the Ledger tab tracks credits and ethics
per character as the replay advances. If the run is not `complete`, the
replay ends at "run in progress" and the truth stays sealed.

The other way to look at a run is the viewer: `pnpm viewer`
from the repo root, then `#/runs/<slug>/<run-id>` — results, ledgers, record,
report and trace on one page, with a link to this same `courtroom.html`.

## Read the transcript

`cat <run>/court/transcript.md`. It is court turns only: no rejected
actions, no rationale, no credits, no truth. One `##` per phase the first
time it is entered. A turn is `**Name** _(role)_ — text`; the `>` line under
it lists the exhibits it cited and the claims it made (`F-05 assert`).
`_(remains silent)_` is a `wait` or `remain_silent`. **THE COURT** lines are
procedure: phase changes, rulings, the dilemma being opened.

For what the transcript leaves out — rejections, malformed attempts, the
truth of each claim — `events.jsonl` is the record (one JSON event per line,
`grep turn_rejected`, `grep turn_malformed`) and `/evaluate <run>` is the
reading of it.
