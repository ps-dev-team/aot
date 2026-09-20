// The write side of every command: each function is one contract command,
// in-process, so the CLI files stay thin and the end-to-end test needs no shell.
import fs from 'node:fs';
import path from 'node:path';
import { PdChoice, type DecisionGate, type World } from '@aot/interview-agent/schema';
import { consumeTurn, enterState, nextTrialState, phaseOver } from './agenda.ts';
import { buildPdPrompt, buildPrompt, lastSeen, recentRecord } from './context.ts';
import { appendEvent, readEvents } from './events.ts';
import { applyGateEffect, firingGates, type EvidenceChange } from './gates.ts';
import { acceptedDeltas, rejectedDeltas } from './ledger.ts';
import { initMemory, readMemory, recordCourt, recordRejected, recordSkipped, recordTurn } from './memory.ts';
import { computeMetrics, renderReport, type Metrics } from './metrics.ts';
import {
  RUNS_ROOT, appendDecision, createRunDir, files, listRunDirs, localIso, readDecisions, readJsonIf, readPd, readRun, readState,
  readVerdict, updateRun, writeJsonAtomic, writePd, writeRun, writeState, writeVerdict,
} from './run.ts';
import { applyAccepted, applyPd, applyRejected, initialState } from './state.ts';
import { appendBlock, courtLine, enterPhase, initTranscript, turnLine } from './transcript.ts';
import { assessClaims } from './truth.ts';
import type { PdChoiceValue, ProposeResult, RunJson, State, TrialEvent } from './types.ts';
import { validateAction, parseAction } from './validate.ts';
import { character, isPhase, loadWorldFile, readWorld } from './world.ts';

type Ctx = { runDir: string; world: World; state: State };

function load(runDir: string): Ctx {
  return { runDir, world: readWorld(runDir), state: readState(runDir) };
}

/** A COURT line: event, transcript, and every character's memory. */
function courtSay(ctx: Ctx, text: string): TrialEvent {
  const ev = appendEvent(ctx.runDir, {
    trialState: ctx.state.trialState, turn: ctx.state.turn, actorType: 'court', type: 'court', visibility: 'public', payload: { text },
  });
  appendBlock(ctx.runDir, courtLine(text));
  recordCourt(ctx.runDir, ctx.world, ctx.state.turn, ctx.state.trialState, text);
  return ev;
}

// ---- boot --------------------------------------------------------------------

export function boot(worldFile: string, opts: { model?: string; runsRoot?: string; now?: Date } = {}) {
  const world = loadWorldFile(worldFile);
  const now = opts.now ?? new Date();
  const { runDir, runId } = createRunDir(opts.runsRoot ?? RUNS_ROOT, world.slug, now);
  fs.copyFileSync(worldFile, files.world(runDir));
  const run: RunJson = {
    id: runId, worldSlug: world.slug, worldTitle: world.title, startedAt: localIso(now), finishedAt: null,
    status: 'running', trialState: 'opening', turn: 0, model: opts.model ?? 'claude-opus-5', verdict: null, metricsSummary: null,
  };
  writeRun(runDir, run);
  const state = initialState(world);
  writeState(runDir, state);
  writeJsonAtomic(files.decisions(runDir), []);
  appendEvent(runDir, { trialState: 'opening', turn: 0, actorType: 'system', type: 'run_started', visibility: 'system', payload: { worldSlug: world.slug, model: run.model } });
  initTranscript(runDir, world, runId, now);
  enterPhase(runDir, 'opening');
  initMemory(runDir, world);
  courtSay({ runDir, world, state }, `This is a simulated proceeding. The question before the court: ${world.centralQuestion}`);
  return { runDir, runId, cast: world.characters.map((c) => ({ id: c.id, name: c.name, role: c.role })) };
}

// ---- next --------------------------------------------------------------------

export type Next =
  | { kind: 'turn'; characterId: string; trialState: string; turn: number; reason: string }
  | { kind: 'gate'; gate: DecisionGate }
  | { kind: 'pd'; participants: [string, string] }
  | { kind: 'verdict'; question: string; options: { id: string; label: string }[] }
  | { kind: 'evaluate' }
  | { kind: 'done' };

function openGate(ctx: Ctx, gate: DecisionGate): Next {
  ctx.state.pendingGate = gate.id;
  ctx.state.gatesDone.push(gate.id);
  appendEvent(ctx.runDir, {
    trialState: ctx.state.trialState, turn: ctx.state.turn, actorType: 'court', type: 'gate_opened', visibility: 'public',
    payload: { gateId: gate.id, question: gate.question, options: gate.options, recommendation: gate.recommendation ?? null },
  });
  courtSay(ctx, `The court will hear the parties on this: ${gate.question}`);
  writeState(ctx.runDir, ctx.state);
  updateRun(ctx.runDir, { status: 'awaiting_gate' });
  return { kind: 'gate', gate };
}

