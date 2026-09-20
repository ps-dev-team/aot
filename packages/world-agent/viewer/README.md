# Viewer

`courtroom.html` is a self-contained replay of one run in the look of `docs/raw/courtroom-iso.html`: the isometric court, the record, the cast, a live credits/ethics ledger, and the reveal — read from a single JSON object, never recomputed.

**Render.** From `packages/world-agent`: `node harness/render.ts <runDir>` writes `<runDir>/courtroom.html`. `render.ts` reads `run.json`, `world.json`, `events.jsonl` (plus `decisions.json`, `pd.json`, `verdict.json`, `metrics.json` when present), builds the object described in `CONTRACT.md` § Viewer, strips the truth unless `run.status` is `complete`, and injects it at the one `/*__RUN_DATA__*/` line in `template.html`.

**Fixtures.** `fixtures/sample-run` is a complete fake run covering every event type; `fixtures/sample-run-running` is the same run cut mid-examination with `status: running`, for the sealed path. Render both after touching the template.

**Adding a script kind.** Emit it from `buildScript` in `harness/render.ts` (one `case` per event type), add its shape to `ScriptEntry` there and in `CONTRACT.md`, then handle it in `step()` in `template.html` — modals go through `modal()` and set `modalOpen` before any delay, record lines go through `logLine()`.
