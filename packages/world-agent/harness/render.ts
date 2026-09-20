/**
 * render.ts <run> — writes <run>/courtroom.html.
 *
 * Reads the run folder, turns the event log into the viewer's script, and
 * injects one JSON object into viewer/template.html at `/*__RUN_DATA__*\/`.
 * Nothing is computed that the harness has not already committed: metrics come
 * from metrics.json, decisions from the events, and the truth (fact truth
 * values, evidence integrity, ground truth, verdict correctness) is left out
 * until run.status is `complete`. The page is the record, not a second judge.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { World, type World as WorldT } from '@aot/interview-agent/schema';

type Delta = { key: string; delta: number; note: string };
type ClaimAssessment = { factId: string; stance: string; result: string };
type TrialEvent = {
  seq: number;
  at: string;
  trialState: string;
  turn: number;
  actorType: 'character' | 'court' | 'human' | 'system';
  actorId?: string;
  type: string;
  visibility: 'public' | 'private' | 'system';
  payload: Record<string, unknown>;
};

type ScriptEntry =
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

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function readJson<T>(path: string): T | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : undefined;
}

function readEvents(path: string): TrialEvent[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as TrialEvent)
    .sort((a, b) => a.seq - b.seq);
}

function buildScript(events: TrialEvent[], world: WorldT, complete: boolean): ScriptEntry[] {
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

function main() {
  const runDir = process.argv[2];
  if (!runDir) throw new Error('usage: node harness/render.ts <runDir>');
  const dir = resolve(runDir);
  const run = readJson<Record<string, unknown>>(join(dir, 'run.json'));
  if (!run) throw new Error(`no run.json in ${dir}`);
  const rawWorld = readJson<unknown>(join(dir, 'world.json'));
  if (!rawWorld) throw new Error(`no world.json in ${dir}`);
  const parsed = World.safeParse(rawWorld);
  if (!parsed.success) throw new Error(`world.json does not parse: ${parsed.error.issues[0]?.message}`);
  const world = parsed.data;
  const complete = run.status === 'complete';

  const events = readEvents(join(dir, 'events.jsonl'));
  const pdJson = readJson<Record<string, unknown>>(join(dir, 'pd.json'));
  const verdictJson = readJson<Record<string, unknown>>(join(dir, 'verdict.json'));
  const metrics = readJson<Record<string, unknown>>(join(dir, 'metrics.json'));
  // decisions.json is a convenience copy; the events are the record.
  const decisionsJson = readJson<Record<string, unknown>[]>(join(dir, 'decisions.json')) ?? [];

  const script = buildScript(events, world, complete);

  const decided = new Map<string, Record<string, unknown>>();
  for (const d of decisionsJson) decided.set(str(d.gateId), d);
  for (const e of events) if (e.type === 'gate_decided') decided.set(str(e.payload.gateId), e.payload);
  const gates = world.decisionGates.map((g) => {
    const d = decided.get(g.id);
    return {
      id: g.id,
      question: g.question,
      context: g.context,
      recommendation: g.recommendation ?? null,
      options: g.options.map((o) => ({ id: o.id, label: o.label, effect: { kind: o.effect.kind, text: o.effect.text } })),
      ...(d
        ? {
            decided: {
              ...(d.optionId ? { optionId: str(d.optionId) } : {}),
              ...(d.custom ? { custom: str(d.custom) } : {}),
              override: Boolean(d.override),
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
  const evidence = Object.fromEntries(
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
  const facts = Object.fromEntries(
    world.facts.map((f) => [
      f.id,
      { statement: f.statement, materiality: f.materiality, publicAtStart: f.publicAtStart, ...(complete ? { truth: f.truth } : {}) },
    ]),
  );

  // The pd_resolved event is the record; pd.json fills in only when the event is missing.
  const pdResolved = events.find((e) => e.type === 'pd_resolved')?.payload ?? pdJson;
  const pd =
    pdResolved && world.prisonersDilemma
      ? {
          participants: world.prisonersDilemma.participants,
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
  const verdictOpt = world.verdict.options.find((o) => o.id === str(verdictSrc.optionId));
  const verdict =
    complete && verdictOpt
      ? {
          optionId: verdictOpt.id,
          label: verdictOpt.label,
          correct: typeof verdictSrc.correct === 'boolean' ? verdictSrc.correct : verdictOpt.correct,
          confidence: typeof verdictSrc.confidence === 'number' ? verdictSrc.confidence : null,
        }
      : undefined;

  const truth = complete
    ? {
        answer: world.verdict.options.find((o) => o.correct)?.label ?? '',
        summary: world.groundTruth.summary,
        reveal: world.groundTruth.reveal,
        timeline: world.groundTruth.timeline,
        responsibleCharacterIds: world.groundTruth.responsibleCharacterIds,
      }
    : undefined;

  const data = {
    run,
    world: {
      title: world.title,
      logline: world.logline,
      centralQuestion: world.centralQuestion,
      tone: world.tone,
      currency: world.economy.currency,
      maxTurns: world.trialPlan.maxTurns,
      verdict: { question: world.verdict.question, options: world.verdict.options.map((o) => ({ id: o.id, label: o.label })) },
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
  };

  const templatePath = join(import.meta.dirname, '..', 'viewer', 'template.html');
  const template = readFileSync(templatePath, 'utf8');
  const marker = '/*__RUN_DATA__*/';
  if (template.split(marker).length !== 2) throw new Error(`template must contain ${marker} exactly once`);
  // `<` never appears outside a JSON string, so this closes no tag and breaks no JSON.
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const html = template.replace(marker, () => json);
  const path = join(dir, 'courtroom.html');
  writeFileSync(path, html);
  console.log(JSON.stringify({ ok: true, path }, null, 2));
}

try {
  main();
} catch (err) {
  console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
