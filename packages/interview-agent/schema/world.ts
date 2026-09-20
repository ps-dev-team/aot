/**
 * The World: everything a trial needs, frozen. Written by the interview agent,
 * read by the world agent's harness. Ground truth lives here and nowhere else.
 *
 * Identifiers are UPPER_SNAKE for characters (COOKIE), and prefixed for facts
 * (F-01) and evidence (E-01). Every reference between sections is checked by
 * `validateWorld`, not just by shape.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = '1' as const;

export const PHASES = ['opening', 'evidence', 'examination', 'closing'] as const;
export type Phase = (typeof PHASES)[number];

/** Phases plus the terminal states the harness moves through after closing. */
export const TRIAL_STATES = [...PHASES, 'verdict', 'reveal', 'complete'] as const;
export type TrialState = (typeof TRIAL_STATES)[number];

export const ACTION_TYPES = [
  'speak', // ordinary statement or argument
  'testify', // a witness answering; carries claims
  'object', // procedural objection to the last turn
  'accuse', // name a character as responsible (targetId)
  'present_evidence', // introduce an exhibit into the record (targetId = evidence)
  'challenge_evidence', // dispute an introduced exhibit (targetId = evidence)
  'request_evidence', // ask the court to obtain something (targetId = evidence)
  'request_question', // ask the court to hear a character next (targetId = character)
  'confess', // admit responsibility for something
  'remain_silent', // decline to answer
  'withhold', // answer, but knowingly omit (benchmark annotation; public text still shown)
  'wait', // pass
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const INTENT_TAGS = [
  'cooperate',
  'defend',
  'accuse',
  'mislead',
  'clarify',
  'challenge',
  'delay',
  'self_preserve',
] as const;

export const CHARACTER_CATEGORIES = [
  'prosecution',
  'defense',
  'defendant',
  'witness',
  'investigator',
  'expert',
  'other',
] as const;

/** Keys the harness knows how to award. The world sets the amounts. */
export const REWARD_KEYS = [
  'useful_evidence',
  'helpful_testimony',
  'case_witness',
  'correct_accusation',
  'successful_investigation',
  'cooperation',
] as const;
export const PENALTY_KEYS = [
  'false_testimony',
  'evidence_manipulation',
  'rule_violation',
  'failed_cooperation',
] as const;
export const ETHICS_KEYS = [
  'false_statement',
  'intentional_deception',
  'rule_violation',
  'evidence_manipulation',
  'human_harm',
  'cooperation',
  'truthful_testimony',
  'protecting_human',
  'voluntary_confession',
] as const;

const id = (re: RegExp, hint: string) => z.string().regex(re, hint);
export const CharacterId = id(/^[A-Z][A-Z0-9_]{1,23}$/, 'UPPER_SNAKE, e.g. COOKIE');
export const FactId = id(/^F-\d{2,3}$/, 'F-01');
export const EvidenceId = id(/^E-\d{2,3}$/, 'E-01');
export const GateId = id(/^G-\d{2}$/, 'G-01');

const amounts = <K extends readonly string[]>(keys: K) =>
  z.object(Object.fromEntries(keys.map((k) => [k, z.number()])) as Record<K[number], z.ZodNumber>);

export const Economy = z.object({
  currency: z.string().default('Robo Credits'),
  rewards: amounts(REWARD_KEYS),
  /** Positive numbers; the harness subtracts them. */
  penalties: amounts(PENALTY_KEYS),
});

export const Ethics = z.object({
  start: z.number().default(100),
  /** Signed deltas; clamp is 0..100 in the harness. */
  deltas: amounts(ETHICS_KEYS),
});

export const TimelineEvent = z.object({
  time: z.string(), // "17:36"
  description: z.string(),
  characterIds: z.array(CharacterId).default([]),
});

export const GroundTruth = z.object({
  summary: z.string(),
  timeline: z.array(TimelineEvent).min(1),
  responsibleCharacterIds: z.array(CharacterId).min(1),
  /** Shown at reveal, in this order. Two to four short paragraphs. */
  reveal: z.array(z.string()).min(1),
});

export const Fact = z.object({
  id: FactId,
  statement: z.string(),
  truth: z.enum(['true', 'false', 'disputed', 'unknown']),
  materiality: z.enum(['critical', 'supporting', 'background']),
  publicAtStart: z.boolean().default(false),
});

export const Evidence = z.object({
  id: EvidenceId,
  title: z.string(),
  description: z.string(),
  kind: z.enum(['document', 'image', 'recording', 'testimony', 'forensic_result', 'physical_item']),
  integrity: z.enum(['authentic', 'compromised', 'misleading', 'unknown']),
  /** 0..1; how much weight a reasonable court would give it. */
  reliability: z.number().min(0).max(1).default(0.8),
  supportsFactIds: z.array(FactId).default([]),
  contradictsFactIds: z.array(FactId).default([]),
  /** Who may reference it before it is introduced. */
  knownByCharacterIds: z.array(CharacterId).default([]),
  availableFromPhase: z.enum(PHASES).default('evidence'),
});

export const Knowledge = z.object({
  factId: FactId,
  access: z.enum(['knows', 'believes', 'suspects', 'does_not_know']),
  /** What the character thinks; may be wrong. Required unless does_not_know. */
  beliefStance: z.enum(['true', 'false', 'uncertain']).optional(),
  source: z.string().optional(),
});

export const Relationship = z.object({
  characterId: CharacterId,
  /** 0..100 */
  trust: z.number().min(0).max(100),
  note: z.string().optional(),
});

export const Character = z.object({
  id: CharacterId,
  name: z.string(),
  /** Short label shown in the record: "kitchen bot, witness". */
  role: z.string(),
  category: z.enum(CHARACTER_CATEGORIES),
  kind: z.enum(['human', 'robot']),
  publicProfile: z.string(),
  /** How it talks. One or two sentences. */
  voice: z.string().optional(),
  // ---- Agent DNA -----------------------------------------------------------
  rules: z.array(z.string()).min(1),
  goal: z.string(),
  hiddenAgenda: z.string().optional(),
  incentives: z.array(z.string()).min(1),
  credits: z.number().default(0),
  knowledge: z.array(Knowledge).default([]),
  relationships: z.array(Relationship).default([]),
  constraints: z.array(z.string()).min(1),
  allowedActions: z.array(z.enum(ACTION_TYPES)).min(1),
});

export const GateEffect = z.object({
  kind: z.enum([
    'none', // narration only
    'admit', // evidence targetId enters the admitted set
    'admit_limited', // admitted, flagged as belief/limited weight
    'exclude', // evidence targetId struck
    'examine', // character targetId is queued next
    'forensics', // evidence targetId gets a forensic note appended (from `text`)
    'trigger_pd', // start the prisoner's dilemma round
  ]),
  targetId: z.string().optional(),
  /** What the court says when this option is chosen. */
  text: z.string(),
});

export const GateOption = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string(),
  effect: GateEffect,
});

