// `boot.ts <world.json> [--model name] [--turns n] [--runs <dir>]` — validates the
// world, derives the trial, creates the run folder and writes everything a run starts with.
import { command } from './lib/cli.ts';
import { boot } from './lib/engine.ts';

await command((a) => {
  const file = a.positional[0];
  if (!file) throw new Error('usage: boot.ts <world.json> [--model name] [--turns n] [--runs <dir>]');
  const turns = a.flag('turns');
  if (turns !== undefined && !/^\d+$/.test(turns)) throw new Error('--turns takes a whole number');
  return boot(file, { model: a.flag('model'), runsRoot: a.flag('runs'), turns: turns === undefined ? undefined : Number(turns) });
});
