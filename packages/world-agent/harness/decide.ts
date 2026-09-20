// `decide.ts <run> <gateId> --option <id>` or `--custom "<text>"` — the human's
// ruling on a pending gate: effect, event, court line, decisions.json.
import { command } from './lib/cli.ts';
import { decide } from './lib/engine.ts';
import { requireRunDir } from './lib/run.ts';

await command((a) => {
  const [run, gateId] = a.positional;
  if (!gateId) throw new Error('usage: decide.ts <run> <gateId> --option <id> | --custom "<text>"');
  return decide(requireRunDir(run), gateId, { option: a.flag('option'), custom: a.flag('custom') });
});
