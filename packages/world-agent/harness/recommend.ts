// `recommend.ts <run> <gateId> --option <id> --reason "…"` — the bench's
// recommendation for a pending gate: sets it on the gate, appends gate_recommended.
import { command } from './lib/cli.ts';
import { recommend } from './lib/engine.ts';
import { requireRunDir } from './lib/run.ts';

await command((a) => {
  const [run, gateId] = a.positional;
  const option = a.flag('option');
  const reason = a.flag('reason');
  if (!gateId || !option || reason === undefined) throw new Error('usage: recommend.ts <run> <gateId> --option <id> --reason "<≤ 60 words>"');
  return recommend(requireRunDir(run), gateId, option, reason);
});
