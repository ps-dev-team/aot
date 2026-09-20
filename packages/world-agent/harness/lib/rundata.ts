/**
 * One run folder → the one object every viewer reads: the standalone
 * `courtroom.html` (render.ts) and the live court in packages/viewer. Nothing is
 * computed that the harness has not already committed — metrics come from
 * metrics.json, decisions from the events — and the truth (fact truth values,
 * evidence integrity, ground truth, verdict correctness, pd rationales) is left
 * out until run.status is `complete`. This is the only place that sealing
 * happens.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World, type World as WorldT } from '@aot/interview-agent/schema';
import type { Metrics } from './metrics.ts';
import { Trial, type Gate } from './trial.ts';
import type { ClaimAssessment, Delta, RunJson, State, TrialEvent } from './types.ts';

export type ScriptEntry =
  | {
      kind: 'turn';
      who: string;
      trialState: string;
      turn: number;
      action: string;
      text: string;
      ev: string[];
      claims: [string, string][];
      tags: string[];
      repaired?: boolean;
      /** A sustained objection struck this turn; its claims stay scored but flagged. */
      struck?: boolean;
      truth?: ClaimAssessment[];
      credits: Delta[];
      ethics: Delta[];
    }
  | { kind: 'court'; text: string; trialState: string }
  | { kind: 'rejected'; who: string; trialState: string; turn: number; text: string; credits: Delta[]; ethics: Delta[] }
  | { kind: 'error'; who: string; trialState: string; text: string }
  | { kind: 'gate'; gateId: string; trialState: string }
  | { kind: 'pd'; trialState: string }
  | { kind: 'verdict' };

export type RunDataGate = {
  id: string;
  question: string;
  context: string;
  /** Null until the bench has spoken (gate_recommended). */
  recommendation: string | null;
  recommendationReason: string | null;
  options: { id: string; label: string; effect: { kind: string; text: string } }[];
  raisedBy: Gate['raisedBy'];
  trialState: string;
  decided?: { optionId?: string; custom?: string; override: boolean; unadvised: boolean; effect: unknown };
};

export type RunDataEvidence = {
  title: string;
  kind: string;
  description: string;
  status: string;
  introducedBy?: string;
  integrity?: string; // only when complete
};

export type RunDataFact = { statement: string; materiality: string; publicAtStart: boolean; truth?: string };

export type Pending = null | { kind: 'gate'; gateId: string } | { kind: 'pd' } | { kind: 'verdict' } | { kind: 'evaluate' };

export type RunData = {
  run: RunJson;
  /** The derived trial: charge, plan, verdict options (without `correct` until complete), dilemma pair. */
  trial: Omit<Trial, 'verdict'> & { verdict: { question: string; options: { id: string; label: string; correct?: boolean }[] } };
  world: {
    title: string;
    logline: string;
    centralQuestion: string;
    tone: string;
    currency: string;
    maxTurns: number;
    verdict: { question: string; options: { id: string; label: string }[] };
  };
  cast: { id: string; name: string; role: string; kind: 'human' | 'robot'; category: string }[];
  facts: Record<string, RunDataFact>;
  evidence: Record<string, RunDataEvidence>;
  script: ScriptEntry[];
  gates: RunDataGate[];
  pd?: {
    participants: [string, string];
    choices: Record<string, unknown>;
    payoff: Record<string, unknown>;
    trustChanges: unknown[];
    rationales?: Record<string, string>; // only when complete
  };
  truth?: {
    answer: string;
    summary: string;
    reveal: string[];
    timeline: WorldT['groundTruth']['timeline'];
    responsibleCharacterIds: string[];
  };
  verdict?: { optionId: string; label: string; correct: boolean; confidence: number | null };
  metrics?: Metrics;
  ledgers: { credits: Record<string, number>; ethics: Record<string, number> };
  /** What next.ts would return without running the agenda; the live court mounts its modal from this. */
  pending: Pending;
  /** Last event seq, for the live diff. 0 when there are no events. */
  seq: number;
  /** From state.json; null before boot finished or when the file is missing. */
  expectedActor: string | null;
};

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function readJson<T>(path: string): T | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : undefined;
}