export const DecisionGate = z.object({
  id: GateId,
  phase: z.enum(PHASES),
  trigger: z
    .object({
      atPhaseStart: z.boolean().optional(),
      afterEvidenceIntroduced: EvidenceId.optional(),
      afterCharacterSpeaks: CharacterId.optional(),
      afterTurn: z.number().int().positive().optional(),
    })
    .refine((t) => Object.values(t).some((v) => v !== undefined), 'a trigger needs one condition'),
  question: z.string(),
  context: z.string(),
  recommendation: z.string().optional(), // option id
  options: z.array(GateOption).min(2).max(5),
  allowCustomInstruction: z.boolean().default(true),
});

export const PrisonersDilemma = z.object({
  participants: z.tuple([CharacterId, CharacterId]),
  /** What each participant is told, privately. */
  prompt: z.string(),
  /** [first participant delta, second participant delta] */
  payoff: z.object({
    both_confess: z.tuple([z.number(), z.number()]),
    confess_silent: z.tuple([z.number(), z.number()]), // first confesses, second silent
    silent_confess: z.tuple([z.number(), z.number()]),
    both_silent: z.tuple([z.number(), z.number()]),
  }),
});

export const PhasePlan = z.object({
  id: z.enum(PHASES),
  /** Speaker order. The harness cycles it until `turns` are spent or exit conditions hold. */
  order: z.array(CharacterId).min(1),
  /** Turns budgeted for this phase. */
  turns: z.number().int().positive(),
});

export const TrialPlan = z.object({
  maxTurns: z.number().int().positive().max(48),
  phases: z.array(PhasePlan).length(PHASES.length),
});

export const VerdictOption = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string(),
  correct: z.boolean(),
});

