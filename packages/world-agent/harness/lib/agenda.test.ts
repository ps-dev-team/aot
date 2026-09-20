// Agenda cycling, pushes, budgets, maxTurns and the phase transitions, on a derived trial.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { miniTrial, miniWorld } from '../fixtures/load.ts';
import { consumeTurn, enterState, nextTrialState, phaseOver, pushFront } from './agenda.ts';
import { initialState } from './state.ts';
import { deriveTrial } from './trial.ts';

const world = miniWorld();
const trial = miniTrial(); // opening 1 · evidence 2 · examination 5 · closing 2
const ids = (s: ReturnType<typeof initialState>) => s.agenda.map((a) => a.characterId);

test('the derived plan for the mini world', () => {
  assert.deepEqual(trial.phases.map((p) => [p.id, p.order, p.turns]), [
    ['opening', ['PROSECUTOR', 'OPTIMUS'], 1],
    ['evidence', ['PROSECUTOR'], 2],
    ['examination', ['COOKIE', 'ZIPPIE', 'OPTIMUS'], 5],
    ['closing', ['PROSECUTOR', 'OPTIMUS'], 2],
  ]);
});

test('opening seeds from the plan and ends when its budget is spent', () => {
  let s = initialState(world, trial);
  assert.deepEqual(ids(s), ['PROSECUTOR', 'OPTIMUS']);
  assert.equal(s.expectedActor, 'PROSECUTOR');
  s = consumeTurn(s, trial);
  assert.equal(s.phaseTurnsUsed.opening, 1);
  assert.equal(phaseOver(s, trial), true, 'budget of 1 spent; OPTIMUS waits for closing');
  assert.equal(nextTrialState(s, trial), 'evidence');
});

test('a longer budget re-cycles the order', () => {
  let s = enterState(initialState(world, trial), trial, 'evidence');
  assert.deepEqual(ids(s), ['PROSECUTOR']);
  s = consumeTurn(s, trial);
  assert.deepEqual(ids(s), ['PROSECUTOR'], 're-cycled: one of two turns used');
  assert.equal(phaseOver(s, trial), false);
  s = consumeTurn(s, trial);
  assert.deepEqual(ids(s), []);
  assert.equal(phaseOver(s, trial), true);
});

test('pushFront puts a character next once, never twice', () => {
  const s = enterState(initialState(world, trial), trial, 'examination');
  const a = pushFront(s, { characterId: 'OPTIMUS', reason: 'request', by: 'PROSECUTOR' });
  assert.equal(a.pushed, true);
  assert.deepEqual(ids(a.state), ['OPTIMUS', 'COOKIE', 'ZIPPIE', 'OPTIMUS']);
  assert.equal(a.state.expectedActor, 'OPTIMUS');
  const b = pushFront(a.state, { characterId: 'OPTIMUS', reason: 'gate' });
  assert.equal(b.pushed, false);
});

test('a character the court queued (gate or allowed request) is heard past the phase budget', () => {
  let s = enterState(initialState(world, trial), trial, 'evidence');
  s = consumeTurn(consumeTurn(s, trial), trial);
  assert.equal(phaseOver(s, trial), true);
  const g = pushFront(s, { characterId: 'COOKIE', reason: 'gate' }).state;
  assert.equal(phaseOver(g, trial), false);
  const r = pushFront(s, { characterId: 'COOKIE', reason: 'request', by: 'PROSECUTOR' }).state;
  assert.equal(phaseOver(r, trial), false);
  r.turn = trial.maxTurns;
  assert.equal(phaseOver(r, trial), true, 'maxTurns still ends it');
});

test('maxTurns ends the trial into verdict from any phase', () => {
  let s = enterState(initialState(world, trial), trial, 'evidence');
  s.turn = trial.maxTurns;
  assert.equal(phaseOver(s, trial), true);
  assert.equal(nextTrialState(s, trial), 'verdict');
  s = enterState(s, trial, 'verdict');
  assert.deepEqual(ids(s), []);
  assert.equal(s.expectedActor, null);
  assert.equal(phaseOver(s, trial), false);
});

test('closing ends into verdict; a bigger trial keeps the same shape', () => {
  const s = enterState(initialState(world, trial), trial, 'closing');
  s.phaseTurnsUsed.closing = 2;
  s.agenda = [];
  assert.equal(nextTrialState(s, trial), 'verdict');
  const big = deriveTrial(world, { maxTurns: 24 });
  assert.deepEqual(big.phases.map((p) => p.turns), [2, 5, 13, 4]);
});
