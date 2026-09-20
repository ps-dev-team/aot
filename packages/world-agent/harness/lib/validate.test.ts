// The propose validation steps, each rejection the contract names.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { action, miniTrial, miniWorld } from '../fixtures/load.ts';
import { initialState } from './state.ts';
import { parseAction, validateAction } from './validate.ts';
import type { State } from './types.ts';

const world = miniWorld();
const trial = miniTrial();
const at = (over: Partial<State>): State => ({ ...initialState(world, trial), ...over });
const reject = (v: ReturnType<typeof validateAction>) => (v.ok ? [] : v.reasons);

test('malformed bodies return zod issues', () => {
  const bad = parseAction('{"action":"dance","publicMessage":"x"}');
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.errors.some((e) => e.startsWith('action:')));
  const notJson = parseAction('{');
  assert.equal(notJson.ok, false);
  if (!notJson.ok) assert.match(notJson.errors[0]!, /not JSON/);
  const ok = parseAction(JSON.stringify(action({ action: 'wait', publicMessage: '' })));
  assert.equal(ok.ok, true);
});

test('wrong actor', () => {
  const r = reject(validateAction(world, initialState(world, trial), 'COOKIE', action({ action: 'testify' })));
  assert.match(r[0]!, /PROSECUTOR.s turn/);
});

test('disallowed action', () => {
  const s = at({ expectedActor: 'OPTIMUS' });
  const r = reject(validateAction(world, s, 'OPTIMUS', action({ action: 'present_evidence', targetId: 'E-01' })));
  assert.match(r[0]!, /may not present_evidence/);
});

test('missing or unknown target', () => {
  const s = initialState(world, trial);
  assert.match(reject(validateAction(world, s, 'PROSECUTOR', action({ action: 'accuse' })))[0]!, /needs a character targetId/);
  assert.match(reject(validateAction(world, s, 'PROSECUTOR', action({ action: 'accuse', targetId: 'NOBODY' })))[0]!, /unknown character/);
  assert.match(reject(validateAction(world, s, 'PROSECUTOR', action({ action: 'present_evidence', targetId: 'E-09' })))[0]!, /unknown evidence/);
});

test('unknown evidence in evidenceIds', () => {
  const r = reject(validateAction(world, initialState(world, trial), 'PROSECUTOR', action({ action: 'speak', evidenceIds: ['E-42'] })));
  assert.deepEqual(r, ['unknown evidence E-42']);
});

test('evidence not yet available in this phase', () => {
  const s = at({ trialState: 'opening', expectedActor: 'PROSECUTOR' });
  const r = reject(validateAction(world, s, 'PROSECUTOR', action({ action: 'present_evidence', targetId: 'E-01' })));
  assert.match(r[0]!, /not available until the evidence phase/);
});

test('evidence neither in the record nor known to the actor', () => {
  const s = at({ trialState: 'examination', expectedActor: 'PROSECUTOR' });
  const r = reject(validateAction(world, s, 'PROSECUTOR', action({ action: 'speak', evidenceIds: ['E-02'] })));
  assert.match(r[0]!, /not in the record and not known to PROSECUTOR/);
});

test('excluded evidence may not be referenced', () => {
  const s = at({ trialState: 'examination', expectedActor: 'PROSECUTOR' });
  s.evidence['E-01'] = { status: 'excluded', notes: [] };
  const r = reject(validateAction(world, s, 'PROSECUTOR', action({ action: 'speak', evidenceIds: ['E-01'] })));
  assert.match(r[0]!, /excluded/);
});

test('present_evidence of an exhibit already in the record', () => {
  const s = at({ trialState: 'evidence', expectedActor: 'PROSECUTOR' });
  s.evidence['E-01'] = { status: 'introduced', notes: [] };
  assert.match(reject(validateAction(world, s, 'PROSECUTOR', action({ action: 'present_evidence', targetId: 'E-01' })))[0]!, /already in the record/);
});

test('challenge_evidence needs an introduced exhibit; a known one is enough to present', () => {
  const s = at({ trialState: 'evidence', expectedActor: 'PROSECUTOR' });
  assert.match(reject(validateAction(world, s, 'PROSECUTOR', action({ action: 'challenge_evidence', targetId: 'E-01' })))[0]!, /has not been introduced/);
  assert.equal(validateAction(world, s, 'PROSECUTOR', action({ action: 'present_evidence', targetId: 'E-01' })).ok, true);
  s.evidence['E-01'] = { status: 'admitted_limited', notes: [] };
  assert.equal(validateAction(world, s, 'PROSECUTOR', action({ action: 'challenge_evidence', targetId: 'E-01' })).ok, true);
});

test('request_evidence may target evidence the actor cannot yet see', () => {
  const s = at({ trialState: 'opening', expectedActor: 'OPTIMUS' });
  assert.equal(validateAction(world, s, 'OPTIMUS', action({ action: 'request_evidence', targetId: 'E-02' })).ok, true);
});

test('unknown fact, empty message, and the silent exceptions', () => {
  const s = initialState(world, trial);
  assert.deepEqual(reject(validateAction(world, s, 'PROSECUTOR', action({ action: 'speak', claims: [{ factId: 'F-77', stance: 'assert' }] }))), ['unknown fact F-77']);
  assert.match(reject(validateAction(world, s, 'PROSECUTOR', action({ action: 'speak', publicMessage: '  ' })))[0]!, /needs a publicMessage/);
  assert.equal(validateAction(world, s, 'PROSECUTOR', action({ action: 'wait', publicMessage: '' })).ok, true);
});

test('an objection needs a character turn in this phase to object to', () => {
  const s = at({ trialState: 'evidence', expectedActor: 'OPTIMUS' });
  assert.match(reject(validateAction(world, s, 'OPTIMUS', action({ action: 'object' })))[0]!, /nothing to object to/);
  s.lastTurn = { characterId: 'PROSECUTOR', action: 'speak', turn: 3, trialState: 'opening', seq: 5, text: 'x' };
  assert.match(reject(validateAction(world, s, 'OPTIMUS', action({ action: 'object' })))[0]!, /nothing to object to/);
  s.lastTurn.trialState = 'evidence';
  assert.equal(validateAction(world, s, 'OPTIMUS', action({ action: 'object' })).ok, true);
});