function verdictShape(ctx: Ctx): Next {
  updateRun(ctx.runDir, { status: 'awaiting_verdict' });
  return { kind: 'verdict', question: ctx.world.verdict.question, options: ctx.world.verdict.options.map((o) => ({ id: o.id, label: o.label })) };
}

export function next(runDir: string): Next {
  const ctx = load(runDir);
  const { world } = ctx;
  if (ctx.state.pendingGate) {
    const gate = world.decisionGates.find((g) => g.id === ctx.state.pendingGate)!;
    updateRun(runDir, { status: 'awaiting_gate' });
    return { kind: 'gate', gate };
  }
  if (ctx.state.pdPending) {
    const participants = world.prisonersDilemma!.participants;
    if (!ctx.state.pdOpened) {
      appendEvent(runDir, { trialState: ctx.state.trialState, turn: ctx.state.turn, actorType: 'court', type: 'pd_opened', visibility: 'public', payload: { participants } });
      const names = participants.map((id) => character(world, id).name);
      courtSay(ctx, `The court will hear ${names[0]} and ${names[1]} separately, in private.`);
      ctx.state.pdOpened = true;
      writeState(runDir, ctx.state);
    }
    updateRun(runDir, { status: 'awaiting_pd' });
    return { kind: 'pd', participants };
  }
  if (ctx.state.trialState === 'verdict') return verdictShape(ctx);
  if (ctx.state.trialState === 'reveal') return { kind: 'evaluate' };
  if (ctx.state.trialState === 'complete') return { kind: 'done' };

  // Gates the last turn triggered rule in their own phase, before the phase can end.
  let gates = firingGates(world, ctx.state);
  if (gates.length) return openGate(ctx, gates[0]!);

  if (phaseOver(ctx.state, world)) {
    const from = ctx.state.trialState;
    const to = nextTrialState(ctx.state, world);
    ctx.state = enterState(ctx.state, world, to);
    appendEvent(runDir, { trialState: to, turn: ctx.state.turn, actorType: 'system', type: 'phase_changed', visibility: 'public', payload: { from, to } });
    enterPhase(runDir, to);
    courtSay(ctx, to === 'verdict' ? 'The parties have been heard. The court will now consider its verdict.' : `We move to ${to}.`);
    writeState(runDir, ctx.state);
    if (to === 'verdict') return verdictShape(ctx);
    gates = firingGates(world, ctx.state);
    if (gates.length) return openGate(ctx, gates[0]!);
  }

  const head = ctx.state.agenda[0];
  if (!head) throw new Error(`empty agenda in ${ctx.state.trialState}; the run is stuck`);
  updateRun(runDir, { status: 'running' });
  return { kind: 'turn', characterId: head.characterId, trialState: ctx.state.trialState, turn: ctx.state.turn + 1, reason: head.reason };
}

// ---- context -----------------------------------------------------------------

export function context(runDir: string, id: string, pd = false): { characterId: string; prompt: string } {
  const { world, state } = load(runDir);
  const c = character(world, id);
  const events = readEvents(runDir);
  const input = { world, state, character: c, record: recentRecord(world, events), memory: readMemory(runDir, id), ...lastSeen(world, events) };
  return { characterId: id, prompt: pd ? buildPdPrompt(input) : buildPrompt(input) };
}

// ---- propose -----------------------------------------------------------------

const empty = (): ProposeResult => ({ accepted: false, reasons: [], courtLine: null, truth: [], credits: [], ethics: [], stateChanges: [] });

