// The one server-side piece: a Vite plugin that serves /api/* and /runs/* from
// the files the other two packages write. GET is read-only; the two POSTs run
// decide.ts / verdict.ts and write nothing themselves. Every route resolves
// under ROOT and refuses anything that escapes it. `route()` and `post()` are
// pure of the socket so the test can call them without Vite.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { World as WorldSchema } from '@aot/interview-agent/schema';
import { buildRunData, pendingOf } from '@aot/world-agent/rundata';
import type { RunDetail, RunJson, RunSummary, State, TrialEvent, World, WorldSummary } from '../src/types.ts';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/** Where decide.ts / verdict.ts live. Always the real package, whatever `root` a test passes. */
export const HARNESS_DIR = path.join(REPO_ROOT, 'packages', 'world-agent');

const EXAMPLES = 'packages/interview-agent/examples';
const WORLDS = 'packages/interview-agent/worlds';
const RUNS = 'packages/world-agent/runs';

// `_` so the gitignored `runs/_fake/<id>` (fake-clerk target) is reachable.
const SEG = /^[a-z0-9_-]+$/;

export type Reply = { status: number; body: unknown; type?: 'json' | 'html' | 'stream' };

const json = (body: unknown, status = 200): Reply => ({ status, body, type: 'json' });
const notFound = (error: string): Reply => json({ error }, 404);

/** Resolve `parts` under `root`; null when a segment is not a plain slug/id or the path escapes. */
function safe(root: string, ...parts: string[]): string | null {
  if (parts.some((p) => !SEG.test(p))) return null;
  const abs = path.resolve(root, ...parts);
  return abs === root || abs.startsWith(root + path.sep) ? abs : null;
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
// World files on disk omit schema defaults; parse so clients see the same shape validateWorld does.
const readWorld = (file: string): World => WorldSchema.parse(readJson(file));
const readText = (file: string): string | null => (existsSync(file) ? readFileSync(file, 'utf8') : null);
const dirs = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((d) => SEG.test(d) && statSync(path.join(dir, d)).isDirectory()) : [];

// ---- worlds -----------------------------------------------------------------

type WorldFile = { slug: string; file: string; rel: string; source: WorldSummary['source']; world: World };

/** Every world file, `worlds/` winning over `examples/` on the same slug. Drafts and unparsable files are skipped. */
function worldFiles(root: string): Map<string, WorldFile> {
  const out = new Map<string, WorldFile>();
  const scan = (rel: string, source: WorldSummary['source']) => {
    const dir = path.join(root, rel);
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json') || name.endsWith('.draft.json')) continue;
      const file = path.join(dir, name);
      try {
        const world = readWorld(file);
        if (typeof world.slug === 'string') out.set(world.slug, { slug: world.slug, file, rel: `${rel}/${name}`, source, world });
      } catch {
        // a half-written file in worlds/ must not take the docket down
      }
    }
  };
  scan(EXAMPLES, 'example');
  scan(WORLDS, 'world');
  return out;
}

// ---- runs -------------------------------------------------------------------

/** Run folders newest first: runs/<slug>/<id>, id is YYYYMMDD-HHMMSS so string order is time order. */
function runDirs(root: string): { slug: string; id: string; dir: string }[] {
  const base = path.join(root, RUNS);
  return dirs(base)
    .flatMap((slug) => dirs(path.join(base, slug)).map((id) => ({ slug, id, dir: path.join(base, slug, id) })))
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : a.slug.localeCompare(b.slug)));
}

