# Decisions

The things a future reader would otherwise re-litigate. Add to it when you
decide something the next person would have to work out again.

## The application owns the truth; agents propose

Ground truth, evidence integrity, knowledge grants and accepted trial state are
database rows the orchestrator reads and writes. An agent's structured output
is a proposal: the orchestrator validates every identifier and permission and
commits one event, or records the rejection. This is what makes the evaluation
deterministic — the metrics are a fold over the event log — and it is why XO
observes execution rather than owning it. See spec §3 and §13.


## Claude Code is the agent runtime; the harness is code

The first plan was a Next.js app driving AI SDK `ToolLoopAgent`s with XO Space
as a telemetry sink. XO's docs killed that: it reads the native session stores
of supported runtimes (Claude Code, Codex, OpenClaw…) and has no push API, so an
AI SDK process is invisible to it. Meanwhile the product doc wanted a
hard-coded case, a human judge, and an 8-minute demo — not a scenario SaaS.

So: the interview and the trial are two Claude Code sessions with skills.
Characters are tool-less subagents that receive a prompt and return one JSON
action. Everything deterministic — validation, state, credits, ethics, truth
checks, metrics — is plain TypeScript under `packages/world-agent/harness`
that the orchestrator session calls. Runs are folders. XO becomes optional
and free: start the world agent's `claude` inside an XO space and every turn
is a session it can already see.

## The court record and the trace are different files

The human reads `court/transcript.md`: accepted public turns and the court's
rulings, nothing else. Judges of the project read `events.jsonl`: every
proposal, rejection, repair, truth check and ledger delta. Mixing them makes
the record unreadable and the trace incomplete. The viewer shows both.
