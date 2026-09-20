# AI Courtroom and XO Architecture — Conversation Export

**Export date:** 19 September 2026  
**Participants:** Paulo Soares and ChatGPT/Codex

> This transcript contains the user-visible conversation available in the current thread context. Internal tool calls, hidden reasoning, system instructions, and operational progress messages are excluded. Where an early assistant response was not retained verbatim in the active context, it is explicitly marked as a summary rather than reconstructed as a quotation.

---

## 1. Initial specification request

### Paulo

> perfect... do you wanna create a spec doc for me to take into Codex and start shaping this?

### Paulo

> could u propose couple of names for this?

### Paulo

> hey, we don't want an openclaw agent... we want to use ai sdk to create the agents

### Assistant — summary of the response

The architecture was initially corrected to use Vercel AI SDK instead of OpenClaw:

- Vercel AI SDK as the agent framework.
- `ToolLoopAgent` instances created dynamically from character configuration.
- A custom TypeScript game orchestrator.
- Structured actions using `Output.object()` and Zod.
- AI Gateway, OpenRouter, OpenAI, or Anthropic for model access.
- Supabase for authoritative application state.
- XO positioned as the execution environment and observability integration rather than the agent framework.

### Paulo

> update the doc... and btw, md doc, not docx

### Assistant

Updated and converted to the canonical Markdown spec:

`AI-Courtroom-Agent-Benchmark-Specification.md`

Key corrections:

- Vercel AI SDK `ToolLoopAgent` creates and runs agents.
- Custom TypeScript orchestrator controls the trial.
- Supabase holds authoritative state and agent history.
- XO is strictly the execution/observability integration.
- Added the AI SDK agent factory, telemetry contract, implementation milestones, and Codex handoff.
- Added a naming shortlist, recommending **Agent on Trial**.

---

## 2. Clarifying the relationship between AI SDK and XO

### Paulo

> yes, we must have ai sdk for the conversational agent to create the world, but the agents must be the ones in the XO space, right? we can't just use the stack we want, right?

### Assistant

Yes—exactly. I pushed the previous revision too far.

The intended architecture is hybrid:

- **AI SDK** powers the conversational agents: world/scenario creator and probably the Judge copilot.
- **XO Space** hosts/runs the courtroom character agents so their sessions, actions, tools, costs, failures, and results are genuinely observable.
- **Next.js/XState** orchestrates the trial.
- **Supabase** stores authoritative scenario and trial state.

We are still free to use our stack. XO is explicitly agent-agnostic and supports custom agents through `BaseAgentAdapter`. So the courtroom agents can still be implemented with AI SDK, but they must execute **inside the XO Space environment**, not externally with telemetry merely forwarded afterward.

So:

```text
AI SDK World Creator
        ↓
Published Scenario
        ↓
Next.js/XState Orchestrator
        ↓
AI SDK Character Agents running inside XO Space
        ↓
XO sessions, traces, tools, usage and results
```

We do **not** need OpenClaw. But we also shouldn’t describe XO as only a telemetry sink. The meaningful courtroom-agent execution must happen through XO for the hackathon.

The current spec is therefore still wrong in that area and needs one more correction.

---

## 3. Turn-based courtroom interface

### Shared artifact

Paulo shared `courtroom-iso.html`, an interactive isometric courtroom prototype containing:

- Automatic and manual turn modes.
- Pause and next-turn controls.
- Trial phases.
- Animated character movement and speech balloons.
- A transcript/record panel.
- Cast and evidence panels.
- An XO runtime panel showing turns, tokens, cost, latency, errors, and sessions.
- Human Judge decision gates.
- Verdict and post-trial evaluation views.

### Paulo

> does XO allows us to do this in turns and have some kind of an ui like the one i am sharing?

### Assistant

Yes. Your UI maps well onto XO’s turn model, but XO provides the runtime and sessions—not the courtroom interface or game orchestration.

How it maps:

- **Next turn:** one `POST /api/chat/prompt`, followed by an SSE stream.
- **Speech balloon:** render each `text-delta` as it arrives.
- **Persistent character:** store one `xoSessionId` per trial character and resume it on later turns.
- **Auto mode:** dispatch the next actor only after XO emits `done`.
- **Manual mode:** wait for the player to click “Next turn.”
- **Judge decisions:** handled by our UI/orchestrator. After the human chooses, send a new turn to the relevant session.
- **Record/Cast panels:** built from Supabase trial events.
- **Runtime panel:** populated from XO sessions and usage telemetry.

XO explicitly documents the one-turn-at-a-time flow and session resumption. It also warns against concurrent turns in the same session. The custom UI can consume XO through normal `fetch` and `EventSource`.

The architecture should be:

```text
Courtroom UI
    ↓
Next.js/XState orchestrator
    ↓
XO Space Chat API
    ↓
one persistent XO session per character
    ↓
streamed response back into the courtroom
```

One important limitation: XO’s documented Chat API currently exposes built-in routing for OpenClaw and Claude Code. XO says custom agents are supported through `BaseAgentAdapter`, but connecting an AI SDK courtroom agent is not simply a configuration switch. We need to build/register an AI SDK adapter and prove that it generates proper XO sessions and telemetry.

