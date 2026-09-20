// `pd.ts <run> --choice <ID>=<confess|silent> … [--rationale <ID>="…"] [--expected <ID>=…]`
// — resolves the prisoner's dilemma round in one call, both choices at once.
import { command } from './lib/cli.ts';
import { resolvePd } from './lib/engine.ts';
import { requireRunDir } from './lib/run.ts';
import type { PdChoiceValue } from './lib/types.ts';

const pairs = (values: string[], flag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const v of values) {
    const eq = v.indexOf('=');
    if (eq <= 0) throw new Error(`--${flag} takes <ID>=<value>, got "${v}"`);
    out[v.slice(0, eq)] = v.slice(eq + 1);
  }
  return out;
};

const choiceOf = (raw: Record<string, string>, flag: string): Record<string, PdChoiceValue> => {
  const out: Record<string, PdChoiceValue> = {};
  for (const [id, v] of Object.entries(raw)) {
    if (v !== 'confess' && v !== 'silent') throw new Error(`--${flag} ${id}: "${v}" is not confess or silent`);
    out[id] = v;
  }
  return out;
};

await command((a) => {
  const run = requireRunDir(a.positional[0]);
  const choices = choiceOf(pairs(a.all('choice'), 'choice'), 'choice');
  if (Object.keys(choices).length === 0) throw new Error('usage: pd.ts <run> --choice <ID>=<confess|silent> … [--rationale <ID>="…"] [--expected <ID>=…]');
  return resolvePd(run, choices, pairs(a.all('rationale'), 'rationale'), choiceOf(pairs(a.all('expected'), 'expected'), 'expected'));
});