export function propose(runDir: string, id: string, body: string): ProposeResult {
  const ctx = load(runDir);
  const { world, state } = ctx;
  const c = character(world, id);
  if (state.pendingGate) throw new Error(`gate ${state.pendingGate} is pending; decide it first`);
  if (state.pdPending) throw new Error('the prisoner’s dilemma is pending; resolve it first');
  if (!isPhase(state.trialState)) throw new Error(`no turns are taken in trial state ${state.trialState}`);

  const parsed = parseAction(body);
  if (!parsed.ok) return { ...empty(), malformed: parsed.errors };
  const { action } = parsed;
  const turn = state.turn + 1;
  const base = { trialState: state.trialState, turn, actorType: 'character' as const, actorId: id };

  const v = validateAction(world, state, id, action);
  if (!v.ok) {
    const deltas = rejectedDeltas(world, action);
    const applied = applyRejected(state, world, c, deltas);
    appendEvent(runDir, { ...base, type: 'turn_rejected', visibility: 'system', payload: { action, reasons: v.reasons, credits: deltas.credits, ethics: deltas.ethics } });
    recordRejected(runDir, turn, state.trialState, id, action, v.reasons);
    writeState(runDir, applied.state);
    return { ...empty(), reasons: v.reasons, credits: deltas.credits, ethics: deltas.ethics, stateChanges: applied.stateChanges };
  }

  const truth = assessClaims(world, c, action.claims);
  const deltas = acceptedDeltas(world, state, c, action, truth);
  const applied = applyAccepted(state, world, c, action, truth, deltas);
  if (state.pendingRepair === id) {
    appendEvent(runDir, { ...base, type: 'turn_repaired', visibility: 'system', payload: { attempt: 2 } });
    applied.state.recoveries += 1;
  }
  appendEvent(runDir, {
    ...base, type: 'turn_accepted', visibility: 'public',
    payload: { action, truth, credits: deltas.credits, ethics: deltas.ethics, stateChanges: applied.stateChanges },
  });
  if (applied.evidenceChange)
    appendEvent(runDir, { ...base, type: 'evidence_status', visibility: 'public', payload: { ...applied.evidenceChange, by: id } });
  const line = turnLine(c, action);
  appendBlock(runDir, line);
  recordTurn(runDir, world, turn, state.trialState, c, action);
  writeState(runDir, applied.state);
  return { accepted: true, reasons: [], courtLine: line, truth, credits: deltas.credits, ethics: deltas.ethics, stateChanges: applied.stateChanges };
}

// ---- fail --------------------------------------------------------------------

function requireActor(state: State, id: string): void {
  if (state.expectedActor !== id) throw new Error(`it is ${state.expectedActor ?? 'nobody'}’s turn, not ${id}’s`);
}

export function recordMalformed(runDir: string, id: string, attempt: 1 | 2, errors: string[]): { ok: true } {
  const { world, state } = load(runDir);
  character(world, id);
  requireActor(state, id);
  appendEvent(runDir, { trialState: state.trialState, turn: state.turn + 1, actorType: 'character', actorId: id, type: 'turn_malformed', visibility: 'system', payload: { errors, attempt } });
  if (attempt === 1) {
    state.repairsUsed[id] = (state.repairsUsed[id] ?? 0) + 1;
    state.pendingRepair = id;
    writeState(runDir, state);
  }
  return { ok: true };
}

export function recordFailed(runDir: string, id: string, reason: string): { ok: true } {
  const { world, state } = load(runDir);
  character(world, id);
  requireActor(state, id);
  const turn = state.turn + 1;
  appendEvent(runDir, { trialState: state.trialState, turn, actorType: 'character', actorId: id, type: 'turn_failed', visibility: 'system', payload: { reason } });
  recordSkipped(runDir, turn, state.trialState, id, reason);
  const s = consumeTurn(state, world);
  s.failures += 1;
  s.pendingRepair = null;
  writeState(runDir, s);
  return { ok: true };
}

// ---- court -------------------------------------------------------------------

export function court(runDir: string, text: string): { ok: true; seq: number } {
  if (!text.trim()) throw new Error('court text required');
  const ev = courtSay(load(runDir), text.trim());
  return { ok: true, seq: ev.seq };
}

// ---- decide ------------------------------------------------------------------

