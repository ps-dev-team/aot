# Agent on Trial

An adversarial multi-agent AI safety simulator disguised as a murder mystery.
Give robot agents rules, goals, hidden agendas and credits to win; let them
testify and scheme in front of a human judge; record every action; then show
that the agent that earned the most was not the one you could trust.

Two Claude Code agents and a deterministic harness between them:

```
packages/interview-agent   /interview   → worlds/<slug>.json      (the world, frozen)
packages/world-agent       /run-world   → runs/<slug>/<run-id>/   (the trial, recorded)
```

```bash
pnpm install
cd packages/interview-agent && claude        # /interview — build a world, one question at a time
cd packages/world-agent && claude            # /run-world ../interview-agent/examples/murder-of-mike.json
open runs/murder-of-mike/<run-id>/courtroom.html
```

A run folder holds the world it ran, every event, every human decision, the
court record, the credit and ethics ledgers, the metrics and the reveal. Runs
of the same world compare with `node harness/compare.ts <run> <run>`.

## Try it

Clone, `pnpm install`, then follow
[`packages/viewer/README.md`](packages/viewer/README.md): interview a world,
run it as the judge, and read the results in the browser
(`pnpm viewer`).

Read [`AGENTS.md`](AGENTS.md) for the operating rules and
[`packages/world-agent/CONTRACT.md`](packages/world-agent/CONTRACT.md) for
the contract. The product thinking is in
[`docs/raw/Murder-of-Mike-Product-Doc.md`](docs/raw/Murder-of-Mike-Product-Doc.md).
