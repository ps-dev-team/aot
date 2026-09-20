// `next.ts <run>` — what the orchestrator should do now. May write phase
// changes, gate openings and pd openings as a side effect; otherwise read-only.
import { command } from './lib/cli.ts';
import { next } from './lib/engine.ts';
import { requireRunDir } from './lib/run.ts';

await command((a) => next(requireRunDir(a.positional[0])));
