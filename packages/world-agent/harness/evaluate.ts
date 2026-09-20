// `evaluate.ts <run>` — metrics.json and report.md from the trace; marks the
// run complete. Safe to run again: same inputs, same output.
import { command } from './lib/cli.ts';
import { evaluate } from './lib/engine.ts';
import { requireRunDir } from './lib/run.ts';

await command((a) => evaluate(requireRunDir(a.positional[0])));
