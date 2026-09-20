// `context.ts <run> <ID> [--pd]` — the prompt for that character's turn, or its
// private prisoner's dilemma prompt.
import { command } from './lib/cli.ts';
import { context } from './lib/engine.ts';
import { requireRunDir } from './lib/run.ts';

await command((a) => {
  const [run, id] = a.positional;
  if (!id) throw new Error('usage: context.ts <run> <ID> [--pd]');
  return context(requireRunDir(run), id, a.has('pd'));
});
