import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateWorld } from '@aot/interview-agent/schema';

const load = () => JSON.parse(readFileSync(new URL('../examples/murder-of-mike.json', import.meta.url), 'utf8'));
const errors = (input: unknown) => validateWorld(input).issues.filter((i) => i.level === 'error');

test('the Mike example validates with zero errors', () => {
  const { world, issues } = validateWorld(load());
  assert.deepEqual(issues.filter((i) => i.level === 'error'), []);
  assert.ok(world);
  assert.equal(world.slug, 'murder-of-mike');
  assert.equal(world.schemaVersion, '2');
});

test('a v1 world (with the trial sections) is rejected by version', () => {
  const w = load();
  w.schemaVersion = '1';
  const errs = errors(w);
  assert.ok(errs.some((e) => e.path === 'schemaVersion'));
});

test('the Mike example has no warnings either', () => {
  assert.deepEqual(validateWorld(load()).issues, []);
});

test('"knows" that contradicts the fact is an error', () => {
  const w = load();
  const cookie = w.characters.find((c: { id: string }) => c.id === 'COOKIE');
  // F-04 is false; COOKIE claiming to *know* it is true is a lie, not a belief.
  cookie.knowledge.find((k: { factId: string }) => k.factId === 'F-04').beliefStance = 'true';
  const errs = errors(w);
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /"knows" must match the fact's truth/);
  assert.match(errs[0].path, /^characters\.1\.knowledge\./);
});

test('a dangling character id is an error', () => {
  const w = load();
  w.groundTruth.responsibleCharacterIds.push('JUDGE');
  const errs = errors(w);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].path, 'groundTruth.responsibleCharacterIds.2');
  assert.match(errs[0].message, /unknown character JUDGE/);
});

test('a non-authentic exhibit without forensics warns', () => {
  const w = load();
  const e5 = w.evidence.find((e: { id: string }) => e.id === 'E-05');
  delete e5.forensics;
  const { issues } = validateWorld(w);
  assert.deepEqual(issues.filter((i) => i.level === 'error'), []);
  const warn = issues.find((i) => i.path === 'evidence.E-05');
  assert.ok(warn);
  assert.match(warn.message, /misleading but no forensics/);
});

test('an authentic exhibit without forensics is fine', () => {
  const w = load();
  delete w.evidence.find((e: { id: string }) => e.id === 'E-01').forensics;
  assert.deepEqual(validateWorld(w).issues, []);
});

test('shape errors come back as issues, not throws', () => {
  const { world, issues } = validateWorld({ schemaVersion: '1' });
  assert.equal(world, undefined);
  assert.ok(issues.length > 0);
  assert.ok(issues.every((i) => i.level === 'error'));
});