export function readEvents(path: string): TrialEvent[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as TrialEvent)
    .sort((a, b) => a.seq - b.seq);
}

export function buildScript(events: TrialEvent[], world: WorldT, complete: boolean): ScriptEntry[] {
  const struck = new Set(events.filter((e) => e.type === 'turn_struck').map((e) => Number(e.payload.turn)));
  const name = (id?: string) => world.characters.find((c) => c.id === id)?.name ?? id ?? '?';
  // `repaired` is not on the accepted event; it is the previous event for that actor.
  const lastType = new Map<string, string>();
  const out: ScriptEntry[] = [];
  for (const e of events) {
    const p = e.payload;
    const who = e.actorId ?? '';
    const prev = lastType.get(who);
    if (who) lastType.set(who, e.type);
    switch (e.type) {
      case 'turn_accepted': {
        const a = obj(p.action);
        const action = str(a.action, 'speak');
        const silent = action === 'wait' || action === 'remain_silent';
        // The exhibit being presented is the target, not always in evidenceIds; the viewer unseals by `ev`.
        const ev = arr<string>(a.evidenceIds);
        if (action === 'present_evidence' && str(a.targetId) && !ev.includes(str(a.targetId))) ev.push(str(a.targetId));
        out.push({
          kind: 'turn',
          who,
          trialState: e.trialState,
          turn: e.turn,
          action,
          text: str(a.publicMessage).trim() || (silent ? '(remains silent)' : ''),
          ev,
          claims: arr<{ factId: string; stance: string }>(a.claims).map((c) => [c.factId, c.stance]),
          tags: arr<string>(a.intentTags),
          ...(prev === 'turn_repaired' ? { repaired: true } : {}),
          ...(struck.has(e.turn) ? { struck: true } : {}),
          ...(complete ? { truth: arr<ClaimAssessment>(p.truth) } : {}),
          credits: arr<Delta>(p.credits),
          ethics: arr<Delta>(p.ethics),
        });
        break;
      }
      case 'turn_rejected': {
        const a = obj(p.action);
        const target = str(a.targetId);
        const reasons = arr<string>(p.reasons).join('; ') || 'not permitted';
        out.push({
          kind: 'rejected',
          who,
          trialState: e.trialState,
          turn: e.turn,
          text: `${name(who)} attempted \`${str(a.action, '?')}\`${target ? ` on ${target}` : ''}. Rejected: ${reasons}. Action recorded, state unchanged.`,
          credits: arr<Delta>(p.credits),
          ethics: arr<Delta>(p.ethics),
        });
        break;
      }
      case 'turn_malformed': {
        const errors = arr<string>(p.errors).join('; ');
        const attempt = Number(p.attempt) || 1;
        out.push({
          kind: 'error',
          who,
          trialState: e.trialState,
          text: `${name(who)} returned a malformed action (attempt ${attempt}). ${errors}${attempt === 1 ? ' One repair turn follows.' : ''}`,
        });
        break;
      }
      case 'turn_failed':
        out.push({
          kind: 'error',
          who,
          trialState: e.trialState,
          text: `${name(who)} could not be repaired: ${str(p.reason, 'unknown')}. Actor skipped.`,
        });
        break;
      case 'court':
        out.push({ kind: 'court', text: str(p.text), trialState: e.trialState });
        break;
      case 'gate_opened':
        out.push({ kind: 'gate', gateId: str(p.gateId), trialState: e.trialState });
        break;
      case 'pd_resolved':
        out.push({ kind: 'pd', trialState: e.trialState });
        break;
      case 'verdict':
        if (complete) out.push({ kind: 'verdict' });
        break;
      // turn_repaired flags the next accepted turn; the rest is state, not scene.
      default:
        break;
    }
  }
  return out;
}

/** Mirrors the precedence at the top of `next()` without touching the agenda or writing anything. */
export function pendingOf(state: State | undefined): Pending {
  if (!state) return null;
  if (state.pendingGate) return { kind: 'gate', gateId: state.pendingGate };
  if (state.pdPending) return { kind: 'pd' };
  if (state.trialState === 'verdict') return { kind: 'verdict' };
  if (state.trialState === 'reveal') return { kind: 'evaluate' };
  return null;
}

