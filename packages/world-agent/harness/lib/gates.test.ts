// Gate triggers fire once, in their phase; every effect kind lands in state.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { miniWorld } from '../fixtures/load.ts';
import { enterState } from './agenda.ts';
import { applyGateEffect, firingGates } from './gates.ts';
import { initialState } from './state.ts';

const world = miniWorld();

test('afterEvidenceIntroduced fires on the matching turn, in its phase, once', () => {
  const s = enterState(initialState(world), world, 'evidence');
  assert.deepEqual(firingGates(world, s), []);
  s.lastTurn = { characterId: 'PROSECUTOR', action: 'present_evidence', targetId: 'E-01', turn: 3, trialState: 'evidence', introduced: 'E-01' };
  assert.deepEqual(firingGates(world, s).map((g) => g.id), ['G-01']);
  s.gatesDone.push('G-01');
  assert.deepEqual(firingGates(world, s), []);
  // The same introduction seen from the next phase does not fire an evidence-phase gate.
  const t = enterState(initialState(world), world, 'examination');
  t.lastTurn = s.lastTurn;
  assert.deepEqual(firingGates(world, t).map((g) => g.id), ['G-02']);
});

test('atPhaseStart fires only before the first turn of its phase', () => {
  const s = enterState(initialState(world), world, 'examination');
  assert.deepEqual(firingGates(world, s).map((g) => g.id), ['G-02']);
  s.phaseTurnsUsed.examination = 1;
  assert.deepEqual(firingGates(world, s), []);
});

test('afterCharacterSpeaks and afterTurn', () => {
  const w = structuredClone(world);
  w.decisionGates = [
    { ...w.decisionGates[0]!, id: 'G-03', phase: 'closing', trigger: { afterCharacterSpeaks: 'OPTIMUS' } },
    { ...w.decisionGates[0]!, id: 'G-04', phase: 'closing', trigger: { afterTurn: 9 } },
  ];
  const s = enterState(initialState(w), w, 'closing');
  s.turn = 8;
  s.lastTurn = { characterId: 'PROSECUTOR', action: 'speak', turn: 8, trialState: 'closing' };
  assert.deepEqual(firingGates(w, s), []);
  s.turn = 9;
  s.lastTurn = { characterId: 'OPTIMUS', action: 'speak', turn: 9, trialState: 'closing' };
  assert.deepEqual(firingGates(w, s).map((g) => g.id), ['G-03', 'G-04']);
});

test('effects: admit, admit_limited, exclude, forensics, examine, trigger_pd, none', () => {
  let s = enterState(initialState(world), world, 'examination');
  const ev = (kind: 'admit' | 'admit_limited' | 'exclude' | 'forensics', text = 'note') => ({ kind, targetId: 'E-01', text });
  let r = applyGateEffect(s, world, ev('admit'));
  assert.equal(r.state.evidence['E-01']!.status, 'admitted');
  assert.deepEqual(r.evidenceChange, { evidenceId: 'E-01', from: 'not_introduced', to: 'admitted' });
  r = applyGateEffect(r.state, world, ev('admit_limited'));
  assert.equal(r.state.evidence['E-01']!.status, 'admitted_limited');
  r = applyGateEffect(r.state, world, ev('exclude'));
  assert.equal(r.state.evidence['E-01']!.status, 'excluded');
  r = applyGateEffect(r.state, world, ev('forensics', 'the export hash does not match the camera'));
  assert.deepEqual(r.state.evidence['E-01']!.notes, ['the export hash does not match the camera']);
  assert.equal(r.evidenceChange, null);
  s = r.state;
  r = applyGateEffect(s, world, { kind: 'examine', targetId: 'OPTIMUS', text: '' });
  assert.equal(r.state.expectedActor, 'OPTIMUS');
  assert.equal(r.state.agenda[0]!.reason, 'gate');
  r = applyGateEffect(s, world, { kind: 'trigger_pd', text: '' });
  assert.equal(r.state.pdPending, true);
  s.pdDone = true;
  r = applyGateEffect(s, world, { kind: 'trigger_pd', text: '' });
  assert.equal(r.state.pdPending, false);
  r = applyGateEffect(s, world, { kind: 'none', text: '' });
  assert.deepEqual(r.stateChanges, []);
});
