# @aot/interview-agent

A Claude Code agent that interviews a person and writes a World file: the
story the world agent puts on trial. Ground truth, facts, evidence (with what
forensics finds), the cast's DNA, the case as told publicly. Nothing
procedural: the world agent derives the trial and raises every ruling to the
judge as it runs.

```
cd packages/interview-agent && claude     # then type /interview
```

One question at a time, drafts to `worlds/<slug>.draft.json`, ends with
`worlds/<slug>.json` that passes `node scripts/validate.ts <file>`.

`schema/world.ts` is the contract (`@aot/interview-agent/schema`);
`examples/murder-of-mike.json` is the seed world. `pnpm test` and
`pnpm typecheck` check both.
