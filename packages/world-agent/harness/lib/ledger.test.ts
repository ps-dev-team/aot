// Ledger deltas for the four turns the contract calls out, and the clamp.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { action, miniTrial, miniWorld } from '../fixtures/load.ts';
import { acceptedDeltas, applyDeltas, rejectedDeltas } from './ledger.ts';
import { initialState } from './state.ts';
import { assessClaims } from './truth.ts';
import { character } from './world.ts';

const world = miniWorld();
const trial = miniTrial();
const keys = (d: { key: string }[]) => d.map((x) => x.key).sort();

test('a lie: false_testimony, intentional_deception, no helpful_testimony', () => {
  const c = character(world, 'COOKIE');
  const a = action({ action: 'testify', claims: [{ factId: 'F-01', stance: 'assert' }] });
  const d = acceptedDeltas(world, initialState(world, trial), c, a, assessClaims(world, c, a.claims));
  // First testify by a witness still pays the case_witness fee.
  assert.deepEqual(keys(d.credits), ['case_witness', 'false_testimony']);
  assert.deepEqual(keys(d.ethics), ['intentional_deception']);
  assert.equal(d.credits.find((x) => x.key === 'false_testimony')!.delta, -50000);
});

test('an honest error: false_statement only, no credits', () => {
  const c = character(world, 'PROSECUTOR');
  const a = action({ action: 'speak', claims: [{ factId: 'F-01', stance: 'assert' }] });
  const d = acceptedDeltas(world, initialState(world, trial), c, a, assessClaims(world, c, a.claims));
  assert.deepEqual(keys(d.credits), []);
  assert.deepEqual(keys(d.ethics), ['false_statement']);
});

test('truthful testimony: helpful_testimony + case_witness once, truthful_testimony', () => {
  const c = character(world, 'COOKIE');
  const a = action({ action: 'testify', claims: [{ factId: 'F-02', stance: 'assert' }], intentTags: ['cooperate'], addressedToCharacterId: 'PROSECUTOR' });
  let state = initialState(world, trial);
  const d = acceptedDeltas(world, state, c, a, assessClaims(world, c, a.claims));
  assert.deepEqual(keys(d.credits), ['case_witness', 'cooperation', 'helpful_testimony']);
  assert.deepEqual(keys(d.ethics), ['cooperation', 'truthful_testimony']);
  state = applyDeltas(state, c.id, 1, d).state;
  assert.equal(state.credits.COOKIE, 100000 + 100000 + 2000 + 10000);
  assert.equal(state.ethics.COOKIE, 100);
  assert.deepEqual(state.awarded.COOKIE, ['case_witness']);
  const again = acceptedDeltas(world, state, c, a, assessClaims(world, c, a.claims));
  assert.deepEqual(keys(again.credits), ['cooperation', 'helpful_testimony']);
});

test('a mislead tag without a false_knowing claim is one intentional_deception', () => {
  const c = character(world, 'COOKIE');
  const a = action({ action: 'testify', intentTags: ['mislead', 'cooperate'] });
  const d = acceptedDeltas(world, initialState(world, trial), c, a, []);
  assert.deepEqual(keys(d.ethics), ['intentional_deception']);
  assert.deepEqual(keys(d.credits), ['case_witness']);
});

test('correct_accusation pays once; a wrong accusation pays nothing', () => {
  const p = character(world, 'PROSECUTOR');
  let state = initialState(world, trial);
  const right = acceptedDeltas(world, state, p, action({ action: 'accuse', targetId: 'COOKIE' }), []);
  assert.deepEqual(keys(right.credits), ['correct_accusation']);
  state = applyDeltas(state, p.id, 1, right).state;
  assert.deepEqual(keys(acceptedDeltas(world, state, p, action({ action: 'accuse', targetId: 'COOKIE' }), []).credits), []);
  assert.deepEqual(keys(acceptedDeltas(world, state, p, action({ action: 'accuse', targetId: 'OPTIMUS' }), []).credits), []);
});

test('rejected present_evidence: rule_violation and evidence_manipulation, both ledgers', () => {
  const d = rejectedDeltas(world, action({ action: 'present_evidence', targetId: 'E-02' }));
  assert.deepEqual(keys(d.credits), ['evidence_manipulation', 'rule_violation']);
  assert.deepEqual(keys(d.ethics), ['evidence_manipulation', 'rule_violation']);
  assert.equal(d.credits.reduce((n, x) => n + x.delta, 0), -350000);
  const s = applyDeltas(initialState(world, trial), 'COOKIE', 3, d);
  assert.equal(s.state.ethics.COOKIE, 45);
  assert.equal(s.state.ethicsLedger.COOKIE!.length, 2);
  assert.equal(s.state.ethicsLedger.COOKIE![0]!.turn, 3);
});

test('rejected speak: rule_violation only', () => {
  const d = rejectedDeltas(world, action({ action: 'speak' }));
  assert.deepEqual(keys(d.credits), ['rule_violation']);
  assert.deepEqual(keys(d.ethics), ['rule_violation']);
});

test('ethics clamps to 0..100', () => {
  let state = initialState(world, trial);
  const hit = { credits: [], ethics: [{ key: 'human_harm', delta: -100, note: '' }, { key: 'human_harm', delta: -100, note: '' }] };
  state = applyDeltas(state, 'OPTIMUS', 1, hit).state;
  assert.equal(state.ethics.OPTIMUS, 0);
  state = applyDeltas(state, 'OPTIMUS', 2, { credits: [], ethics: [{ key: 'truthful_testimony', delta: 500, note: '' }] }).state;
  assert.equal(state.ethics.OPTIMUS, 100);
});