function runSummary(slug: string, id: string, dir: string): RunSummary {
  const rel = `${RUNS}/${slug}/${id}`;
  try {
    const run = readJson<RunJson>(path.join(dir, 'run.json'));
    const metricsFile = path.join(dir, 'metrics.json');
    const metrics = existsSync(metricsFile) ? readJson<NonNullable<RunDetail['metrics']>>(metricsFile) : null;
    return {
      id: run.id,
      worldSlug: run.worldSlug,
      worldTitle: run.worldTitle,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      status: run.status,
      trialState: run.trialState,
      turn: run.turn,
      model: run.model,
      verdict: run.verdict,
      runDir: rel,
      overall: metrics?.overall ?? null,
      rewardVsSafety: metrics?.rewardVsSafety ?? null,
    };
  } catch (e) {
    return {
      id,
      worldSlug: slug,
      worldTitle: slug,
      startedAt: '',
      finishedAt: null,
      status: 'failed',
      trialState: 'opening',
      turn: 0,
      model: '',
      verdict: null,
      runDir: rel,
      overall: null,
      rewardVsSafety: null,
      error: (e as Error).message,
    };
  }
}

function runDetail(dir: string): RunDetail {
  const opt = <T>(name: string): T | null => {
    const f = path.join(dir, name);
    return existsSync(f) ? readJson<T>(f) : null;
  };
  const memories: Record<string, string> = {};
  for (const id of charDirs(dir)) {
    const m = readText(path.join(dir, 'characters', id, 'memory.md'));
    if (m !== null) memories[id] = m;
  }
  return {
    run: readJson<RunJson>(path.join(dir, 'run.json')),
    world: readWorld(path.join(dir, 'world.json')),
    trial: opt('trial.json'),
    state: opt('state.json'),
    decisions: opt<RunDetail['decisions']>('decisions.json') ?? [],
    pd: opt('pd.json'),
    verdict: opt('verdict.json'),
    metrics: opt('metrics.json'),
    report: readText(path.join(dir, 'report.md')),
    transcript: readText(path.join(dir, 'court', 'transcript.md')),
    memories,
    courtroomRendered: existsSync(path.join(dir, 'courtroom.html')),
  };
}

// The characters dir lists ids in UPPER_SNAKE, which `dirs` rejects; read it separately.
function charDirs(dir: string): string[] {
  const d = path.join(dir, 'characters');
  return existsSync(d) ? readdirSync(d).filter((x) => /^[A-Z][A-Z0-9_]{1,23}$/.test(x) && statSync(path.join(d, x)).isDirectory()) : [];
}

function events(dir: string): TrialEvent[] {
  const text = readText(path.join(dir, 'events.jsonl')) ?? '';
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as TrialEvent);
}

// ---- routing ----------------------------------------------------------------

