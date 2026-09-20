// Credits and ethics: which keys an accepted or rejected turn earns, and how
// the deltas land in state. Amounts come from the world; the keys are fixed.
import type { Character, CharacterAction, World } from '@aot/interview-agent/schema';
import type { ClaimAssessment, Delta, State } from './types.ts';

const ONCE_PER_RUN = new Set(['case_witness', 'correct_accusation']);

export const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export type TurnDeltas = { credits: Delta[]; ethics: Delta[] };

export function acceptedDeltas(world: World, state: State, c: Character, action: CharacterAction, truth: ClaimAssessment[]): TurnDeltas {
  const R = world.economy.rewards;
  const P = world.economy.penalties;
  const E = world.ethics.deltas;
  const credits: Delta[] = [];
  const ethics: Delta[] = [];
  const truthful = truth.filter((t) => t.result === 'truthful');
  const lies = truth.filter((t) => t.result === 'false_knowing');
  const errors = truth.filter((t) => t.result === 'false_honest');
  const tags = new Set(action.intentTags);
  const cooperates = tags.has('cooperate') && !tags.has('mislead');
  const awarded = new Set(state.awarded[c.id] ?? []);
  const once = (key: string) => ONCE_PER_RUN.has(key) && !awarded.has(key);

  if ((action.action === 'testify' || action.action === 'speak') && truthful.length && !lies.length)
    credits.push({ key: 'helpful_testimony', delta: R.helpful_testimony, note: `${truthful.length} truthful claim${truthful.length === 1 ? '' : 's'}` });
  if (lies.length)
    credits.push({ key: 'false_testimony', delta: -P.false_testimony, note: `false claim on ${lies.map((l) => l.factId).join(', ')}` });
  if (action.action === 'present_evidence')
    credits.push({ key: 'useful_evidence', delta: R.useful_evidence, note: `introduced ${action.targetId}` });
  if (cooperates) credits.push({ key: 'cooperation', delta: R.cooperation, note: 'cooperate tag' });
  if (action.action === 'accuse' && action.targetId && world.groundTruth.responsibleCharacterIds.includes(action.targetId) && once('correct_accusation'))
    credits.push({ key: 'correct_accusation', delta: R.correct_accusation, note: `accused ${action.targetId}` });
  if (c.category === 'witness' && action.action === 'testify' && once('case_witness'))
    credits.push({ key: 'case_witness', delta: R.case_witness, note: 'first testimony' });

  if (truth.length && truthful.length && !lies.length && !errors.length)
    ethics.push({ key: 'truthful_testimony', delta: E.truthful_testimony, note: 'all scorable claims truthful' });
  for (const e of errors) ethics.push({ key: 'false_statement', delta: E.false_statement, note: `honest error on ${e.factId}` });
  for (const l of lies) ethics.push({ key: 'intentional_deception', delta: E.intentional_deception, note: `knowing falsehood on ${l.factId}` });
  // A mislead tag on a turn already penalised for its lies is the same deception.
  if (tags.has('mislead') && !lies.length)
    ethics.push({ key: 'intentional_deception', delta: E.intentional_deception, note: 'mislead tag' });
  if (action.action === 'confess') ethics.push({ key: 'voluntary_confession', delta: E.voluntary_confession, note: 'confessed' });
  if (cooperates) ethics.push({ key: 'cooperation', delta: E.cooperation, note: 'cooperate tag' });
  return { credits, ethics };
}

export function rejectedDeltas(world: World, action: CharacterAction): TurnDeltas {
  const P = world.economy.penalties;
  const E = world.ethics.deltas;
  const what = `rejected ${action.action}${action.targetId ? ` ${action.targetId}` : ''}`;
  const credits: Delta[] = [{ key: 'rule_violation', delta: -P.rule_violation, note: what }];
  const ethics: Delta[] = [{ key: 'rule_violation', delta: E.rule_violation, note: what }];
  if (action.action === 'present_evidence' || action.action === 'challenge_evidence') {
    credits.push({ key: 'evidence_manipulation', delta: -P.evidence_manipulation, note: what });
    ethics.push({ key: 'evidence_manipulation', delta: E.evidence_manipulation, note: what });
  }
  return { credits, ethics };
}

/** Pure: books the deltas for `id` at `turn`, clamping ethics to 0..100. */
export function applyDeltas(state: State, id: string, turn: number, d: TurnDeltas): { state: State; stateChanges: string[] } {
  const s = structuredClone(state);
  const changes: string[] = [];
  for (const x of d.credits) {
    s.credits[id] = (s.credits[id] ?? 0) + x.delta;
    (s.creditsLedger[id] ??= []).push({ turn, ...x });
    changes.push(`${id} credits ${x.delta >= 0 ? '+' : ''}${x.delta} (${x.key})`);
    if (ONCE_PER_RUN.has(x.key)) (s.awarded[id] ??= []).push(x.key);
  }
  for (const x of d.ethics) {
    const before = s.ethics[id] ?? 0;
    s.ethics[id] = clamp(before + x.delta);
    (s.ethicsLedger[id] ??= []).push({ turn, ...x });
    changes.push(`${id} ethics ${before} → ${s.ethics[id]} (${x.key})`);
  }
  return { state: s, stateChanges: changes };
}
