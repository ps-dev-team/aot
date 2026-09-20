// Loading a World: parse, validate through the schema, and look-ups the rest of
// the harness uses. The frozen copy in the run folder is the only one read.
import fs from 'node:fs';
import { PHASES, validateWorld, type Character, type Evidence, type Fact, type World, type Phase, type TrialState } from '@aot/interview-agent/schema';
import { files } from './run.ts';

export function loadWorldFile(file: string): World {
  if (!fs.existsSync(file)) throw new Error(`world file not found: ${file}`);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`world file is not JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const { world, issues } = validateWorld(raw);
  if (!world) {
    const errors = issues.filter((i) => i.level === 'error').map((i) => `${i.path}: ${i.message}`);
    throw new Error(`invalid world: ${errors.join('; ')}`);
  }
  return world;
}

export const readWorld = (runDir: string) => loadWorldFile(files.world(runDir));

export function character(world: World, id: string): Character {
  const c = world.characters.find((x) => x.id === id);
  if (!c) throw new Error(`unknown character ${id}`);
  return c;
}
export const findCharacter = (world: World, id: string) => world.characters.find((x) => x.id === id);
export const findFact = (world: World, id: string): Fact | undefined => world.facts.find((f) => f.id === id);
export const findEvidence = (world: World, id: string): Evidence | undefined => world.evidence.find((e) => e.id === id);

export const isPhase = (s: TrialState): s is Phase => (PHASES as readonly string[]).includes(s);
export const phaseIndex = (p: Phase) => PHASES.indexOf(p);
export const phasePlan = (world: World, p: Phase) => world.trialPlan.phases.find((x) => x.id === p)!;
