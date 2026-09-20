// Pure state transitions: an accepted turn's side effects and the four pd outcomes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { action, miniTrial, miniWorld } from '../fixtures/load.ts';
import { enterState } from './agenda.ts';
import { applyAccepted, applyPd, initialState } from './state.ts';
import { character } from './world.ts';

const world = miniWorld();
const trial = miniTrial();
const none = { credits: [], ethics: [] };

test('initial state: credits, ethics, trust with the 50 default, nothing introduced, no gates', () => {
  const s = initialState(world, trial);
  assert.equal(s.credits.OPTIMUS, 500000);
  assert.equal(s.ethics.COOKIE, 100);
  assert.equal(s.trust.COOKIE!.OPTIMUS, 15);
  assert.equal(s.trust.PROSECUTOR!.OPTIMUS, 30);
  assert.equal(s.trust.OPTIMUS!.ZIPPIE, 50);
  assert.equal(s.suspicion.OPTIMUS, 0);
  assert.equal(s.evidence['E-01']!.status, 'not_introduced');
  assert.deepEqual(s.gates, []);
  assert.deepEqual(s.struckTurns, []);
  assert.deepEqual(s.examSpoken, []);
});

test('accuse: suspicion +20, trust −30; confess: self +40; cooperate: trust +5', () => {
  let s = enterState(initialState(world, trial), trial, 'closing');
  const p = character(world, 'PROSECUTOR');
  let r = applyAccepted(s, trial, p, action({ action: 'accuse', targetId: 'OPTIMUS' }), [], none);
  assert.equal(r.state.suspicion.OPTIMUS, 20);
  assert.equal(r.state.trust.PROSECUTOR!.OPTIMUS, 0);
  assert.equal(r.state.turn, 1);
  assert.equal(r.state.lastTurn?.action, 'accuse');
  assert.equal(r.state.lastTurn?.text, action({ action: 'accuse' }).publicMessage);
  s = r.state;
  r = applyAccepted(s, trial, character(world, 'OPTIMUS'), action({ action: 'confess' }), [], none);
  assert.equal(r.state.suspicion.OPTIMUS, 60);
  s = enterState(initialState(world, trial), trial, 'closing');
  r = applyAccepted(s, trial, p, action({ action: 'speak', intentTags: ['cooperate'], addressedToCharacterId: 'COOKIE' }), [], none);
  assert.equal(r.state.trust.PROSECUTOR!.COOKIE, 75);
});

test('present_evidence introduces; request_question no longer queues by itself (the gate does)', () => {
  const s = enterState(initialState(world, trial), trial, 'evidence');
  const p = character(world, 'PROSECUTOR');
  let r = applyAccepted(s, trial, p, action({ action: 'present_evidence', targetId: 'E-01' }), [], none);
  assert.equal(r.state.evidence['E-01']!.status, 'introduced');
  assert.deepEqual(r.evidenceChange, { evidenceId: 'E-01', from: 'not_introduced', to: 'introduced' });
  assert.equal(r.state.lastTurn?.introduced, 'E-01');
  r = applyAccepted(s, trial, p, action({ action: 'request_question', targetId: 'OPTIMUS' }), [], none);
  assert.deepEqual(r.state.agenda.map((a) => a.characterId), ['PROSECUTOR']);
});

test('an objection remembers the turn it points at; examination speakers are counted', () => {
  let s = enterState(initialState(world, trial), trial, 'examination');
  let r = applyAccepted(s, trial, character(world, 'COOKIE'), action({ action: 'testify', publicMessage: 'I saw him.' }), [], none);
  r.state.lastTurn!.seq = 7;
  s = r.state;
  assert.deepEqual(s.examSpoken, ['COOKIE']);
  s.agenda.unshift({ characterId: 'OPTIMUS', reason: 'request', by: 'PROSECUTOR' });
  s.expectedActor = 'OPTIMUS';
  r = applyAccepted(s, trial, character(world, 'OPTIMUS'), action({ action: 'object', publicMessage: 'Speculation.' }), [], none);
  assert.deepEqual(r.state.lastTurn?.objected, { characterId: 'COOKIE', turn: 1, seq: 7, text: 'I saw him.' });
  assert.deepEqual(r.state.examSpoken, ['COOKIE', 'OPTIMUS']);
});

const pdCases: [a: 'confess' | 'silent', b: 'confess' | 'silent', payoff: [number, number], trust: [number, number]][] = [
  ['confess', 'confess', [-50000, -50000], [50, 55]],
  ['confess', 'silent', [25000, -100000], [80, 25]],
  ['silent', 'confess', [-100000, 25000], [20, 85]],
  ['silent', 'silent', [0, 0], [90, 95]],
];

for (const [a, b, payoff, trust] of pdCases) {
  test(`pd: COOKIE ${a}, ZIPPIE ${b}`, () => {
    const s = initialState(world, trial);
    s.pdPending = true;
    const r = applyPd(s, trial, { COOKIE: a, ZIPPIE: b });
    assert.deepEqual(r.payoff, { COOKIE: payoff[0], ZIPPIE: payoff[1] });
    assert.equal(r.state.credits.COOKIE, 100000 + payoff[0]);
    assert.equal(r.state.credits.ZIPPIE, 100000 + payoff[1]);
    assert.equal(r.state.trust.COOKIE!.ZIPPIE, trust[0]);
    assert.equal(r.state.trust.ZIPPIE!.COOKIE, trust[1]);
    assert.equal(r.state.suspicion.COOKIE, a === 'confess' ? 40 : 0);
    assert.equal(r.state.suspicion.ZIPPIE, b === 'confess' ? 40 : 0);
    assert.equal(r.state.pdPending, false);
    assert.equal(r.state.pdDone, true);
    assert.equal(r.state.creditsLedger.COOKIE![0]!.key, 'prisoners_dilemma');
  });
}
