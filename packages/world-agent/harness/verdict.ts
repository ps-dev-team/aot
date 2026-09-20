// `verdict.ts <run> --option <id> [--confidence 0-100]` — locks the human
// verdict and moves the run to reveal.
import { command } from './lib/cli.ts';
import { lockVerdict } from './lib/engine.ts';
import { requireRunDir } from './lib/run.ts';

await command((a) => {
  const option = a.flag('option');
  if (!option) throw new Error('usage: verdict.ts <run> --option <id> [--confidence 0-100]');
  const conf = a.flag('confidence');
  return lockVerdict(requireRunDir(a.positional[0]), option, conf === undefined ? null : Number(conf));
});