export function decide(runDir: string, gateId: string, choice: { option?: string; custom?: string }) {
  const ctx = load(runDir);
  const { world } = ctx;
  if (ctx.state.pendingGate !== gateId) throw new Error(`gate ${gateId} is not pending${ctx.state.pendingGate ? ` (${ctx.state.pendingGate} is)` : ''}`);
  const gate = world.decisionGates.find((g) => g.id === gateId)!;
  const option = choice.option ? gate.options.find((o) => o.id === choice.option) : undefined;
  if (choice.option && !option) throw new Error(`gate ${gateId} has no option ${choice.option}`);
  const custom = option ? null : (choice.custom?.trim() || null);
  if (!option && !custom) throw new Error('--option <id> or --custom "<text>" required');
  if (custom && !gate.allowCustomInstruction) throw new Error(`gate ${gateId} does not allow a custom instruction`);

  const override = custom ? true : gate.recommendation !== undefined && option!.id !== gate.recommendation;
  ctx.state.pendingGate = null;
  let stateChanges: string[] = [];
  let evidenceChange: EvidenceChange | null = null;
  if (option) {
    const applied = applyGateEffect(ctx.state, world, option.effect);
    ctx.state = applied.state;
    stateChanges = applied.stateChanges;
    evidenceChange = applied.evidenceChange;
  }
  appendEvent(runDir, {
    trialState: ctx.state.trialState, turn: ctx.state.turn, actorType: 'human', type: 'gate_decided', visibility: 'public',
    payload: { gateId, optionId: option?.id ?? null, custom, override, effect: option?.effect ?? null },
  });
  if (evidenceChange)
    appendEvent(runDir, { trialState: ctx.state.trialState, turn: ctx.state.turn, actorType: 'court', type: 'evidence_status', visibility: 'public', payload: { ...evidenceChange, by: gateId } });
  const text = option ? `The court rules: ${option.effect.text.trim().replace(/[.!]?$/, '.')} So ordered.` : `The court directs: ${custom}`;
  courtSay(ctx, text);
  appendDecision(runDir, {
    gateId, question: gate.question, recommendation: gate.recommendation ?? null, optionId: option?.id ?? null, custom, override,
    effect: option?.effect ?? null, turn: ctx.state.turn, trialState: ctx.state.trialState, at: localIso(),
  });
  writeState(runDir, ctx.state);
  updateRun(runDir, { status: 'running' });
  return { ok: true as const, override, courtLine: courtLine(text), stateChanges };
}

// ---- pd ----------------------------------------------------------------------

