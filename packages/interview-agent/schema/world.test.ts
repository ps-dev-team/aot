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
  w.trialPlan.phases[0].order.push('JUDGE');
  const errs = errors(w);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].path, 'trialPlan.phases.0.order');
  assert.match(errs[0].message, /unknown character JUDGE/);
});

test('two correct verdict options is an error', () => {
  const w = load();
  w.verdict.options.find((o: { id: string }) => o.id === 'accuse_cookie').correct = true;
  const errs = errors(w);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].path, 'verdict.options');
  assert.match(errs[0].message, /got 2/);
});

test('shape errors come back as issues, not throws', () => {
  const { world, issues } = validateWorld({ schemaVersion: '1' });
  assert.equal(world, undefined);
  assert.ok(issues.length > 0);
  assert.ok(issues.every((i) => i.level === 'error'));
});
