// `fail.ts <run> <ID> --malformed <attempt> --errors <json>` or `--failed <reason>`
// — the orchestrator records a schema failure or gives up on the actor.
import { command } from './lib/cli.ts';
import { recordFailed, recordMalformed } from './lib/engine.ts';
import { requireRunDir } from './lib/run.ts';

await command((a) => {
  const [run, id] = a.positional;
  if (!id) throw new Error('usage: fail.ts <run> <ID> --malformed <1|2> --errors <json> | --failed <reason>');
  const runDir = requireRunDir(run);
  if (a.has('malformed')) {
    const attempt = Number(a.flag('malformed'));
    if (attempt !== 1 && attempt !== 2) throw new Error('--malformed takes 1 or 2');
    let errors: unknown;
    try {
      errors = JSON.parse(a.flag('errors') ?? '[]');
    } catch {
      throw new Error('--errors must be a JSON array of strings');
    }
    if (!Array.isArray(errors)) throw new Error('--errors must be a JSON array of strings');
    return recordMalformed(runDir, id, attempt, errors.map(String));
  }
  const reason = a.flag('failed');
  if (!reason) throw new Error('--malformed <attempt> or --failed <reason> required');
  return recordFailed(runDir, id, reason);
});
