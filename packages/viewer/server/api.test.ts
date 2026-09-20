import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT, HARNESS_DIR, post, route, stream, type Reply } from './api.ts';
import type { RunData, RunDetail, RunSummary, TrialEvent, WorldSummary } from '../src/types.ts';

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

// ---- the live court ----------------------------------------------------------

test('/court returns RunData for the complete fixture', () => {
  const d = body<RunData>(`/api/runs/sample/${ID}/court`);
  assert.equal(d.run.id, ID);
  assert.ok(d.script.length > 0);
  assert.equal(d.pending, null);
  assert.equal(d.seq, 54);
  assert.ok(d.truth, 'the fixture is complete, so the truth is in');
});

test('/decide refuses a bad body and refuses when nothing is pending, before running anything', async () => {
  const p = `/api/runs/sample/${ID}/decide`;
  assert.equal((await post(p, {}, root))!.status, 400);
  assert.equal((await post(p, { gateId: 'G-01' }, root))!.status, 400);
  assert.equal((await post(p, { gateId: 'G-01', optionId: 'x', custom: 'y' }, root))!.status, 400);
  assert.equal((await post(p, { gateId: '../x', optionId: 'accept' }, root))!.status, 400);
  assert.equal((await post(p, { gateId: 'G-01', custom: 'x'.repeat(501) }, root))!.status, 400);
  const r = (await post(p, { gateId: 'G-01', optionId: 'accept' }, root))!;
  assert.equal(r.status, 409);
  assert.match((r.body as { error: string }).error, /no gate is pending/);
  assert.equal((await post(`/api/runs/sample/${ID}/verdict`, { optionId: 'accuse_optimus', confidence: 101 }, root))!.status, 400);
  assert.equal((await post(`/api/runs/sample/${ID}/verdict`, { optionId: 'accuse_optimus' }, root))!.status, 409);
  assert.equal((await post('/api/runs/sample/nope/decide', { gateId: 'G-01', optionId: 'accept' }, root))!.status, 404);
  assert.equal(await post('/other', {}, root), null);
});

const harness = (args: string[], input?: string): Record<string, unknown> =>
  JSON.parse(execFileSync('node', args, { cwd: HARNESS_DIR, input, encoding: 'utf8' }));

test('/decide runs decide.ts when the gate is pending', async () => {
  // A real run: boot the Mike example under the temp root, then walk to G-01
  // (fires after E-02 is introduced) with hand-written actions through propose.ts.
  const runsRoot = path.join(root, 'packages/world-agent/runs');
  const booted = harness(['harness/boot.ts', path.join(root, 'packages/interview-agent/examples/murder-of-mike.json'), '--runs', runsRoot, '--model', 'test']);
  const dir = booted.runDir as string;
  const say = (id: string, over: Record<string, unknown>) =>
    harness(['harness/propose.ts', dir, id, '-'], JSON.stringify({ publicMessage: 'The record will show what it shows.', rationaleSummary: 't', action: 'speak', ...over }));
  const turn = (id: string) => {
    const n = harness(['harness/next.ts', dir]);
    assert.equal(n.kind, 'turn', JSON.stringify(n));
    assert.equal(n.characterId, id);
  };
  turn('PROSECUTOR');
  const first = say('PROSECUTOR', {});
  assert.equal(first.accepted, true, JSON.stringify(first));
  turn('OPTIMUS');
  assert.equal(say('OPTIMUS', {}).accepted, true);
  turn('PROSECUTOR'); // evidence phase
  assert.equal(say('PROSECUTOR', { action: 'present_evidence', targetId: 'E-02' }).accepted, true);
  assert.equal(harness(['harness/next.ts', dir]).kind, 'gate');

  const slug = 'murder-of-mike';
  const id = path.basename(dir);
  const court = body<RunData>(`/api/runs/${slug}/${id}/court`);
  assert.deepEqual(court.pending, { kind: 'gate', gateId: 'G-01' });
  assert.equal(court.truth, undefined, 'sealed while running');

  const wrong = (await post(`/api/runs/${slug}/${id}/decide`, { gateId: 'G-02', optionId: 'examine_cookie' }, root))!;
  assert.equal(wrong.status, 409);
  const bad = (await post(`/api/runs/${slug}/${id}/decide`, { gateId: 'G-01', optionId: 'no_such_option' }, root))!;
  assert.equal(bad.status, 409, 'decide.ts rejected it');
  assert.match((bad.body as { error: string }).error, /no option/);

  const ok = (await post(`/api/runs/${slug}/${id}/decide`, { gateId: 'G-01', optionId: 'accept' }, root))!;
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const res = ok.body as { ok: boolean; override: boolean; courtLine: string };
  assert.equal(res.ok, true);
  assert.equal(res.override, true, 'accept is not the recommendation');
  assert.match(res.courtLine, /So ordered/);
  const after = body<RunData>(`/api/runs/${slug}/${id}/court`);
  assert.equal(after.pending, null);
  assert.ok(after.gates.find((g) => g.id === 'G-01')?.decided);
  assert.equal((await post(`/api/runs/${slug}/${id}/decide`, { gateId: 'G-01', optionId: 'accept' }, root))!.status, 409, 'once');
});

test('/stream sends a change after a file write and stops after close', async () => {
  const dir = path.join(root, `packages/world-agent/runs/sample/${ID}`);
  const chunks: string[] = [];
  const close = stream(dir, (c) => chunks.push(c), { debounceMs: 20, pingMs: 60 });
  assert.equal(chunks[0], ': open\n\n');
  const run = JSON.parse(readFileSync(path.join(dir, 'run.json'), 'utf8'));
  writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ ...run, turn: run.turn + 1 }));
  const until = async (pred: () => boolean, ms = 2000) => {
    const t0 = Date.now();
    while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 10));
    assert.ok(pred(), `timed out; got ${JSON.stringify(chunks)}`);
  };
  await until(() => chunks.some((c) => c.startsWith('event: change')));
  const change = chunks.find((c) => c.startsWith('event: change'))!;
  assert.deepEqual(JSON.parse(change.split('data: ')[1]!.trim()), { seq: 54, status: 'complete' });
  await until(() => chunks.includes(': ping\n\n'));
  close();
  const n = chunks.length;
  writeFileSync(path.join(dir, 'run.json'), JSON.stringify(run));
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(chunks.length, n, 'nothing after close');
});
