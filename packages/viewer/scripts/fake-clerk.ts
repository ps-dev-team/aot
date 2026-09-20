// `fake-clerk.ts <fixtureRun> <targetRun> [--every ms]` — plays a recorded run
// back into a fresh run folder as if a clerk were running it, so the live court
// can be tried without Claude. Boots the fixture's world with the real
// `boot.ts` (which derives trial.json), then appends the fixture's events one
// at a time. At a gate it puts the raised gate into state, sets the run to
// `awaiting_gate`, replays the bench's advice through `recommend.ts` about 2 s
// later, and waits for `decisions.json` to grow; at the verdict it waits for
// `verdict.json`; then it runs `evaluate.ts`. Rulings, advice and the verdict
// therefore go through the real commands.
//
// The target must be under `packages/world-agent/runs/_fake/` (gitignored) or
// the OS temp dir. It is wiped first.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { RunJson, State, TrialEvent } from '@aot/world-agent/types';
import type { RaisedGate } from '../src/types.ts';

const run = promisify(execFile);
const WORLD_AGENT = path.resolve(import.meta.dirname, '..', '..', 'world-agent');
const FAKE_ROOT = path.join(WORLD_AGENT, 'runs', '_fake');

const args = process.argv.slice(2);
const every = Number(args.includes('--every') ? args[args.indexOf('--every') + 1] : 2000);
// How long the bench "considers" before recommend.ts lands (--advice ms). The
// page replays with a typewriter, so a short delay usually lands before the
// modal opens; raise it to watch the advice arrive.
const ADVICE_DELAY = Number(args.includes('--advice') ? args[args.indexOf('--advice') + 1] : 2000);
const [fixtureArg, targetArg] = args.filter(
  (a, i) => !a.startsWith('--') && args[i - 1] !== '--every' && args[i - 1] !== '--advice',
);
if (!fixtureArg || !targetArg || Number.isNaN(every)) {
  console.error('usage: fake-clerk.ts <fixtureRun> <targetRun> [--every ms] [--advice ms]');
  process.exit(2);
}
const fixture = path.resolve(fixtureArg);
const target = path.resolve(targetArg);

const under = (p: string, root: string) => {
  const r = fs.existsSync(root) ? fs.realpathSync(root) : root;
  return p === r || p.startsWith(r + path.sep);
};
if (!under(target, FAKE_ROOT) && !under(target, os.tmpdir())) {
  console.error(`refusing: target must be under ${FAKE_ROOT} or ${os.tmpdir()}`);
  process.exit(2);
}
if (!fs.existsSync(path.join(fixture, 'events.jsonl'))) {
  console.error(`not a run folder: ${fixture}`);
  process.exit(2);
}

const say = (s: string) => console.error(`[fake-clerk] ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const readJson = <T>(f: string): T => JSON.parse(fs.readFileSync(f, 'utf8')) as T;
// Temp + rename, like the harness, so the viewer never reads a half-written file.
const writeJson = (f: string, v: unknown) => {
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2) + '\n');
  fs.renameSync(tmp, f);
};

async function harness(cmd: string, ...a: string[]): Promise<Record<string, unknown>> {
  const { stdout } = await run('node', [`harness/${cmd}.ts`, ...a], { cwd: WORLD_AGENT });
  return JSON.parse(stdout) as Record<string, unknown>;
}

/** The gate as the harness raised it: the whole object rides in the gate_opened payload. */
function gateFrom(ev: TrialEvent): RaisedGate {
  const p = ev.payload;
  const g = (p.gate && typeof p.gate === 'object' ? p.gate : p) as Partial<RaisedGate> & {
    gateId?: string;
  };
  return {
    id: g.id ?? g.gateId ?? String(p.gateId),
    question: g.question ?? '',
    context: g.context ?? '',
    options: g.options ?? [],
    recommendation: null,
    recommendationReason: null,
    allowCustomInstruction: g.allowCustomInstruction ?? true,
    raisedBy: g.raisedBy ?? { kind: 'examination', turn: ev.turn },
    trialState: g.trialState ?? ev.trialState,
  };
}

// ---- boot --------------------------------------------------------------------

const events = fs
  .readFileSync(path.join(fixture, 'events.jsonl'), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as TrialEvent);

fs.rmSync(target, { recursive: true, force: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-clerk-'));
const booted = await harness('boot', path.join(fixture, 'world.json'), '--runs', scratch);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(booted.runDir as string, target, { recursive: true });
fs.rmSync(scratch, { recursive: true, force: true });

const runFile = path.join(target, 'run.json');
const stateFile = path.join(target, 'state.json');
const eventsFile = path.join(target, 'events.jsonl');
const decisionsFile = path.join(target, 'decisions.json');
const verdictFile = path.join(target, 'verdict.json');

// The fixture's run.json, reset to the start; the id follows the folder so the
// viewer's links resolve.
const fixtureRun = readJson<RunJson>(path.join(fixture, 'run.json'));
writeJson(runFile, {
  ...fixtureRun,
  id: path.basename(target),
  status: 'running',
  trialState: 'opening',
  turn: 0,
  startedAt: readJson<RunJson>(runFile).startedAt,
  finishedAt: null,
  verdict: null,
  metricsSummary: null,
} satisfies RunJson);
fs.writeFileSync(eventsFile, '');
say(`booted ${target} — playing ${events.length} events every ${every} ms`);
say(
  `court: http://localhost:5173/#/court/${path.basename(path.dirname(target))}/${path.basename(target)}`,
);

