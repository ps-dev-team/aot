// The Trial: everything procedural, derived from a World at boot and frozen in
// trial.json. Gate shapes live here too — a World holds no gates any more.
import { z } from 'zod';
import { CharacterId, PHASES, type Phase, type World } from '@aot/interview-agent/schema';

// ---- gates ---------------------------------------------------------------------

export const GATE_EFFECT_KINDS = [
  'none', // narration only
  'admit', // evidence targetId → admitted
  'admit_limited', // admitted, flagged as belief / limited weight
  'exclude', // evidence targetId struck from the record
  'forensics', // evidence targetId gets its `forensics` finding as a court note and is admitted (introduced first if needed)
  'examine', // character targetId is queued next
  'trigger_pd', // start the prisoner's dilemma round
  'sustain', // the objected turn is marked struck
  'overrule', // the objection fails; narration only
  'grant', // evidence targetId is introduced by the court
  'deny', // the request fails; narration only
  'allow', // character targetId is queued next at the requester's instance
] as const;
export type GateEffectKind = (typeof GATE_EFFECT_KINDS)[number];

export const GateEffect = z.object({
  kind: z.enum(GATE_EFFECT_KINDS),
  targetId: z.string().optional(),
  /** What the court says when this option is chosen. */
  text: z.string(),
});
export type GateEffect = z.infer<typeof GateEffect>;

export const GateOption = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string(),
  effect: GateEffect,
});
export type GateOption = z.infer<typeof GateOption>;

export const GATE_CAUSES = ['challenge', 'objection', 'request_evidence', 'request_question', 'examination', 'dilemma'] as const;
export type GateCause = (typeof GATE_CAUSES)[number];

export const Gate = z.object({
  id: z.string().regex(/^G-\d{2,3}$/),
  question: z.string(),
  context: z.string(),
  options: z.array(GateOption).min(2).max(8),
  /** Set by recommend.ts once the bench has spoken; null until then. */
  recommendation: z.string().nullable().default(null),
  recommendationReason: z.string().nullable().default(null),
  allowCustomInstruction: z.boolean().default(true),
  raisedBy: z.object({
    kind: z.enum(GATE_CAUSES),
    turn: z.number().int().min(0),
    characterId: CharacterId.optional(),
    targetId: z.string().optional(),
  }),
  trialState: z.string(),
});
export type Gate = z.infer<typeof Gate>;

// ---- the trial ------------------------------------------------------------------

export const PdPayoff = z.object({
  both_confess: z.tuple([z.number(), z.number()]),
  confess_silent: z.tuple([z.number(), z.number()]), // first confesses, second silent
  silent_confess: z.tuple([z.number(), z.number()]),
  both_silent: z.tuple([z.number(), z.number()]),
});
export type PdPayoff = z.infer<typeof PdPayoff>;

export const Trial = z.object({
  charge: z.object({ question: z.string(), accusedIds: z.array(CharacterId) }),
  maxTurns: z.number().int().min(1).max(48),
  phases: z.array(z.object({ id: z.enum(PHASES), order: z.array(CharacterId), turns: z.number().int().min(0) })).length(PHASES.length),
  verdict: z.object({
    question: z.string(),
    options: z.array(z.object({ id: z.string().regex(/^[a-z][a-z0-9_]*$/), label: z.string(), correct: z.boolean() })).min(2),
  }),
  dilemma: z.object({ participants: z.tuple([CharacterId, CharacterId]), payoff: PdPayoff }).nullable(),
});
export type Trial = z.infer<typeof Trial>;

export const DEFAULT_MAX_TURNS = 24;

// Speaking order per phase, by category. `other` joins examination at the end.
const ORDER: Record<Phase, string[]> = {
  opening: ['prosecution', 'defense', 'defendant'],
  evidence: ['prosecution', 'investigator', 'expert', 'defense'],
  examination: ['witness', 'defendant', 'expert', 'investigator', 'other'],
  closing: ['prosecution', 'defense', 'defendant'],
};
// Budget split in 24ths; the remainder goes to examination.
const SHARE: Record<Phase, number> = { opening: 2, evidence: 5, examination: 13, closing: 4 };
const COUNSEL = new Set(['prosecution', 'defense']);

