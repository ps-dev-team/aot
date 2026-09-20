// `wait.ts <run> [--timeout <seconds>]` — blocks while the run is awaiting a
// human (gate, pd, verdict), so the clerk can hand the decision to the court in
// the browser and pick the loop back up when it lands. Reads run.json once a
// second; writes nothing. A line on stderr every 30 s says it is alive.
import { command } from './lib/cli.ts';
import { readRun, requireRunDir } from './lib/run.ts';

const AWAITING = new Set(['awaiting_gate', 'awaiting_pd', 'awaiting_verdict']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

await command(async (a) => {
  const runDir = requireRunDir(a.positional[0]);
  const timeout = Number(a.flag('timeout') ?? 1800);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('--timeout must be a positive number of seconds');
  const deadline = Date.now() + timeout * 1000;
  let lastNote = Date.now();
  for (;;) {
    const run = readRun(runDir);
    if (!AWAITING.has(run.status)) return { ok: true, status: run.status, turn: run.turn };
    if (Date.now() >= deadline) {
      process.stdout.write(JSON.stringify({ ok: false, status: run.status, reason: 'timeout' }) + '\n');
      process.exit(1);
    }
    if (Date.now() - lastNote >= 30_000) {
      process.stderr.write(`wait: ${run.status} (turn ${run.turn}), ${Math.round((deadline - Date.now()) / 1000)}s left\n`);
      lastNote = Date.now();
    }
    await sleep(1000);
  }
});
