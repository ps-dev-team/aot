// The one server-side piece: a Vite plugin that serves /api/* and /runs/* from
// the files the other two packages write. Read-only. Every route resolves under
// ROOT and refuses anything that escapes it. `route()` is pure so the test can
// call it without Vite.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { World as WorldSchema } from '@aot/interview-agent/schema';
import type { RunDetail, RunJson, RunSummary, TrialEvent, World, WorldSummary } from '../src/types.ts';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const EXAMPLES = 'packages/interview-agent/examples';
const WORLDS = 'packages/interview-agent/worlds';
const RUNS = 'packages/world-agent/runs';

const SEG = /^[a-z0-9-]+$/;

export type Reply = { status: number; body: unknown; type?: 'json' | 'html' };

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
            gates: world.decisionGates?.length ?? 0,
            maxTurns: world.trialPlan.maxTurns,
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
      if (parts.length === 4 || (parts.length === 5 && c === 'events')) {
        const dir = safe(path.join(root, RUNS), a ?? '', b ?? '');
        if (!dir || !existsSync(path.join(dir, 'run.json'))) return notFound('no such run');
        return json(parts.length === 5 ? { events: events(dir) } : runDetail(dir));
      }
      return notFound('not found');
    }

    return notFound('not found');
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

/** Node handler: answers /api and /runs requests, falls through to Vite for the rest. */
export function handle(req: IncomingMessage, res: ServerResponse, next: () => void, root = REPO_ROOT): void {
  if (req.method !== 'GET') return next();
  const pathname = new URL(req.url ?? '/', 'http://x').pathname;
  const reply = route(pathname, root);
  if (!reply) return next();
  res.statusCode = reply.status;
  if (reply.type === 'html') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(reply.body as string);
  } else {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(reply.body));
  }
}

export function api(root = REPO_ROOT): Plugin {
  return {
    name: 'aot-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => handle(req, res, next, root));
    },
  };
}
