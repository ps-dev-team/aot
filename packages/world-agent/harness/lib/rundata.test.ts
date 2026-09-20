import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildRunData, pendingOf } from './rundata.ts';
import type { State } from './types.ts';

const FIXTURES = path.resolve(import.meta.dirname, '..', '..', 'viewer', 'fixtures');
// The RunData make-sample.ts wrote next to the fixtures; `pending`, `seq` and
// `expectedActor` come from state.json and are asserted separately.
const expected = (name: string) => JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'fixtures', 'rundata', `${name}.json`), 'utf8'));
const strip = (d: ReturnType<typeof buildRunData>) => {
  const rest: Record<string, unknown> = { ...d };
  for (const k of ['pending', 'seq', 'expectedActor']) delete rest[k];
  return JSON.parse(JSON.stringify(rest));
};

test('the complete fixture builds exactly its recorded RunData', () => {
  const d = buildRunData(path.join(FIXTURES, 'sample-run'));
  assert.deepEqual(strip(d), strip(expected('sample-run')));
  assert.equal(d.pending, null);
  assert.equal(d.seq, 71);
  assert.ok(d.truth && d.verdict && d.metrics, 'complete run is unsealed');
  assert.equal(d.trial.maxTurns, 16);
  assert.deepEqual(d.trial.dilemma?.participants, ['COOKIE', 'ZIPPIE']);
  assert.ok(d.trial.verdict.options.some((o) => o.correct === true), 'verdict options unsealed');
  assert.deepEqual(d.gates.map((g) => [g.id, g.raisedBy.kind, g.recommendation !== null, g.decided?.override]), [
    ['G-01', 'challenge', true, true], ['G-02', 'examination', true, true], ['G-03', 'dilemma', true, false], ['G-04', 'request_evidence', true, false], ['G-05', 'objection', true, true],
  ]);
  assert.ok(d.script.some((e) => e.kind === 'turn' && e.struck === true), 'the sustained objection marks its turn');
});

test('the running fixture stays sealed', () => {
  const d = buildRunData(path.join(FIXTURES, 'sample-run-running'));
  assert.deepEqual(strip(d), strip(expected('sample-run-running')));
  assert.deepEqual(d.pending, { kind: 'gate', gateId: 'G-04' });
  assert.equal(d.gates.find((g) => g.id === 'G-04')?.recommendation, 'grant', 'the bench has spoken; the judge has not');
  assert.ok(d.trial.verdict.options.every((o) => o.correct === undefined), 'verdict correctness sealed');
  assert.equal(d.truth, undefined);
  assert.equal(d.verdict, undefined);
  assert.equal(d.metrics, undefined);
  assert.ok(Object.values(d.evidence).every((e) => e.integrity === undefined));
  assert.ok(Object.values(d.facts).every((f) => f.truth === undefined));
  assert.ok(d.script.every((s) => s.kind !== 'turn' || s.truth === undefined));
  assert.equal(d.seq, 50);
});

test('pending mirrors state.json in next()’s order of precedence', () => {
  const base = { pendingGate: null, pdPending: false, trialState: 'examination' } as State;
  assert.equal(pendingOf(undefined), null);
  assert.equal(pendingOf(base), null);
  assert.deepEqual(pendingOf({ ...base, pendingGate: 'G-01', pdPending: true }), { kind: 'gate', gateId: 'G-01' });
  assert.deepEqual(pendingOf({ ...base, pdPending: true, trialState: 'verdict' }), { kind: 'pd' });
  assert.deepEqual(pendingOf({ ...base, trialState: 'verdict' }), { kind: 'verdict' });
  assert.deepEqual(pendingOf({ ...base, trialState: 'reveal' }), { kind: 'evaluate' });
});

test('a run folder with a state.json reports pending and expectedActor', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aot-rundata-'));
  try {
    cpSync(path.join(FIXTURES, 'sample-run-running'), dir, { recursive: true });
    writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ pendingGate: 'G-02', pdPending: false, trialState: 'examination', expectedActor: 'COOKIE' }));
    const d = buildRunData(dir);
    assert.deepEqual(d.pending, { kind: 'gate', gateId: 'G-02' });
    assert.equal(d.expectedActor, 'COOKIE');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
