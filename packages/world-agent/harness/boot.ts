// `boot.ts <world.json> [--model name] [--runs <dir>]` — validates the world,
// creates the run folder and writes everything a run starts with.
import { command } from './lib/cli.ts';
import { boot } from './lib/engine.ts';

await command((a) => {
  const file = a.positional[0];
  if (!file) throw new Error('usage: boot.ts <world.json> [--model name] [--runs <dir>]');
  return boot(file, { model: a.flag('model'), runsRoot: a.flag('runs') });
});
