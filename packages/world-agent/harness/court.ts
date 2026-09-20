// `court.ts <run> "<text>"` — a COURT narration line: event, transcript, memory.
// The orchestrator's only voice in the record.
import { command } from './lib/cli.ts';
import { court } from './lib/engine.ts';
import { requireRunDir } from './lib/run.ts';

await command((a) => {
  const [run, ...rest] = a.positional;
  const text = rest.join(' ');
  if (!text) throw new Error('usage: court.ts <run> "<text>"');
  return court(requireRunDir(run), text);
});
