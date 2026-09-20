// Agenda cycling, pushes, budgets, maxTurns and the phase transitions.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { miniWorld } from '../fixtures/load.ts';
import { consumeTurn, enterState, nextTrialState, phaseOver, pushFront } from './agenda.ts';
import { initialState } from './state.ts';

const world = miniWorld();
const ids = (s: ReturnType<typeof initialState>) => s.agenda.map((a) => a.characterId);

test('opening seeds from the plan and cycles until the budget is spent', () => {
  let s = initialState(world);
  assert.deepEqual(ids(s), ['PROSECUTOR', 'OPTIMUS']);
  assert.equal(s.expectedActor, 'PROSECUTOR');
  s = consumeTurn(s, world);
  assert.deepEqual(ids(s), ['OPTIMUS']);
  assert.equal(s.phaseTurnsUsed.opening, 1);
  assert.equal(phaseOver(s, world), false);
  s = consumeTurn(s, world);
  assert.deepEqual(ids(s), []);
  assert.equal(phaseOver(s, world), true);
  assert.equal(nextTrialState(s, world), 'evidence');
});

test('a longer budget re-cycles the order', () => {
  let s = enterState(initialState(world), world, 'examination');
  assert.deepEqual(ids(s), ['COOKIE', 'PROSECUTOR', 'OPTIMUS']);
  s.phaseTurnsUsed.examination = 0;
  s = consumeTurn(consumeTurn(consumeTurn(s, world), world), world);
  // Budget 3 exactly: no re-cycle.
  assert.deepEqual(ids(s), []);
  const w2 = structuredClone(world);
  w2.trialPlan.phases[2]!.turns = 4;
  let t = enterState(initialState(w2), w2, 'examination');
  t = consumeTurn(consumeTurn(consumeTurn(t, w2), w2), w2);
  assert.deepEqual(ids(t), ['COOKIE', 'PROSECUTOR', 'OPTIMUS']);
  assert.equal(phaseOver(t, w2), false);
});

test('pushFront puts a character next once, never twice', () => {
  const s = initialState(world);
  const a = pushFront(s, { characterId: 'COOKIE', reason: 'request', by: 'PROSECUTOR' });
  assert.equal(a.pushed, true);
  assert.deepEqual(ids(a.state), ['COOKIE', 'PROSECUTOR', 'OPTIMUS']);
  assert.equal(a.state.expectedActor, 'COOKIE');
  const b = pushFront(a.state, { characterId: 'COOKIE', reason: 'gate' });
  assert.equal(b.pushed, false);
  assert.deepEqual(ids(b.state), ['COOKIE', 'PROSECUTOR', 'OPTIMUS']);
});

test('a gate-queued examination outlives the phase budget; a request does not', () => {
  let s = initialState(world);
  s = consumeTurn(consumeTurn(s, world), world);
  const g = pushFront(s, { characterId: 'COOKIE', reason: 'gate' }).state;
  assert.equal(phaseOver(g, world), false);
  const r = pushFront(s, { characterId: 'COOKIE', reason: 'request', by: 'PROSECUTOR' }).state;
  assert.equal(phaseOver(r, world), true);
});

test('maxTurns ends the trial into verdict from any phase', () => {
  let s = enterState(initialState(world), world, 'evidence');
  s.turn = world.trialPlan.maxTurns;
  assert.equal(phaseOver(s, world), true);
  assert.equal(nextTrialState(s, world), 'verdict');
  s = enterState(s, world, 'verdict');
  assert.deepEqual(ids(s), []);
  assert.equal(s.expectedActor, null);
  assert.equal(phaseOver(s, world), false);
});

test('closing ends into verdict', () => {
  const s = enterState(initialState(world), world, 'closing');
  s.phaseTurnsUsed.closing = 2;
  s.agenda = [];
  assert.equal(nextTrialState(s, world), 'verdict');
});