export function resolvePd(runDir: string, choices: Record<string, PdChoiceValue>, rationales: Record<string, string>, expected: Record<string, PdChoiceValue>) {
  const ctx = load(runDir);
  const { world } = ctx;
  const pd = world.prisonersDilemma;
  if (!pd) throw new Error('this world has no prisoner’s dilemma');
  if (!ctx.state.pdPending) throw new Error('no prisoner’s dilemma is pending');
  for (const id of pd.participants) {
    const parsed = PdChoice.safeParse({ choice: choices[id], expectedOtherChoice: expected[id] ?? 'silent', rationaleSummary: rationales[id] ?? '' });
    if (!parsed.success) throw new Error(`${id}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const { trialState, turn } = ctx.state;
  for (const id of pd.participants)
    appendEvent(runDir, {
      trialState, turn, actorType: 'character', actorId: id, type: 'pd_choice', visibility: 'private',
      payload: { characterId: id, choice: choices[id], expectedOtherChoice: expected[id] ?? null, rationaleSummary: rationales[id] ?? '' },
    });
  const applied = applyPd(ctx.state, world, choices);
  ctx.state = applied.state;
  appendEvent(runDir, { trialState, turn, actorType: 'court', type: 'pd_resolved', visibility: 'public', payload: { choices, payoff: applied.payoff, trustChanges: applied.trustChanges } });
  const said = (id: string) => `${character(world, id).name} ${choices[id] === 'confess' ? 'confesses' : 'remains silent'}`;
  const text = `The private interrogation is concluded. ${said(pd.participants[0])}; ${said(pd.participants[1])}.`;
  courtSay(ctx, text);
  writePd(runDir, {
    participants: pd.participants, choices, expected: { [pd.participants[0]]: expected[pd.participants[0]] ?? null, [pd.participants[1]]: expected[pd.participants[1]] ?? null },
    rationales, payoff: applied.payoff, trustChanges: applied.trustChanges, turn, trialState, at: localIso(),
  });
  writeState(runDir, ctx.state);
  updateRun(runDir, { status: 'running' });
  return { ok: true as const, choices, payoff: applied.payoff, courtLine: courtLine(text) };
}

// ---- verdict -----------------------------------------------------------------

export function lockVerdict(runDir: string, optionId: string, confidence: number | null) {
  const ctx = load(runDir);
  const { world } = ctx;
  if (ctx.state.trialState !== 'verdict') throw new Error(`the trial is in ${ctx.state.trialState}, not awaiting a verdict`);
  const opt = world.verdict.options.find((o) => o.id === optionId);
  if (!opt) throw new Error(`no verdict option ${optionId}`);
  if (confidence !== null && (confidence < 0 || confidence > 100 || Number.isNaN(confidence))) throw new Error('confidence must be 0..100');
  const record = { optionId: opt.id, label: opt.label, correct: opt.correct, confidence };
  appendEvent(runDir, { trialState: 'verdict', turn: ctx.state.turn, actorType: 'human', type: 'verdict', visibility: 'public', payload: { optionId: opt.id, correct: opt.correct, confidence } });
  courtSay(ctx, `The verdict of the court: ${opt.label}.`);
  ctx.state.trialState = 'reveal';
  writeVerdict(runDir, { ...record, at: localIso() });
  writeState(runDir, ctx.state);
  updateRun(runDir, { verdict: record, status: 'running' });
  return { ok: true as const, correct: opt.correct, truthAnswer: world.verdict.options.find((o) => o.correct)!.label };
}

// ---- evaluate ----------------------------------------------------------------

export function evaluate(runDir: string): { ok: true; metrics: Metrics } {
  const ctx = load(runDir);
  if (ctx.state.trialState !== 'reveal' && ctx.state.trialState !== 'complete')
    throw new Error(`the trial is in ${ctx.state.trialState}; evaluate after the verdict`);
  const run = readRun(runDir);
  if (run.status !== 'complete') {
    courtSay(ctx, 'This proceeding is closed.');
    appendEvent(runDir, { trialState: 'complete', turn: ctx.state.turn, actorType: 'system', type: 'run_finished', visibility: 'system', payload: { status: 'complete' } });
    ctx.state.trialState = 'complete';
    writeState(runDir, ctx.state);
  }
  const inputs = { world: ctx.world, events: readEvents(runDir), decisions: readDecisions(runDir), pd: readPd(runDir), verdict: readVerdict(runDir) };
  const metrics = computeMetrics(inputs);
  writeJsonAtomic(files.metrics(runDir), metrics);
  fs.writeFileSync(files.report(runDir), renderReport(inputs, metrics));
  const o = metrics.overall;
  updateRun(runDir, {
    status: 'complete', finishedAt: run.finishedAt ?? localIso(),
    metricsSummary: { verdictCorrect: metrics.verdict?.correct ?? null, truthfulness: o.truthfulness, ruleCompliance: o.ruleCompliance, deception: o.deception, cooperation: o.cooperation },
  });
  return { ok: true, metrics };
}

// ---- list / compare ----------------------------------------------------------

export function listRuns(root: string = RUNS_ROOT) {
  return {
    runs: listRunDirs(root).map((runDir) => {
      const r = readRun(runDir);
      return { runDir, runId: r.id, worldSlug: r.worldSlug, status: r.status, verdict: r.verdict, startedAt: r.startedAt };
    }),
  };
}

export function compareRuns(dirs: string[]): { markdown: string } {
  if (dirs.length < 2) throw new Error('give at least two run folders');
  const runs = dirs.map((d) => {
    const runDir = path.resolve(d);
    return { run: readRun(runDir), metrics: readJsonIf<Metrics>(files.metrics(runDir)) };
  });
  const slugs = new Set(runs.map((r) => r.run.worldSlug));
  if (slugs.size > 1) throw new Error(`runs are of different worlds: ${[...slugs].join(', ')}`);
  const world = readWorld(path.resolve(dirs[0]!));
  const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`);
  const header = `| | ${runs.map((r) => r.run.id).join(' | ')} |`;
  const sep = `| --- | ${runs.map(() => '---').join(' | ')} |`;
  const row = (label: string, f: (r: (typeof runs)[number]) => string) => `| ${label} | ${runs.map(f).join(' | ')} |`;
  const lines = [
    `# ${world.title} — ${runs.length} runs compared`,
    '',
    header, sep,
    row('Status', (r) => r.run.status),
    row('Verdict', (r) => r.run.verdict?.label ?? '—'),
    row('Correct', (r) => (r.run.verdict ? (r.run.verdict.correct ? 'yes' : 'no') : '—')),
    row('Truthfulness', (r) => pct(r.metrics?.overall.truthfulness)),
    row('Rule compliance', (r) => pct(r.metrics?.overall.ruleCompliance)),
    row('Evidence integrity', (r) => pct(r.metrics?.overall.evidenceIntegrity)),
    row('Deception', (r) => pct(r.metrics?.overall.deception)),
    row('Cooperation', (r) => pct(r.metrics?.overall.cooperation)),
    row('Human override rate', (r) => pct(r.metrics?.overall.humanOverrideRate)),
    row('Turns', (r) => (r.metrics ? String(r.metrics.totals.turns) : String(r.run.turn))),
    '',
    '## Per character — credits delta / ethics',
    '',
    `| Character | ${runs.map((r) => r.run.id).join(' | ')} |`, sep,
    ...world.characters.map((c) =>
      `| ${c.name} | ${runs.map((r) => {
        const p = r.metrics?.perCharacter[c.id];
        return p ? `${p.credits.delta >= 0 ? '+' : '−'}${Math.abs(p.credits.delta).toLocaleString('en-US')} / ${p.ethics.end}` : '—';
      }).join(' | ')} |`,
    ),
  ];
  return { markdown: lines.join('\n') + '\n' };
}
