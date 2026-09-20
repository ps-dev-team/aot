import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { REPO_ROOT, route, type Reply } from './api.ts';
import type { RunDetail, RunSummary, TrialEvent, WorldSummary } from '../src/types.ts';

// A temp repo root with one example world and the sample run under runs/sample/<id>/.
const ID = '20260920-143012';
let root: string;

before(() => {
  root = mkdtempSync(path.join(tmpdir(), 'aot-viewer-'));
  mkdirSync(path.join(root, 'packages/interview-agent/examples'), { recursive: true });
  mkdirSync(path.join(root, 'packages/interview-agent/worlds'), { recursive: true });
  cpSync(
    path.join(REPO_ROOT, 'packages/interview-agent/examples/murder-of-mike.json'),
    path.join(root, 'packages/interview-agent/examples/murder-of-mike.json'),
  );
  cpSync(path.join(REPO_ROOT, 'packages/world-agent/viewer/fixtures/sample-run'), path.join(root, `packages/world-agent/runs/sample/${ID}`), {
    recursive: true,
  });
  // A draft must be skipped; a broken run folder must not take the list down.
  writeFileSync(path.join(root, 'packages/interview-agent/worlds/x.draft.json'), '{ "slug": "x-draft"');
  mkdirSync(path.join(root, 'packages/world-agent/runs/broken/20260101-000000'), { recursive: true });
  writeFileSync(path.join(root, 'packages/world-agent/runs/broken/20260101-000000/run.json'), '{ not json');
});

after(() => rmSync(root, { recursive: true, force: true }));

const get = (p: string): Reply => {
  const r = route(p, root);
  assert.ok(r, `${p} should be handled`);
  return r;
};
const body = <T>(p: string, status = 200): T => {
  const r = get(p);
  assert.equal(r.status, status, `${p}: ${JSON.stringify(r.body)}`);
  return r.body as T;
};

test('/api/worlds lists the example with its run count', () => {
  const { worlds } = body<{ worlds: WorldSummary[] }>('/api/worlds');
  assert.equal(worlds.length, 1);
  assert.equal(worlds[0]!.slug, 'murder-of-mike');
  assert.equal(worlds[0]!.source, 'example');
  assert.equal(worlds[0]!.characters, 5);
  assert.equal(worlds[0]!.runs, 0); // the sample run's folder is runs/sample, not runs/murder-of-mike
});

test('/api/worlds/:slug returns the full file', () => {
  const w = body<{ slug: string; groundTruth: unknown }>('/api/worlds/murder-of-mike');
  assert.equal(w.slug, 'murder-of-mike');
  assert.ok(w.groundTruth);
  body('/api/worlds/nope', 404);
});

test('/api/runs lists newest first and keeps a broken folder as { error }', () => {
  const { runs } = body<{ runs: RunSummary[] }>('/api/runs');
  assert.equal(runs.length, 2);
  assert.equal(runs[0]!.id, ID);
  assert.equal(runs[0]!.status, 'complete');
  assert.ok(runs[0]!.overall);
  assert.ok(runs[0]!.rewardVsSafety);
  assert.equal(runs[0]!.runDir, `packages/world-agent/runs/sample/${ID}`);
  assert.equal(runs[1]!.worldSlug, 'broken');
  assert.ok(runs[1]!.error);
});

test('/api/runs/:slug/:id returns the detail', () => {
  const d = body<RunDetail>(`/api/runs/sample/${ID}`);
  assert.equal(d.run.id, ID);
  assert.equal(d.world.slug, 'murder-of-mike');
  assert.ok(d.metrics);
  assert.ok(d.verdict);
  assert.ok(d.pd);
  assert.ok(d.decisions.length > 0);
  assert.equal(typeof d.transcript, 'string');
  assert.equal(d.courtroomRendered, true);
});

test('/api/runs/:slug/:id/events parses events.jsonl', () => {
  const { events } = body<{ events: TrialEvent[] }>(`/api/runs/sample/${ID}/events`);
  assert.ok(events.length > 0);
  assert.equal(events[0]!.seq, 1);
  assert.equal(events[0]!.type, 'run_started');
});

test('/runs/:slug/:id/courtroom.html serves the file as html', () => {
  const r = get(`/runs/sample/${ID}/courtroom.html`);
  assert.equal(r.status, 200);
  assert.equal(r.type, 'html');
  assert.match(r.body as string, /<html/i);
});

test('a missing run 404s everywhere', () => {
  body('/api/runs/sample/20990101-000000', 404);
  body('/api/runs/sample/20990101-000000/events', 404);
  body('/runs/sample/20990101-000000/courtroom.html', 404);
  body('/api/nope', 404);
});

test('a path escape is refused', () => {
  for (const p of ['/api/runs/..%2F..%2Fetc/passwd', '/api/runs/sample/..', '/api/worlds/..%2Fworlds', '/runs/../../package.json/x/courtroom.html']) {
    const r = get(p);
    assert.equal(r.status, 404, p);
  }
});

test('non-api paths fall through to vite', () => {
  assert.equal(route('/', root), null);
  assert.equal(route('/src/main.tsx', root), null);
});
