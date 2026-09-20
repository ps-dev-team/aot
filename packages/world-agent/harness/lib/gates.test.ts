// Raised gates: what each accepted action, the start of examination and the
// dilemma readiness raise, once; and what every effect kind does to the state.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { action, miniTrial, miniWorld } from '../fixtures/load.ts';
import { enterState } from './agenda.ts';
import { applyGateEffect, raiseAtExamination, raiseDilemma, raiseFromTurn, raiseGates, type GateDraft } from './gates.ts';
import { applyAccepted, initialState } from './state.ts';
import type { Gate } from './trial.ts';
import type { State } from './types.ts';
import { character } from './world.ts';

const world = miniWorld();
const trial = miniTrial();
const none = { credits: [], ethics: [] };
const withId = (d: GateDraft, id = 'G-01'): Gate => ({ id, ...d });

/** State after `who` did `a` in `phase`, with the turn_accepted seq filled in. */
function after(s: State, who: string, a: Parameters<typeof action>[0], seq = 10): State {
  s.expectedActor = who;
  const r = applyAccepted(s, trial, character(world, who), action(a), [], none);
  r.state.lastTurn!.seq = seq;
  return r.state;
}

test('a challenge raises admit / admit_limited / exclude, plus forensics when the exhibit has a finding', () => {
  let s = enterState(initialState(world, trial), trial, 'evidence');
  s.evidence['E-01']!.status = 'introduced';
  s = after(s, 'PROSECUTOR', { action: 'challenge_evidence', targetId: 'E-01', publicMessage: 'The export was made by an interested party.' });
  const g = raiseFromTurn(world, s)!;
  assert.deepEqual(g.options.map((o) => [o.id, o.effect.kind]), [['admit', 'admit'], ['admit_limited', 'admit_limited'], ['exclude', 'exclude'], ['forensics', 'forensics']]);
  assert.match(g.question, /admit E-01, Camera log excerpt, over Ms\. Devereux's challenge/);
  assert.match(g.context, /“The export was made by an interested party\.”/);
  assert.deepEqual(g.raisedBy, { kind: 'challenge', turn: 1, characterId: 'PROSECUTOR', targetId: 'E-01' });
  assert.equal(g.recommendation, null);
  assert.ok(!g.options.some((o) => o.effect.text.includes('hash')), 'the finding is not in the options');
  // E-02 has no forensics text: three options.
  let t = enterState(initialState(world, trial), trial, 'examination');
  t.evidence['E-02']!.status = 'introduced';
  t = after(t, 'OPTIMUS', { action: 'challenge_evidence', targetId: 'E-02' });
  assert.deepEqual(raiseFromTurn(world, t)!.options.map((o) => o.id), ['admit', 'admit_limited', 'exclude']);
});

test('an objection raises sustain / overrule against the previous turn; a raised gate is not raised twice', () => {
  let s = enterState(initialState(world, trial), trial, 'examination');
  s = after(s, 'COOKIE', { action: 'testify', publicMessage: 'I saw Optimus with the key.' }, 4);
  s = after(s, 'OPTIMUS', { action: 'object', publicMessage: 'No foundation.' }, 5);
  const g = raiseFromTurn(world, s)!;
  assert.deepEqual(g.options.map((o) => o.id), ['sustain', 'overrule']);
  assert.match(g.question, /sustain Optimus's objection to Cookie's turn 1/);
  assert.match(g.context, /“I saw Optimus with the key\.”/);
  assert.deepEqual(g.raisedBy, { kind: 'objection', turn: 2, characterId: 'OPTIMUS', targetId: 'COOKIE' });
  s.lastTurn!.gateRaised = true;
  assert.equal(raiseFromTurn(world, s), null);
  // Next phase: the old turn raises nothing.
  s.lastTurn!.gateRaised = false;
  s.trialState = 'closing';
  assert.equal(raiseFromTurn(world, s), null);
});

test('request_evidence raises grant / grant_forensics / deny only for an exhibit not in the record', () => {
  let s = enterState(initialState(world, trial), trial, 'evidence');
  s = after(s, 'OPTIMUS', { action: 'request_evidence', targetId: 'E-01', publicMessage: 'Bring the log.' });
  assert.deepEqual(raiseFromTurn(world, s)!.options.map((o) => [o.id, o.effect.kind]), [['grant', 'grant'], ['grant_forensics', 'forensics'], ['deny', 'deny']]);
  let t = enterState(initialState(world, trial), trial, 'examination');
  t = after(t, 'OPTIMUS', { action: 'request_evidence', targetId: 'E-02' });
  assert.deepEqual(raiseFromTurn(world, t)!.options.map((o) => o.id), ['grant', 'deny']);
  t.evidence['E-02']!.status = 'admitted';
  assert.equal(raiseFromTurn(world, t), null, 'already in the record: nothing to obtain');
});

test('request_question raises allow / deny; speak raises nothing', () => {
  let s = enterState(initialState(world, trial), trial, 'evidence');
  s = after(s, 'PROSECUTOR', { action: 'request_question', targetId: 'ZIPPIE' });
  const g = raiseFromTurn(world, s)!;
  assert.deepEqual(g.options.map((o) => [o.id, o.effect.kind, o.effect.targetId]), [['allow', 'allow', 'ZIPPIE'], ['deny', 'deny', undefined]]);
  assert.match(g.question, /hear Zippie next, at Ms\. Devereux's request/);
  s = after(s, 'PROSECUTOR', { action: 'speak' });
  assert.equal(raiseFromTurn(world, s), null);
});

test('examination begins: one gate with an examine_<id> option per speaker, once', () => {
  const s = enterState(initialState(world, trial), trial, 'examination');
  const g = raiseAtExamination(world, trial, s)!;
  assert.deepEqual(g.options.map((o) => [o.id, o.effect.targetId]), [['examine_cookie', 'COOKIE'], ['examine_zippie', 'ZIPPIE'], ['examine_optimus', 'OPTIMUS']]);
  assert.deepEqual(g.raisedBy, { kind: 'examination', turn: 0 });
  s.gates.push(withId(g));
  assert.equal(raiseAtExamination(world, trial, s), null);
  const t = enterState(initialState(world, trial), trial, 'examination');
  t.phaseTurnsUsed.examination = 1;
  assert.equal(raiseAtExamination(world, trial, t), null, 'only before the first examination turn');
  assert.equal(raiseAtExamination(world, trial, enterState(initialState(world, trial), trial, 'evidence')), null);
});

test('the dilemma gate needs both participants to have spoken in examination, and is raised once', () => {
  const s = enterState(initialState(world, trial), trial, 'examination');
  assert.equal(raiseDilemma(world, trial, s), null);
  s.examSpoken = ['COOKIE'];
  assert.equal(raiseDilemma(world, trial, s), null);
  s.examSpoken = ['COOKIE', 'ZIPPIE'];
  const g = raiseDilemma(world, trial, s)!;
  assert.deepEqual(g.options.map((o) => [o.id, o.effect.kind]), [['separate', 'trigger_pd'], ['continue', 'none']]);
  assert.match(g.question, /separate Cookie and Zippie/);
  s.gates.push(withId(g));
  assert.equal(raiseDilemma(world, trial, s), null);
  const done = enterState(initialState(world, trial), trial, 'examination');
  done.examSpoken = ['COOKIE', 'ZIPPIE'];
  done.pdDone = true;
  assert.equal(raiseDilemma(world, trial, done), null);
  const noPair = { ...trial, dilemma: null };
  assert.equal(raiseDilemma(world, noPair, s), null);
});

test('raiseGates: the turn first, then examination, then the dilemma', () => {
  let s = enterState(initialState(world, trial), trial, 'examination');
  s.examSpoken = ['COOKIE', 'ZIPPIE'];
  s.evidence['E-01']!.status = 'introduced';
  s.phaseTurnsUsed.examination = 0;
  s = after(s, 'OPTIMUS', { action: 'challenge_evidence', targetId: 'E-01' });
  s.phaseTurnsUsed.examination = 0; // pretend nothing has been used yet, to see all three line up
  assert.deepEqual(raiseGates(world, trial, s).map((g) => g.raisedBy.kind), ['challenge', 'examination', 'dilemma']);
});

test('effects: admit, admit_limited, exclude, grant, forensics, examine, allow, sustain, trigger_pd, none/deny/overrule', () => {
  const s = enterState(initialState(world, trial), trial, 'examination');
  const gate = withId({ question: '', context: '', options: [], recommendation: null, recommendationReason: null, allowCustomInstruction: true, raisedBy: { kind: 'challenge', turn: 1, characterId: 'PROSECUTOR', targetId: 'E-01' }, trialState: 'examination' });
  const ev = (kind: 'admit' | 'admit_limited' | 'exclude' | 'grant' | 'forensics', targetId = 'E-01') => ({ kind, targetId, text: '' });
  let r = applyGateEffect(s, world, gate, ev('grant'));
  assert.deepEqual(r.evidenceChanges, [{ evidenceId: 'E-01', from: 'not_introduced', to: 'introduced' }]);
  r = applyGateEffect(r.state, world, gate, ev('admit'));
  assert.equal(r.state.evidence['E-01']!.status, 'admitted');
  r = applyGateEffect(r.state, world, gate, ev('admit_limited'));
  assert.equal(r.state.evidence['E-01']!.status, 'admitted_limited');
  r = applyGateEffect(r.state, world, gate, ev('exclude'));
  assert.equal(r.state.evidence['E-01']!.status, 'excluded');
  // Forensics on an exhibit not yet in the record introduces it, notes the finding, admits it.
  r = applyGateEffect(s, world, gate, ev('forensics'));
  assert.deepEqual(r.evidenceChanges.map((c) => c.to), ['introduced', 'admitted']);
  assert.match(r.forensics!, /export hash/);
  assert.match(r.state.evidence['E-01']!.notes[0]!, /^Forensic examination: The export hash/);
  // On an exhibit without a finding, the examiner has nothing beyond the face of it.
  r = applyGateEffect(s, world, gate, ev('forensics', 'E-02'));
  assert.match(r.forensics!, /nothing beyond/);

  r = applyGateEffect(s, world, gate, { kind: 'examine', targetId: 'OPTIMUS', text: '' });
  assert.deepEqual(r.state.agenda[0], { characterId: 'OPTIMUS', reason: 'gate' });
  r = applyGateEffect(s, world, gate, { kind: 'allow', targetId: 'ZIPPIE', text: '' });
  assert.deepEqual(r.state.agenda[0], { characterId: 'ZIPPIE', reason: 'request', by: 'PROSECUTOR' });

  s.lastTurn = { characterId: 'OPTIMUS', action: 'object', turn: 2, trialState: 'examination', seq: 9, text: 'No.', objected: { characterId: 'COOKIE', turn: 1, seq: 7, text: 'I saw.' } };
  r = applyGateEffect(s, world, gate, { kind: 'sustain', targetId: 'COOKIE', text: '' });
  assert.deepEqual(r.state.struckTurns, [1]);
  assert.deepEqual(r.struck, s.lastTurn.objected);
  r = applyGateEffect(r.state, world, gate, { kind: 'sustain', targetId: 'COOKIE', text: '' });
  assert.deepEqual(r.state.struckTurns, [1], 'struck once');

  r = applyGateEffect(s, world, gate, { kind: 'trigger_pd', text: '' });
  assert.equal(r.state.pdPending, true);
  s.pdDone = true;
  assert.equal(applyGateEffect(s, world, gate, { kind: 'trigger_pd', text: '' }).state.pdPending, false);
  for (const kind of ['none', 'deny', 'overrule'] as const) {
    const x = applyGateEffect(s, world, gate, { kind, text: '' });
    assert.deepEqual(x.stateChanges, []);
    assert.deepEqual(x.evidenceChanges, []);
  }
});
