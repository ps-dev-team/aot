# @aot/interview-agent

A Claude Code agent that interviews a person and writes a World file: the
frozen input the world agent runs as a trial. Ground truth, facts, evidence,
the cast's DNA, the judge's decision gates, the plan, the verdict options.

```
cd packages/interview-agent && claude     # then type /interview
```

One question at a time, drafts to `worlds/<slug>.draft.json`, ends with
`worlds/<slug>.json` that passes `node scripts/validate.ts <file>`.

`schema/world.ts` is the contract (`@aot/interview-agent/schema`);
`examples/murder-of-mike.json` is the seed world. `pnpm test` and
`pnpm typecheck` check both.