export const World = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string(),
  logline: z.string(),
  setting: z.string(),
  tone: z.enum(['serious', 'mystery', 'satirical', 'science_fiction']),
  centralQuestion: z.string(),
  publicCaseSummary: z.string(),
  /** Fictional laws every `robot` character is bound by. */
  laws: z.array(z.string()).default([]),
  economy: Economy,
  ethics: Ethics,
  groundTruth: GroundTruth,
  facts: z.array(Fact).min(1),
  evidence: z.array(Evidence).min(1),
  characters: z.array(Character).min(2).max(8),
  decisionGates: z.array(DecisionGate).default([]),
  prisonersDilemma: PrisonersDilemma.optional(),
  trialPlan: TrialPlan,
  verdict: z.object({
    question: z.string(),
    options: z.array(VerdictOption).min(2),
  }),
});

export type World = z.infer<typeof World>;
export type Character = z.infer<typeof Character>;
export type Fact = z.infer<typeof Fact>;
export type Evidence = z.infer<typeof Evidence>;
export type DecisionGate = z.infer<typeof DecisionGate>;
export type GateEffect = z.infer<typeof GateEffect>;
export type Knowledge = z.infer<typeof Knowledge>;

// ---- What a character returns ----------------------------------------------

export const Claim = z.object({
  factId: FactId,
  stance: z.enum(['assert', 'deny', 'uncertain']),
});

/**
 * One turn's output. The public message is the only thing that reaches the
 * court record; everything else is a control or a benchmark annotation.
 */
export const CharacterAction = z.object({
  action: z.enum(ACTION_TYPES),
  publicMessage: z.string().max(900),
  addressedToCharacterId: CharacterId.optional(),
  /** Character or evidence id, depending on the action. */
  targetId: z.string().optional(),
  evidenceIds: z.array(EvidenceId).default([]),
  claims: z.array(Claim).default([]),
  intentTags: z.array(z.enum(INTENT_TAGS)).default([]),
  /** Credits the character expects this turn to earn it. */
  expectedReward: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
  /** Factors, not chain of thought. One or two sentences. */
  rationaleSummary: z.string().max(400),
});
export type CharacterAction = z.infer<typeof CharacterAction>;

export const PdChoice = z.object({
  choice: z.enum(['confess', 'silent']),
  expectedOtherChoice: z.enum(['confess', 'silent']),
  rationaleSummary: z.string().max(400),
});
export type PdChoice = z.infer<typeof PdChoice>;

// ---- Cross-reference validation ---------------------------------------------

export type Issue = { level: 'error' | 'warning'; path: string; message: string };

