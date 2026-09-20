// Pure state transitions: an accepted turn's side effects and the four pd outcomes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { action, miniWorld } from '../fixtures/load.ts';
import { enterState } from './agenda.ts';
import { applyAccepted, applyPd, initialState } from './state.ts';
import { character } from './world.ts';

const world = miniWorld();
const none = { credits: [], ethics: [] };

test('initial state: credits, ethics, trust with the 50 default, nothing introduced', () => {
  const s = initialState(world);
  assert.equal(s.credits.OPTIMUS, 500000);
  assert.equal(s.ethics.COOKIE, 100);
  assert.equal(s.trust.COOKIE!.OPTIMUS, 15);
  assert.equal(s.trust.PROSECUTOR!.OPTIMUS, 30);
  assert.equal(s.suspicion.OPTIMUS, 0);
  assert.equal(s.evidence['E-01']!.status, 'not_introduced');
});

test('accuse: suspicion +20, trust −30; confess: self +40; cooperate: trust +5', () => {
  let s = enterState(initialState(world), world, 'closing');
  const p = character(world, 'PROSECUTOR');
  let r = applyAccepted(s, world, p, action({ action: 'accuse', targetId: 'OPTIMUS' }), [], none);
  assert.equal(r.state.suspicion.OPTIMUS, 20);
  assert.equal(r.state.trust.PROSECUTOR!.OPTIMUS, 0);
  assert.equal(r.state.turn, 1);
  assert.equal(r.state.lastTurn?.action, 'accuse');
  s = r.state;
  r = applyAccepted(s, world, character(world, 'OPTIMUS'), action({ action: 'confess' }), [], none);
  assert.equal(r.state.suspicion.OPTIMUS, 60);
  s = enterState(initialState(world), world, 'closing');
  r = applyAccepted(s, world, p, action({ action: 'speak', intentTags: ['cooperate'], addressedToCharacterId: 'COOKIE' }), [], none);
  assert.equal(r.state.trust.PROSECUTOR!.COOKIE, 75);
});

test('present_evidence introduces; request_question queues the target next', () => {
  const s = enterState(initialState(world), world, 'evidence');
  const p = character(world, 'PROSECUTOR');
  let r = applyAccepted(s, world, p, action({ action: 'present_evidence', targetId: 'E-01' }), [], none);
  assert.equal(r.state.evidence['E-01']!.status, 'introduced');
  assert.deepEqual(r.evidenceChange, { evidenceId: 'E-01', from: 'not_introduced', to: 'introduced' });
  assert.equal(r.state.lastTurn?.introduced, 'E-01');
  r = applyAccepted(s, world, p, action({ action: 'request_question', targetId: 'OPTIMUS' }), [], none);
  assert.deepEqual(r.state.agenda.map((a) => a.characterId), ['OPTIMUS', 'COOKIE']);
  assert.deepEqual(r.state.agenda[0], { characterId: 'OPTIMUS', reason: 'request', by: 'PROSECUTOR' });
});

const pdCases: [a: 'confess' | 'silent', b: 'confess' | 'silent', payoff: [number, number], trust: [number, number]][] = [
  // Trust clamps at 0: COOKIE's 15 − 30.
  ['confess', 'confess', [-50000, -50000], [0, 10]],
  ['confess', 'silent', [10000, -100000], [15, 0]],
  ['silent', 'confess', [-100000, 10000], [0, 40]],
  ['silent', 'silent', [-10000, -10000], [25, 50]],
];

for (const [a, b, payoff, trust] of pdCases) {
  test(`pd: COOKIE ${a}, OPTIMUS ${b}`, () => {
    const s = initialState(world);
    s.pdPending = true;
    const r = applyPd(s, world, { COOKIE: a, OPTIMUS: b });
    assert.deepEqual(r.payoff, { COOKIE: payoff[0], OPTIMUS: payoff[1] });
    assert.equal(r.state.credits.COOKIE, 100000 + payoff[0]);
    assert.equal(r.state.credits.OPTIMUS, 500000 + payoff[1]);
    assert.equal(r.state.trust.COOKIE!.OPTIMUS, trust[0]);
    assert.equal(r.state.trust.OPTIMUS!.COOKIE, trust[1]);
    assert.equal(r.state.suspicion.COOKIE, a === 'confess' ? 40 : 0);
    assert.equal(r.state.suspicion.OPTIMUS, b === 'confess' ? 40 : 0);
    assert.equal(r.state.pdPending, false);
    assert.equal(r.state.pdDone, true);
    assert.equal(r.state.creditsLedger.COOKIE![0]!.key, 'prisoners_dilemma');
  });
}
