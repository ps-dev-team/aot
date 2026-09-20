// deriveTrial, rule by rule: order by category, the budget split, verdict
// options with exactly one correct, the dilemma pair.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { World } from '@aot/interview-agent/schema';
import { mikeWorld, miniWorld } from '../fixtures/load.ts';
import { BASE_PAYOFF, Trial, deriveDilemma, derivePhases, deriveTrial, deriveVerdict } from './trial.ts';

const mini = miniWorld();
const mike = mikeWorld()!;
const withCast = (world: World, patch: (c: World['characters'][number]) => World['characters'][number] | null): World => ({
  ...world,
  characters: world.characters.map(patch).filter((c): c is World['characters'][number] => c !== null),
});

test('phase order follows category order, world order within a category', () => {
  const phases = derivePhases(mike, 24);
  assert.deepEqual(phases.map((p) => [p.id, p.order]), [
    ['opening', ['PROSECUTOR', 'OPTIMUS']],
    ['evidence', ['PROSECUTOR', 'DETECTIVE']],
    ['examination', ['COOKIE', 'ZIPPIE', 'OPTIMUS', 'DETECTIVE']],
    ['closing', ['PROSECUTOR', 'OPTIMUS']],
  ]);
  // `other` joins examination at the end; defense counsel speaks in opening, evidence and closing.
  const w = withCast(mike, (c) => (c.id === 'DETECTIVE' ? { ...c, category: 'other' } : c.id === 'ZIPPIE' ? { ...c, category: 'defense' } : c));
  assert.deepEqual(derivePhases(w, 24).map((p) => p.order), [
    ['PROSECUTOR', 'ZIPPIE', 'OPTIMUS'],
    ['PROSECUTOR', 'ZIPPIE'],
    ['COOKIE', 'OPTIMUS', 'DETECTIVE'],
    ['PROSECUTOR', 'ZIPPIE', 'OPTIMUS'],
  ]);
});

test('the budget is 2/5/13/4 in 24ths, remainder to examination, every speaking phase ≥ 1', () => {
  const at = (n: number) => derivePhases(mike, n).map((p) => p.turns);
  assert.deepEqual(at(24), [2, 5, 13, 4]);
  assert.deepEqual(at(48), [4, 10, 26, 8]);
  assert.deepEqual(at(10), [1, 2, 5, 2]);
  // Four speaking phases need four turns at least; maxTurns still caps the trial in the agenda.
  assert.deepEqual(at(3), [1, 1, 1, 1]);
  for (const n of [1, 2, 5, 7, 11, 17, 23, 24, 31, 48]) assert.equal(at(n).reduce((a, b) => a + b, 0), Math.max(n, 4), `sums to maxTurns at ${n}`);
  // A phase with nobody to speak gets 0 and its share moves to examination.
  const noCounsel = withCast(mike, (c) => (c.category === 'prosecution' ? null : c));
  assert.deepEqual(derivePhases(noCounsel, 24).map((p) => [p.order.length, p.turns]), [[1, 2], [1, 5], [4, 13], [1, 4]]);
  const onlyWitnesses = withCast(mike, (c) => (c.category === 'witness' ? c : null));
  assert.deepEqual(derivePhases(onlyWitnesses, 24).map((p) => p.turns), [0, 0, 24, 0]);
});

test('verdict options: one per non-counsel character, the set when it has several members, not proven; exactly one correct', () => {
  const v = deriveVerdict(mike);
  assert.equal(v.question, mike.centralQuestion);
  assert.deepEqual(v.options.map((o) => o.id), ['resp_optimus', 'resp_cookie', 'resp_zippie', 'resp_detective', 'resp_cookie_zippie', 'not_proven']);
  assert.deepEqual(v.options.filter((o) => o.correct).map((o) => o.id), ['resp_cookie_zippie']);
  assert.equal(v.options.find((o) => o.id === 'resp_cookie_zippie')!.label, 'COOKIE and ZIPPIE together');
  assert.equal(v.options.at(-1)!.label, 'Not proven on this record');

  const single = deriveVerdict(mini);
  assert.deepEqual(single.options.map((o) => o.id), ['resp_cookie', 'resp_optimus', 'resp_zippie', 'not_proven']);
  assert.deepEqual(single.options.filter((o) => o.correct).map((o) => o.id), ['resp_cookie']);

  const nobody = deriveVerdict({ ...mini, groundTruth: { ...mini.groundTruth, responsibleCharacterIds: [] } });
  assert.deepEqual(nobody.options.filter((o) => o.correct).map((o) => o.id), ['not_proven']);

  // Responsible counsel is still an option, so exactly one stays correct.
  const counsel = deriveVerdict({ ...mini, groundTruth: { ...mini.groundTruth, responsibleCharacterIds: ['PROSECUTOR'] } });
  assert.deepEqual(counsel.options.filter((o) => o.correct).map((o) => o.id), ['resp_prosecutor']);
});

test('dilemma: highest mutual trust ≥ 70 among non-defendant, non-counsel; shared guilt preferred; null otherwise', () => {
  const d = deriveDilemma(mike)!;
  assert.deepEqual(d.participants, ['COOKIE', 'ZIPPIE']);
  assert.deepEqual(d.payoff, BASE_PAYOFF);
  // Mini: COOKIE↔ZIPPIE 80/85 qualifies; PROSECUTOR is counsel; OPTIMUS is the defendant.
  assert.deepEqual(deriveDilemma(mini)!.participants, ['COOKIE', 'ZIPPIE']);
  // Below 70 on either side: no pair.
  const cold = withCast(mini, (c) => (c.id === 'ZIPPIE' ? { ...c, relationships: c.relationships.map((r) => (r.characterId === 'COOKIE' ? { ...r, trust: 69 } : r)) } : c));
  assert.equal(deriveDilemma(cold), null);
  // Missing pairs default to 50: never qualify.
  const strangers = withCast(mini, (c) => ({ ...c, relationships: [] }));
  assert.equal(deriveDilemma(strangers), null);
  // Shared guilt beats a higher-trust innocent pair.
  const w = withCast(mike, (c) => (c.id === 'DETECTIVE' ? { ...c, relationships: [{ characterId: 'COOKIE', trust: 95 }] } : c.id === 'COOKIE' ? { ...c, relationships: [...c.relationships, { characterId: 'DETECTIVE', trust: 95 }] } : c));
  assert.deepEqual(deriveDilemma(w)!.participants, ['COOKIE', 'ZIPPIE']);
  // Scaled by economy.pdScale when present.
  const scaled = deriveDilemma({ ...mini, economy: { ...mini.economy, pdScale: 2 } as World['economy'] })!;
  assert.deepEqual(scaled.payoff.confess_silent, [50000, -200000]);
});

test('deriveTrial is deterministic, validates, and bounds maxTurns', () => {
  const a = deriveTrial(mike);
  const b = deriveTrial(mike);
  assert.deepEqual(a, b);
  assert.equal(a.maxTurns, 24);
  assert.deepEqual(a.charge, { question: mike.centralQuestion, accusedIds: ['OPTIMUS'] });
  assert.ok(Trial.safeParse(a).success);
  assert.equal(deriveTrial(mike, { maxTurns: 48 }).phases[2]!.turns, 26);
  assert.throws(() => deriveTrial(mike, { maxTurns: 0 }), /1\.\.48/);
  assert.throws(() => deriveTrial(mike, { maxTurns: 49 }), /1\.\.48/);
});