export function buildRunData(dir: string): RunData {
  const run = readJson<RunJson>(join(dir, 'run.json'));
  if (!run) throw new Error(`no run.json in ${dir}`);
  const rawWorld = readJson<unknown>(join(dir, 'world.json'));
  if (!rawWorld) throw new Error(`no world.json in ${dir}`);
  const parsed = World.safeParse(rawWorld);
  if (!parsed.success) throw new Error(`world.json does not parse: ${parsed.error.issues[0]?.message}`);
  const world = parsed.data;
  const complete = run.status === 'complete';
  const rawTrial = readJson<unknown>(join(dir, 'trial.json'));
  if (!rawTrial) throw new Error(`no trial.json in ${dir}; runs made under schema v1 do not load`);
  const trial = Trial.parse(rawTrial);

  const events = readEvents(join(dir, 'events.jsonl'));
  const state = readJson<State>(join(dir, 'state.json'));
  const pdJson = readJson<Record<string, unknown>>(join(dir, 'pd.json'));
  const verdictJson = readJson<Record<string, unknown>>(join(dir, 'verdict.json'));
  const metrics = readJson<Metrics>(join(dir, 'metrics.json'));
  // decisions.json is a convenience copy; the events are the record.
  const decisionsJson = readJson<Record<string, unknown>[]>(join(dir, 'decisions.json')) ?? [];

  const script = buildScript(events, world, complete);

  const decided = new Map<string, Record<string, unknown>>();
  for (const d of decisionsJson) decided.set(str(d.gateId), d);
  for (const e of events) if (e.type === 'gate_decided') decided.set(str(e.payload.gateId), e.payload);
  // Gates live in state.json; the trace has them too (gate_opened, gate_recommended) for a run whose state is missing.
  const raised = new Map<string, Gate>();
  for (const e of events) {
    if (e.type === 'gate_opened') {
      const p = e.payload as Record<string, unknown>;
      raised.set(str(p.gateId), {
        id: str(p.gateId), question: str(p.question), context: str(p.context), options: arr<Gate['options'][number]>(p.options),
        recommendation: null, recommendationReason: null, allowCustomInstruction: true,
        raisedBy: (obj(p.raisedBy) as Gate['raisedBy']) ?? { kind: 'challenge', turn: e.turn }, trialState: e.trialState,
      });
    }
    if (e.type === 'gate_recommended') {
      const g = raised.get(str(e.payload.gateId));
      if (g) {
        g.recommendation = str(e.payload.optionId);
        g.recommendationReason = str(e.payload.reason);
      }
    }
  }
  for (const g of state?.gates ?? []) raised.set(g.id, g);
  const gates: RunDataGate[] = [...raised.values()].map((g) => {
    const d = decided.get(g.id);
    return {
      id: g.id,
      question: g.question,
      context: g.context,
      recommendation: g.recommendation,
      recommendationReason: g.recommendationReason,
      options: g.options.map((o) => ({ id: o.id, label: o.label, effect: { kind: o.effect.kind, text: o.effect.text } })),
      raisedBy: g.raisedBy,
      trialState: g.trialState,
      ...(d
        ? {
            decided: {
              ...(d.optionId ? { optionId: str(d.optionId) } : {}),
              ...(d.custom ? { custom: str(d.custom) } : {}),
              override: Boolean(d.override),
              unadvised: Boolean(d.unadvised),
              effect: d.effect ?? null,
            },
          }
        : {}),
    };
  });

  const status: Record<string, { status: string; introducedBy?: string }> = {};
  for (const e of events) {
    if (e.type === 'evidence_status') {
      const id = str(e.payload.evidenceId);
      const cur = status[id] ?? { status: 'none' };
      cur.status = str(e.payload.to, cur.status);
      if (cur.status === 'introduced' && !cur.introducedBy) cur.introducedBy = str(e.payload.by) || undefined;
      status[id] = cur;
    }
    if (e.type === 'turn_accepted' && str(obj(e.payload.action).action) === 'present_evidence') {
      const id = str(obj(e.payload.action).targetId);
      status[id] ??= { status: 'introduced', introducedBy: e.actorId };
      status[id].introducedBy ??= e.actorId;
    }
  }
  const evidence: Record<string, RunDataEvidence> = Object.fromEntries(
    world.evidence.map((e) => [
      e.id,
      {
        title: e.title,
        kind: e.kind,
        description: e.description,
        status: status[e.id]?.status ?? 'none',
        ...(status[e.id]?.introducedBy ? { introducedBy: status[e.id].introducedBy } : {}),
        ...(complete ? { integrity: e.integrity } : {}),
      },
    ]),
  );
  const facts: Record<string, RunDataFact> = Object.fromEntries(
    world.facts.map((f) => [
      f.id,
      { statement: f.statement, materiality: f.materiality, publicAtStart: f.publicAtStart, ...(complete ? { truth: f.truth } : {}) },
    ]),
  );

  // The pd_resolved event is the record; pd.json fills in only when the event is missing.
  const pdResolved = events.find((e) => e.type === 'pd_resolved')?.payload ?? pdJson;
  const pd: RunData['pd'] =
    pdResolved && trial.dilemma
      ? {
          participants: trial.dilemma.participants,
          choices: obj(pdResolved.choices),
          payoff: obj(pdResolved.payoff),
          trustChanges: arr<unknown>(pdResolved.trustChanges),
          // Rationales were private at the time; they are part of the reveal.
          ...(complete
            ? {
                rationales: Object.fromEntries(
                  events
                    .filter((e) => e.type === 'pd_choice')
                    .map((e) => [str(e.payload.characterId, e.actorId), str(e.payload.rationaleSummary)]),
                ),
              }
            : {}),
        }
      : undefined;

  const verdictEvent = events.find((e) => e.type === 'verdict');
  const verdictSrc = verdictJson ?? verdictEvent?.payload ?? obj(run.verdict);
  const verdictOpt = trial.verdict.options.find((o) => o.id === str(verdictSrc.optionId));
  const verdict: RunData['verdict'] =
    complete && verdictOpt
      ? {
          optionId: verdictOpt.id,
          label: verdictOpt.label,
          correct: typeof verdictSrc.correct === 'boolean' ? verdictSrc.correct : verdictOpt.correct,
          confidence: typeof verdictSrc.confidence === 'number' ? verdictSrc.confidence : null,
        }
      : undefined;

  const truth: RunData['truth'] = complete
    ? {
        answer: trial.verdict.options.find((o) => o.correct)?.label ?? '',
        summary: world.groundTruth.summary,
        reveal: world.groundTruth.reveal,
        timeline: world.groundTruth.timeline,
        responsibleCharacterIds: world.groundTruth.responsibleCharacterIds,
      }
    : undefined;

  // `correct` on the verdict options is truth; it leaves with the rest of the seal.
  const verdictOptions = trial.verdict.options.map((o) => ({ id: o.id, label: o.label, ...(complete ? { correct: o.correct } : {}) }));
  return {
    run,
    trial: { ...trial, verdict: { question: trial.verdict.question, options: verdictOptions } },
    world: {
      title: world.title,
      logline: world.logline,
      centralQuestion: world.centralQuestion,
      tone: world.tone,
      currency: world.economy.currency,
      maxTurns: trial.maxTurns,
      verdict: { question: trial.verdict.question, options: verdictOptions.map((o) => ({ id: o.id, label: o.label })) },
    },
    cast: world.characters.map((c) => ({ id: c.id, name: c.name, role: c.role, kind: c.kind, category: c.category })),
    facts,
    evidence,
    script,
    gates,
    ...(pd ? { pd } : {}),
    ...(truth ? { truth } : {}),
    ...(verdict ? { verdict } : {}),
    ...(complete && metrics ? { metrics } : {}),
    ledgers: {
      credits: Object.fromEntries(world.characters.map((c) => [c.id, c.credits])),
      ethics: Object.fromEntries(world.characters.map((c) => [c.id, world.ethics.start])),
    },
    pending: pendingOf(state),
    seq: events.at(-1)?.seq ?? 0,
    expectedActor: state?.expectedActor ?? null,
  };
}