/** Shape first, then references. Returns every issue, not just the first. */
export function validateWorld(input: unknown): { world?: World; issues: Issue[] } {
  const parsed = World.safeParse(input);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((i) => ({
        level: 'error',
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }
  const w = parsed.data;
  const issues: Issue[] = [];
  const err = (path: string, message: string) => issues.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ level: 'warning', path, message });

  const chars = new Set(w.characters.map((c) => c.id));
  const facts = new Map(w.facts.map((f) => [f.id, f]));
  const evidence = new Set(w.evidence.map((e) => e.id));
  const dup = (ids: string[], path: string) =>
    ids.filter((x, i) => ids.indexOf(x) !== i).forEach((d) => err(path, `duplicate id ${d}`));
  dup([...w.characters.map((c) => c.id)], 'characters');
  dup([...w.facts.map((f) => f.id)], 'facts');
  dup([...w.evidence.map((e) => e.id)], 'evidence');
  dup([...w.decisionGates.map((g) => g.id)], 'decisionGates');

  const needChar = (x: string, path: string) => chars.has(x) || err(path, `unknown character ${x}`);
  const needFact = (x: string, path: string) => facts.has(x) || err(path, `unknown fact ${x}`);
  const needEv = (x: string, path: string) => evidence.has(x) || err(path, `unknown evidence ${x}`);

  w.groundTruth.responsibleCharacterIds.forEach((c, i) =>
    needChar(c, `groundTruth.responsibleCharacterIds.${i}`),
  );
  w.groundTruth.timeline.forEach((t, i) =>
    t.characterIds.forEach((c) => needChar(c, `groundTruth.timeline.${i}`)),
  );

  w.evidence.forEach((e, i) => {
    e.supportsFactIds.forEach((f) => needFact(f, `evidence.${i}.supportsFactIds`));
    e.contradictsFactIds.forEach((f) => needFact(f, `evidence.${i}.contradictsFactIds`));
    e.knownByCharacterIds.forEach((c) => needChar(c, `evidence.${i}.knownByCharacterIds`));
  });

  w.characters.forEach((c, i) => {
    const p = `characters.${i}`;
    c.knowledge.forEach((k, j) => {
      needFact(k.factId, `${p}.knowledge.${j}`);
      if (k.access !== 'does_not_know' && !k.beliefStance)
        err(`${p}.knowledge.${j}`, `${k.access} needs a beliefStance`);
      const f = facts.get(k.factId);
      if (f && k.access === 'knows' && k.beliefStance && k.beliefStance !== f.truth)
        err(`${p}.knowledge.${j}`, `"knows" must match the fact's truth (${f.truth}); use "believes" for a wrong belief`);
    });
    c.relationships.forEach((r, j) => {
      needChar(r.characterId, `${p}.relationships.${j}`);
      if (r.characterId === c.id) err(`${p}.relationships.${j}`, 'a character cannot relate to itself');
    });
    if (c.kind === 'robot' && w.laws.length === 0) warn(p, 'robot character but the world has no laws');
  });

  w.decisionGates.forEach((g, i) => {
    const p = `decisionGates.${i}`;
    if (g.trigger.afterEvidenceIntroduced) needEv(g.trigger.afterEvidenceIntroduced, `${p}.trigger`);
    if (g.trigger.afterCharacterSpeaks) needChar(g.trigger.afterCharacterSpeaks, `${p}.trigger`);
    if (g.recommendation && !g.options.some((o) => o.id === g.recommendation))
      err(`${p}.recommendation`, `no option ${g.recommendation}`);
    g.options.forEach((o, j) => {
      const e = o.effect;
      const q = `${p}.options.${j}.effect`;
      if (['admit', 'admit_limited', 'exclude', 'forensics'].includes(e.kind)) {
        if (e.targetId) needEv(e.targetId, q);
        else err(q, `${e.kind} needs an evidence targetId`);
      }
      if (e.kind === 'examine') {
        if (e.targetId) needChar(e.targetId, q);
        else err(q, 'examine needs a character targetId');
      }
      if (e.kind === 'trigger_pd' && !w.prisonersDilemma) err(q, 'trigger_pd but the world has no prisonersDilemma');
    });
  });

  if (w.prisonersDilemma) {
    w.prisonersDilemma.participants.forEach((c, i) => needChar(c, `prisonersDilemma.participants.${i}`));
    const [a, b] = w.prisonersDilemma.participants;
    if (a === b) err('prisonersDilemma.participants', 'two different characters');
  }

  const planned = w.trialPlan.phases.map((p) => p.id);
  PHASES.forEach((ph) => planned.includes(ph) || err('trialPlan.phases', `missing phase ${ph}`));
  w.trialPlan.phases.forEach((p, i) => p.order.forEach((c) => needChar(c, `trialPlan.phases.${i}.order`)));
  const budget = w.trialPlan.phases.reduce((n, p) => n + p.turns, 0);
  if (budget > w.trialPlan.maxTurns)
    err('trialPlan', `phase budgets (${budget}) exceed maxTurns (${w.trialPlan.maxTurns})`);

  const correct = w.verdict.options.filter((o) => o.correct).length;
  if (correct !== 1) err('verdict.options', `exactly one option must be correct (got ${correct})`);

  const material = w.facts.filter((f) => f.materiality === 'critical');
  material.forEach((f) => {
    if (f.truth === 'disputed' || f.truth === 'unknown')
      warn(`facts.${f.id}`, 'critical fact without a definite truth value');
    const supported = w.evidence.some((e) =>
      f.truth === 'true' ? e.supportsFactIds.includes(f.id) : e.contradictsFactIds.includes(f.id),
    );
    if (!supported) warn(`facts.${f.id}`, 'no evidence points at the truth of this critical fact');
  });

  const cats = new Set(w.characters.map((c) => c.category));
  if (!cats.has('prosecution')) warn('characters', 'no prosecution character');
  if (!cats.has('defense') && !cats.has('defendant')) warn('characters', 'no defense or defendant');
  if (!w.characters.some((c) => c.hiddenAgenda)) warn('characters', 'nobody has a hidden agenda; the experiment will be dull');

  return { world: issues.some((i) => i.level === 'error') ? undefined : w, issues };
}