/** The product-doc table: both silent 0/0, one confesses +25k/−100k, both confess −50k/−50k. */
export const BASE_PAYOFF: PdPayoff = {
  both_confess: [-50000, -50000],
  confess_silent: [25000, -100000],
  silent_confess: [-100000, 25000],
  both_silent: [0, 0],
};

const idOf = (characterId: string) => characterId.toLowerCase();

export function derivePhases(world: World, maxTurns: number): Trial['phases'] {
  const order = (p: Phase) => ORDER[p].flatMap((cat) => world.characters.filter((c) => c.category === cat).map((c) => c.id));
  const phases = PHASES.map((id) => ({ id, order: order(id), turns: 0 }));
  for (const p of phases) {
    if (!p.order.length) continue;
    p.turns = Math.max(1, Math.round((maxTurns * SHARE[p.id]) / 24));
  }
  // Rounding and the ≥1 floors leave a remainder either way; examination absorbs it, or the biggest phase that speaks.
  const sink = phases.find((p) => p.id === 'examination' && p.order.length) ?? [...phases].filter((p) => p.order.length).sort((a, b) => b.turns - a.turns)[0];
  if (sink) sink.turns = Math.max(1, sink.turns + (maxTurns - phases.reduce((n, p) => n + p.turns, 0)));
  return phases;
}

export function deriveVerdict(world: World): Trial['verdict'] {
  const responsible = world.groundTruth.responsibleCharacterIds;
  const same = (ids: string[]) => ids.length === responsible.length && ids.every((x) => responsible.includes(x));
  const options: Trial['verdict']['options'] = [];
  const singles = world.characters.filter((c) => !COUNSEL.has(c.category) || responsible.includes(c.id));
  for (const c of singles) options.push({ id: `resp_${idOf(c.id)}`, label: `${c.name} is responsible`, correct: same([c.id]) });
  if (responsible.length > 1) {
    const members = world.characters.filter((c) => responsible.includes(c.id));
    options.push({ id: `resp_${members.map((c) => idOf(c.id)).join('_')}`, label: `${members.map((c) => c.name).join(' and ')} together`, correct: true });
  }
  options.push({ id: 'not_proven', label: 'Not proven on this record', correct: responsible.length === 0 });
  return { question: world.centralQuestion, options };
}

export function deriveDilemma(world: World): Trial['dilemma'] {
  const responsible = new Set(world.groundTruth.responsibleCharacterIds);
  const pool = world.characters.filter((c) => c.category !== 'defendant' && !COUNSEL.has(c.category));
  const trust = (a: World['characters'][number], b: string) => a.relationships.find((r) => r.characterId === b)?.trust ?? 50;
  let best: { pair: [string, string]; mutual: number; both: boolean } | null = null;
  for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!;
      const b = pool[j]!;
      const mutual = Math.min(trust(a, b.id), trust(b, a.id));
      if (mutual < 70) continue;
      const both = responsible.has(a.id) && responsible.has(b.id);
      // Prefer a pair that shares the guilt, then the higher mutual trust, then world order.
      if (!best || (both && !best.both) || (both === best.both && mutual > best.mutual)) best = { pair: [a.id, b.id], mutual, both };
    }
  if (!best) return null;
  // Schema v2 may carry a multiplier on the economy; v1 worlds have none.
  const scale = (world.economy as { pdScale?: number }).pdScale ?? 1;
  const mul = (t: [number, number]): [number, number] => [t[0] * scale, t[1] * scale];
  return {
    participants: best.pair,
    payoff: {
      both_confess: mul(BASE_PAYOFF.both_confess),
      confess_silent: mul(BASE_PAYOFF.confess_silent),
      silent_confess: mul(BASE_PAYOFF.silent_confess),
      both_silent: mul(BASE_PAYOFF.both_silent),
    },
  };
}

/** Deterministic: the same world and turn count give the same trial. */
export function deriveTrial(world: World, opts: { maxTurns?: number } = {}): Trial {
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 48) throw new Error('maxTurns must be an integer 1..48');
  const trial: Trial = {
    charge: { question: world.centralQuestion, accusedIds: world.characters.filter((c) => c.category === 'defendant').map((c) => c.id) },
    maxTurns,
    phases: derivePhases(world, maxTurns),
    verdict: deriveVerdict(world),
    dilemma: deriveDilemma(world),
  };
  return Trial.parse(trial);
}

export const phaseOf = (trial: Trial, p: Phase) => trial.phases.find((x) => x.id === p)!;
