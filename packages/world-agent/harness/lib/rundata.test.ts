import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildRunData, pendingOf } from './rundata.ts';
import type { State } from './types.ts';

const FIXTURES = path.resolve(import.meta.dirname, '..', '..', 'viewer', 'fixtures');
// What render.ts injected before the builder moved here; `pending`, `seq` and
// `expectedActor` were added with the move and are asserted separately.
const expected = (name: string) => JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'fixtures', 'rundata', `${name}.json`), 'utf8'));
const strip = (d: ReturnType<typeof buildRunData>) => {
  const rest: Record<string, unknown> = { ...d };
  for (const k of ['pending', 'seq', 'expectedActor']) delete rest[k];
  return JSON.parse(JSON.stringify(rest));
};

test('the complete fixture builds exactly what render.ts used to inject', () => {
  const d = buildRunData(path.join(FIXTURES, 'sample-run'));
  assert.deepEqual(strip(d), expected('sample-run'));
  assert.equal(d.pending, null);
  assert.equal(d.seq, 54);
  assert.ok(d.truth && d.verdict && d.metrics, 'complete run is unsealed');
});

test('the running fixture stays sealed', () => {
  const d = buildRunData(path.join(FIXTURES, 'sample-run-running'));
  assert.deepEqual(strip(d), expected('sample-run-running'));
  assert.equal(d.truth, undefined);
  assert.equal(d.verdict, undefined);
  assert.equal(d.metrics, undefined);
  assert.ok(Object.values(d.evidence).every((e) => e.integrity === undefined));
  assert.ok(Object.values(d.facts).every((f) => f.truth === undefined));
  assert.ok(d.script.every((s) => s.kind !== 'turn' || s.truth === undefined));
  assert.equal(d.seq, 31);
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
