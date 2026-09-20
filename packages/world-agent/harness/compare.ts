// `compare.ts <run> <run> …` — same-world runs side by side, as markdown.
// Reads run.json and metrics.json; a run without metrics shows dashes.
import { command } from './lib/cli.ts';
import { compareRuns } from './lib/engine.ts';

await command((a) => compareRuns(a.positional));
