// Run folders: where they live, how they are named, and atomic reads/writes of
// the JSON files inside them. Everything else goes through these paths.
import fs from 'node:fs';
import path from 'node:path';
import { Trial } from './trial.ts';
import type { Decision, PdRecord, RunJson, State, VerdictRecord } from './types.ts';

export const RUNS_ROOT = path.resolve(import.meta.dirname, '..', '..', 'runs');

export const files = {
  run: (d: string) => path.join(d, 'run.json'),
  world: (d: string) => path.join(d, 'world.json'),
  trial: (d: string) => path.join(d, 'trial.json'),
  state: (d: string) => path.join(d, 'state.json'),
  events: (d: string) => path.join(d, 'events.jsonl'),
  transcript: (d: string) => path.join(d, 'court', 'transcript.md'),
  memory: (d: string, id: string) => path.join(d, 'characters', id, 'memory.md'),
  decisions: (d: string) => path.join(d, 'decisions.json'),
  pd: (d: string) => path.join(d, 'pd.json'),
  verdict: (d: string) => path.join(d, 'verdict.json'),
  metrics: (d: string) => path.join(d, 'metrics.json'),
  report: (d: string) => path.join(d, 'report.md'),
};

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYYMMDD-HHMMSS`, local time. */
export function runIdFor(now: Date): string {
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/** ISO 8601 with the local offset, as the contract's examples show. */
export function localIso(now: Date = new Date()): string {
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export function shortTime(now: Date): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** Creates `runs/<slug>/<id>/` plus `court/`. Bumps the second on a collision. */
export function createRunDir(root: string, slug: string, now: Date): { runDir: string; runId: string } {
  let t = new Date(now);
  for (;;) {
    const runId = runIdFor(t);
    const runDir = path.join(root, slug, runId);
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(path.join(runDir, 'court'), { recursive: true });
      return { runDir, runId };
    }
    t = new Date(t.getTime() + 1000);
  }
}

export function requireRunDir(p: string | undefined): string {
  if (!p) throw new Error('run folder path required');
  const runDir = path.resolve(p);
  if (!fs.existsSync(files.run(runDir))) throw new Error(`not a run folder: ${runDir}`);
  return runDir;
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function readJsonIf<T>(file: string): T | null {
  return fs.existsSync(file) ? readJson<T>(file) : null;
}

/** Temp file + rename, so a reader never sees a half-written file. */
export function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export const readRun = (d: string) => readJson<RunJson>(files.run(d));
export const writeRun = (d: string, r: RunJson) => writeJsonAtomic(files.run(d), r);
export function updateRun(d: string, patch: Partial<RunJson>): RunJson {
  const r = { ...readRun(d), ...patch };
  writeRun(d, r);
  return r;
}

export const readState = (d: string) => readJson<State>(files.state(d));
export const writeTrial = (d: string, t: Trial) => writeJsonAtomic(files.trial(d), t);
export function readTrial(d: string): Trial {
  const file = files.trial(d);
  if (!fs.existsSync(file)) throw new Error(`no trial.json in ${d}; the run predates schema v2`);
  return Trial.parse(readJson<unknown>(file));
}
/** State and the mirror fields in run.json move together. */
export function writeState(d: string, s: State): void {
  writeJsonAtomic(files.state(d), s);
  updateRun(d, { trialState: s.trialState, turn: s.turn });
}

export const readDecisions = (d: string) => readJsonIf<Decision[]>(files.decisions(d)) ?? [];
export const appendDecision = (d: string, x: Decision) => writeJsonAtomic(files.decisions(d), [...readDecisions(d), x]);
export const readPd = (d: string) => readJsonIf<PdRecord>(files.pd(d));
export const writePd = (d: string, x: PdRecord) => writeJsonAtomic(files.pd(d), x);
export const readVerdict = (d: string) => readJsonIf<VerdictRecord & { at: string }>(files.verdict(d));
export const writeVerdict = (d: string, x: VerdictRecord & { at: string }) => writeJsonAtomic(files.verdict(d), x);

/** Every run folder under `root`, newest run id first. */
export function listRunDirs(root: string = RUNS_ROOT): string[] {
  if (!fs.existsSync(root)) return [];
  const dirs: string[] = [];
  for (const slug of fs.readdirSync(root, { withFileTypes: true })) {
    if (!slug.isDirectory()) continue;
    for (const id of fs.readdirSync(path.join(root, slug.name), { withFileTypes: true })) {
      const d = path.join(root, slug.name, id.name);
      if (id.isDirectory() && fs.existsSync(files.run(d))) dirs.push(d);
    }
  }
  return dirs.sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
}