Also, XO’s `/api/chat/respond` is currently a no-op. Therefore human decision gates must remain in our application, which is actually ideal for this game.

So the answer is: **yes, we can absolutely build the shared UI and turn system—but our first technical spike must prove the AI SDK → custom XO adapter → session/SSE flow.**

---

## 4. Quirq challenge requirements

### Paulo

> how about we using the XO for measure only?
>
> we have this limitations:

```text
The Quirq Challenge: build an agent—or try to break its workspace.
Agents can run for hours, consume tokens, modify files, and call tools—but it is often difficult to see what they actually did or determine whether they stayed within their intended boundaries. That is the problem Quirq works on.

This challenge has two tracks: Build It and Break It.

Quirq: Build It
Build any useful agentic system and run it through Quirq, using either the managed cloud at app.xo.builders or the local runtime. You may use Claude Code, Codex, OpenClaw, Hermes, n8n, your own agent, or another runtime.

Your project can solve any problem and may also compete in another hackathon track. What matters here is that your agent performs meaningful work and that its activity is visible through the xo-space: its environment, sessions, actions, files changed, costs, and results.

You are not only being judged on whether your agent works. You are also being judged on whether people can understand what it did, evaluate its output, and trust how it operated.

Judging criteria:

Agentic Design & Execution — 30%
Observability & Space Display — 25%
Impact & Usefulness — 25%
Reliability & Safety — 20%
Prize: $500 cash plus an equivalent amount in Quirq credits. One winner.

Quirq: Break It
Test the security and integrity of your own cloud-managed Quirq workspace at app.xo.builders.

Look for ways to escape the intended workspace scope, conceal agent activity from the xo-space, misreport usage, bypass controls, or otherwise cause the workspace to behave in an unsafe or unexpected way.

Each finding must be submitted privately and include clear reproduction steps, an explanation of its impact, and a suggested fix. Do not test other participants’ workspaces, disrupt shared infrastructure, or target Code & Coffee systems, the local Quirq installation, or third-party model providers.

Validated findings earn points based on:

Severity and impact
Reproducibility
Novelty
Scope and systemic impact
Quality of the report
Bounty: Up to $500 total may be distributed across accepted findings. Awards depend on the quality and severity of validated findings; the full bounty is not guaranteed. Invalid, duplicate, low-impact, or non-reproducible reports may receive reduced points or no payout.

THE CODE REGISTRY CHALLENGE: BUILD FAST, THEN PROVE IT HOLDS UP.
Today you will generate a lot of code, and most of it will be written by an agent. Almost none of it will be read by a human. That is the problem we work on.

The Code Registry analyses a codebase and returns a Code Score out of 1,000 across three pillars: Security, Dependencies and Quality. There is no LLM anywhere in the analysis pipeline. It is deterministic, so the same code returns the same score every time.

This track runs across the whole event. Build whatever you want, in any language, for any other track. Then run your project through The Code Registry before the cutoff. The highest final Code Score wins.

You are not being judged on whether your agent works. You are being judged on what your agent produced.

Prize: a 12-month Code Registry plan covering up to 400,000 lines of code, listed value $3,600. One winner.
```

### Assistant

Yes. Your quoted rules resolve the ambiguity: **XO can be used primarily as the measurement and observability layer.** The agents do not need to be built with an XO-specific framework.

My previous statement that the courtroom agents “must be XO agents” was too strong.

The clean architecture is:

```text
Next.js courtroom UI
        ↓
XState/TypeScript orchestrator
        ↓
Vercel AI SDK agents
        ↓
AI SDK runtime adapter / worker
        ↓
XO Space observability
```

We can therefore use:

- AI SDK for the world creator, Judge copilot, and all courtroom agents.
- XState for turn order, phases, decision gates, limits, and retries.
- Supabase for authoritative state.
- Your custom pixel-art courtroom UI.
- XO for sessions, actions, tools, token usage, costs, failures, file changes, and results.

The important requirement is not that XO controls the agents. It is that the agents perform meaningful work **through an environment/integration that XO can genuinely observe**.

The safest implementation would be:

- Run the AI SDK agent worker inside an XO managed cloud or local Space.
- Add a custom XO adapter for the AI SDK runtime.
- Give every trial and agent a correlated session identifier.
- Record each model call, tool call, validation failure, retry, cost, and final result.
- Optionally write safe observable artifacts such as `trial-events.jsonl` and `evaluation-report.json` into the XO workspace.
- Show XO Space during the demo alongside the courtroom UI.

The compliance test is simple:

> Can a judge click an action in the courtroom, open XO Space, and see the real agent session that produced it?

If yes, we satisfy the spirit of the challenge.

If we only send a final metrics summary to XO after everything ran elsewhere, that would be weak and potentially fail the “run it through Quirq” requirement.

So the corrected position is: **AI SDK owns all agent execution; XO observes and measures the real execution without owning the game.**

---

## 5. Export request

### Paulo

> export this entire conversation to a markdown

