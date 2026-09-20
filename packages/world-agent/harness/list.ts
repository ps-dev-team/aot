// `list.ts [--runs <dir>]` — every run, newest first.
// Reads run.json only; never opens the trace.
import { command } from './lib/cli.ts';
import { listRuns } from './lib/engine.ts';

await command((a) => listRuns(a.flag('runs')));
