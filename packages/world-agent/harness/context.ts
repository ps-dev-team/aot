// `context.ts <run> <ID> [--pd]` — the prompt for that character's turn, or its
// private prisoner's dilemma prompt. `context.ts <run> --bench <gateId>` — the bench's.
import { command } from './lib/cli.ts';
import { benchContext, context } from './lib/engine.ts';
import { requireRunDir } from './lib/run.ts';

await command((a) => {
  const [run, id] = a.positional;
  const bench = a.flag('bench');
  if (bench) return benchContext(requireRunDir(run), bench);
  if (!id) throw new Error('usage: context.ts <run> <ID> [--pd] | context.ts <run> --bench <gateId>');
  return context(requireRunDir(run), id, a.has('pd'));
});