// ---- replay ------------------------------------------------------------------

let seq = 0;
// Advice timers still running when the judge has already ruled; drained before evaluate.
const pendingAdvice: Promise<unknown>[] = [];
const patchRun = (p: Partial<RunJson>) =>
  writeJson(runFile, { ...readJson<RunJson>(runFile), ...p });
const patchState = (p: Partial<State>) => {
  const s = { ...readJson<State>(stateFile), ...p };
  writeJson(stateFile, s);
  patchRun({ trialState: s.trialState, turn: s.turn });
};
const append = (ev: TrialEvent) => {
  seq += 1;
  const line = { ...ev, seq, at: new Date().toISOString() };
  fs.appendFileSync(eventsFile, JSON.stringify(line) + '\n');
  say(
    `+${seq} ${ev.type}${ev.actorId ? ` ${ev.actorId}` : ''} (${ev.trialState}, turn ${ev.turn})`,
  );
};
/** Who speaks next in the fixture, so the court shows "<actor> is thinking". */
const nextActor = (from: number) =>
  events.slice(from).find((e) => e.type.startsWith('turn_'))?.actorId ?? null;
const waitFor = async (what: string, done: () => boolean) => {
  say(`waiting for ${what} (decide in the browser)`);
  while (!done()) await sleep(500);
  say(`${what} received`);
};
const decisionsCount = () =>
  fs.existsSync(decisionsFile) ? readJson<unknown[]>(decisionsFile).length : 0;

for (let i = 0; i < events.length; i++) {
  const ev = events[i]!;

  // Written by recommend.ts / decide.ts when the bench advises and the browser
  // rules: skip the fixture's copies (the ruling's court line and the evidence
  // moves it caused are the command's, recognisable by their text and `by`).
  if (ev.type === 'gate_recommended' || ev.type === 'gate_decided' || ev.type === 'turn_struck')
    continue;
  if (
    ev.type === 'evidence_status' &&
    typeof ev.payload.by === 'string' &&
    ev.payload.by.startsWith('G-')
  )
    continue;
  if (
    ev.type === 'court' &&
    /^(The court (rules|directs)\b|The examiner['’]s report)/.test(String(ev.payload.text))
  )
    continue;

  if (ev.type === 'gate_opened') {
    const gate = gateFrom(ev);
    const st = readJson<State & { gates?: RaisedGate[] }>(stateFile);
    patchState({
      gates: [...(st.gates ?? []), gate],
      pendingGate: gate.id,
      trialState: ev.trialState,
      turn: ev.turn,
      expectedActor: null,
    });
    append(ev);
    // next.ts announces the question right after opening the gate; keep that order.
    if (
      events[i + 1]?.type === 'court' &&
      /^The court will hear the parties/.test(String(events[i + 1]!.payload.text))
    )
      append(events[++i]!);
    patchRun({ status: 'awaiting_gate' });
    const before = decisionsCount();
    // The bench's advice from the fixture, delivered late so the "considering…"
    // slot shows; skipped if the judge has already ruled.
    const advice = events
      .slice(i + 1)
      .find((e) => e.type === 'gate_recommended' && e.payload.gateId === gate.id);
    const adviseLater = advice
      ? sleep(ADVICE_DELAY).then(async () => {
          if (decisionsCount() > before)
            return say(`bench advice on ${gate.id} skipped — already ruled`);
          try {
            await harness(
              'recommend',
              target,
              gate.id,
              '--option',
              String(advice.payload.optionId),
              '--reason',
              String(advice.payload.reason ?? ''),
            );
            say(`bench advised ${advice.payload.optionId} on ${gate.id}`);
          } catch (e) {
            say(`recommend.ts failed on ${gate.id}: ${(e as Error).message.split('\n')[0]}`);
          }
        })
      : Promise.resolve();
    pendingAdvice.push(adviseLater);
    await waitFor(`ruling on ${gate.id}`, () => decisionsCount() > before);
    // decide.ts has re-read and rewritten state; take its version and carry on.
    seq = lastSeq();
    continue;
  }

  if (ev.type === 'verdict') {
    patchState({ trialState: 'verdict', turn: ev.turn, expectedActor: null });
    patchRun({ status: 'awaiting_verdict' });
    await waitFor('the verdict', () => fs.existsSync(verdictFile));
    break; // verdict.ts and evaluate.ts write the rest
  }

  await sleep(every);
  patchState({
    trialState:
      ev.type === 'phase_changed' ? (ev.payload.to as State['trialState']) : ev.trialState,
    turn: ev.turn,
    expectedActor: nextActor(i + 1),
    ...(ev.type === 'pd_opened' ? { pdPending: true, pdOpened: true } : {}),
    ...(ev.type === 'pd_resolved' ? { pdPending: false, pdDone: true } : {}),
  });
  append(ev);
  // pd.ts would have written pd.json; the fixture's copy stands in for it.
  if (ev.type === 'pd_resolved' && fs.existsSync(path.join(fixture, 'pd.json')))
    fs.copyFileSync(path.join(fixture, 'pd.json'), path.join(target, 'pd.json'));
}

await Promise.all(pendingAdvice);
say('evaluating');
await harness('evaluate', target);
await harness('render', target);
say(`complete — ${target}`);

function lastSeq(): number {
  const text = fs.readFileSync(eventsFile, 'utf8').trimEnd();
  return text ? (JSON.parse(text.slice(text.lastIndexOf('\n') + 1)) as TrialEvent).seq : 0;
}
