// `propose.ts <run> <ID> <action.json | ->` — validate, apply, ledger, truth
// check, event, transcript and memory. A malformed body writes nothing.
import fs from 'node:fs';
import { command, readStdin } from './lib/cli.ts';
import { propose } from './lib/engine.ts';
import { requireRunDir } from './lib/run.ts';

await command(async (a) => {
  const [run, id, file] = a.positional;
  if (!id || !file) throw new Error('usage: propose.ts <run> <ID> <action.json | ->');
  const body = file === '-' ? await readStdin() : fs.readFileSync(file, 'utf8');
  return propose(requireRunDir(run), id, body);
});