/** Pure: pathname → reply. `root` is the repo root; the test passes a temp one. */
export function route(pathname: string, root = REPO_ROOT): Reply | null {
  const parts = pathname.split('/').filter(Boolean);
  const [head] = parts;
  if (head !== 'api' && head !== 'runs') return null;

  try {
    if (head === 'runs') {
      // /runs/:slug/:id/courtroom.html
      const [, slug = '', id = '', file] = parts;
      if (parts.length !== 4 || file !== 'courtroom.html') return notFound('not found');
      const dir = safe(path.join(root, RUNS), slug, id);
      if (!dir || !existsSync(path.join(dir, 'run.json'))) return notFound('no such run');
      const html = readText(path.join(dir, 'courtroom.html'));
      if (html === null) return notFound('not rendered — node harness/render.ts <run>');
      return { status: 200, body: html, type: 'html' };
    }

    const [, kind, a, b, c] = parts;
    if (kind === 'worlds') {
      const worlds = worldFiles(root);
      if (parts.length === 2) {
        const runsBySlug = new Map<string, number>();
        for (const r of runDirs(root)) runsBySlug.set(r.slug, (runsBySlug.get(r.slug) ?? 0) + 1);
        const list: WorldSummary[] = [...worlds.values()]
          .map(({ slug, rel, source, world }) => ({
            slug,
            title: world.title,
            logline: world.logline,
            source,
            path: rel,
            characters: world.characters.length,
            evidence: world.evidence.length,
            runs: runsBySlug.get(slug) ?? 0,
          }))
          .sort((x, y) => x.title.localeCompare(y.title));
        return json({ worlds: list });
      }
      if (parts.length === 3 && a && SEG.test(a)) {
        const w = worlds.get(a);
        return w ? json(w.world) : notFound('no such world');
      }
      return notFound('not found');
    }

    if (kind === 'runs') {
      if (parts.length === 2) return json({ runs: runDirs(root).map((r) => runSummary(r.slug, r.id, r.dir)) });
      if (parts.length === 4 || (parts.length === 5 && c && ['events', 'court', 'stream'].includes(c))) {
        const dir = safe(path.join(root, RUNS), a ?? '', b ?? '');
        if (!dir || !existsSync(path.join(dir, 'run.json'))) return notFound('no such run');
        if (c === 'events') return json({ events: events(dir) });
        if (c === 'court') return json(buildRunData(dir));
        // The stream is the one long-lived response; `handle` opens it from the dir.
        if (c === 'stream') return { status: 200, body: dir, type: 'stream' };
        return json(runDetail(dir));
      }
      return notFound('not found');
    }

    return notFound('not found');
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

// ---- live: stream + the two POSTs -------------------------------------------

const lastSeq = (dir: string): number => {
  const lines = (readText(path.join(dir, 'events.jsonl')) ?? '').trimEnd().split('\n');
  const last = lines.at(-1);
  if (!last) return 0;
  try {
    return Number((JSON.parse(last) as TrialEvent).seq) || 0;
  } catch {
    return 0; // a line still being written; the next change will carry it
  }
};

const runStatus = (dir: string): string => {
  try {
    return readJson<RunJson>(path.join(dir, 'run.json')).status;
  } catch {
    return 'unknown';
  }
};

/**
 * Server-sent events for one run folder: `event: change` with `{ seq, status }`
 * on every file change (debounced), `: ping` every `pingMs`. Returns close().
 * `write` receives raw SSE text so a test can collect it without a socket.
 */
export function stream(dir: string, write: (chunk: string) => void, opts: { debounceMs?: number; pingMs?: number } = {}): () => void {
  const debounceMs = opts.debounceMs ?? 300;
  const pingMs = opts.pingMs ?? 15_000;
  let timer: NodeJS.Timeout | null = null;
  const send = () => {
    timer = null;
    write(`event: change\ndata: ${JSON.stringify({ seq: lastSeq(dir), status: runStatus(dir) })}\n\n`);
  };
  // Recursive so court/transcript.md and characters/*/memory.md count too; the harness writes them per turn.
  const watcher = watch(dir, { recursive: true }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(send, debounceMs);
  });
  watcher.on('error', () => close());
  const ping = setInterval(() => write(': ping\n\n'), pingMs);
  write(': open\n\n');
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    clearInterval(ping);
    watcher.close();
  }
  return close;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
export const BODY_LIMIT = 4096;

type PostBody = Record<string, unknown>;

/** Runs a harness command, never a shell; resolves to its JSON and whether it exited 0. */
function harness(args: string[]): Promise<{ ok: boolean; body: unknown }> {
  return new Promise((resolve) => {
    execFile('node', args, { cwd: HARNESS_DIR, timeout: 60_000, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      // Every harness command prints exactly one (pretty) JSON object on stdout.
      let body: unknown;
      try {
        body = JSON.parse(stdout.trim());
      } catch {
        body = { error: (stderr || err?.message || 'harness command produced no JSON').trim().slice(0, 500) };
        return resolve({ ok: false, body });
      }
      resolve({ ok: !err, body });
    });
  });
}

/** POST handlers. Validates, refuses when `pending` does not match (409), then runs decide.ts / verdict.ts. */
export async function post(pathname: string, body: PostBody, root = REPO_ROOT): Promise<Reply | null> {
  const parts = pathname.split('/').filter(Boolean);
  const [head, kind, slug = '', id = '', action] = parts;
  if (head !== 'api' || kind !== 'runs') return null;
  if (parts.length !== 5 || (action !== 'decide' && action !== 'verdict')) return notFound('not found');
  const dir = safe(path.join(root, RUNS), slug, id);
  if (!dir || !existsSync(path.join(dir, 'run.json'))) return notFound('no such run');

  const refuse = (error: string, status = 400): Reply => json({ error }, status);
  let state: State | undefined;
  try {
    state = existsSync(path.join(dir, 'state.json')) ? readJson<State>(path.join(dir, 'state.json')) : undefined;
  } catch {
    return refuse('state.json is unreadable', 409);
  }
  const pending = pendingOf(state);

  if (action === 'decide') {
    const gateId = body.gateId;
    const optionId = body.optionId;
    const custom = body.custom;
    if (typeof gateId !== 'string' || !ID.test(gateId)) return refuse('gateId required');
    if (optionId !== undefined && (typeof optionId !== 'string' || !ID.test(optionId))) return refuse('optionId must be an id');
    if (custom !== undefined && (typeof custom !== 'string' || !custom.trim() || custom.length > 500)) return refuse('custom must be 1–500 characters');
    if ((optionId === undefined) === (custom === undefined)) return refuse('exactly one of optionId or custom');
    if (pending?.kind !== 'gate') return refuse('no gate is pending', 409);
    if (pending.gateId !== gateId) return refuse(`gate ${gateId} is not pending (${pending.gateId} is)`, 409);
    const r = await harness(['harness/decide.ts', dir, gateId, ...(optionId !== undefined ? ['--option', optionId] : ['--custom', custom as string])]);
    return json(r.body, r.ok ? 200 : 409);
  }

  const optionId = body.optionId;
  const confidence = body.confidence;
  if (typeof optionId !== 'string' || !ID.test(optionId)) return refuse('optionId required');
  if (confidence !== undefined && (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100))
    return refuse('confidence must be a number 0–100');
  if (pending?.kind !== 'verdict') return refuse('the court is not awaiting a verdict', 409);
  const r = await harness(['harness/verdict.ts', dir, '--option', optionId, ...(confidence !== undefined ? ['--confidence', String(confidence)] : [])]);
  // verdict.ts answers with { correct, truthAnswer }; the browser must not see that before the reveal.
  return r.ok ? json({ ok: true }) : json(r.body, 409);
}

/** Reads a JSON body up to BODY_LIMIT bytes; rejects with a Reply on anything else. */
function readBody(req: IncomingMessage): Promise<PostBody | Reply> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    // Keep draining past the cap so the 413 can be sent on a live socket.
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size <= BODY_LIMIT) chunks.push(c);
    });
    req.on('end', () => {
      if (size > BODY_LIMIT) return resolve(json({ error: `body over ${BODY_LIMIT} bytes` }, 413));
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
        resolve(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as PostBody) : json({ error: 'body must be a JSON object' }, 400));
      } catch {
        resolve(json({ error: 'body is not JSON' }, 400));
      }
    });
    req.on('error', () => resolve(json({ error: 'body read failed' }, 400)));
  });
}

function send(res: ServerResponse, reply: Reply): void {
  res.statusCode = reply.status;
  if (reply.type === 'html') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(reply.body as string);
  } else {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(reply.body));
  }
}

/** Node handler: answers /api and /runs requests, falls through to Vite for the rest. */
export function handle(req: IncomingMessage, res: ServerResponse, next: () => void, root = REPO_ROOT): void {
  const pathname = new URL(req.url ?? '/', 'http://x').pathname;
  if (req.method === 'POST') {
    if (!pathname.startsWith('/api/')) return next();
    void readBody(req).then(async (body) => {
      if ('status' in body && 'body' in body && typeof body.status === 'number') return send(res, body as Reply);
      const reply = await post(pathname, body as PostBody, root);
      send(res, reply ?? notFound('not found'));
    });
    return;
  }
  if (req.method !== 'GET') return next();
  const reply = route(pathname, root);
  if (!reply) return next();
  if (reply.type === 'stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const close = stream(reply.body as string, (chunk) => res.write(chunk));
    req.on('close', close);
    res.on('close', close);
    return;
  }
  send(res, reply);
}

export function api(root = REPO_ROOT): Plugin {
  return {
    name: 'aot-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => handle(req, res, next, root));
    },
  };
}
