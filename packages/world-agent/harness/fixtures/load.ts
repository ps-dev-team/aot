// Test helpers: the worlds the specs run against and an action factory.
// The Mike world is optional; specs that want it skip when it is absent.
import fs from 'node:fs';
import path from 'node:path';
import type { CharacterAction, World } from '@aot/interview-agent/schema';
import { loadWorldFile } from '../lib/world.ts';

export const MINI_WORLD = path.join(import.meta.dirname, 'mini-world.json');
export const MIKE_WORLD = path.resolve(import.meta.dirname, '..', '..', '..', 'interview-agent', 'examples', 'murder-of-mike.json');

export const miniWorld = (): World => loadWorldFile(MINI_WORLD);
export const mikeWorld = (): World | null => (fs.existsSync(MIKE_WORLD) ? loadWorldFile(MIKE_WORLD) : null);

export function action(over: Partial<CharacterAction> & { action: CharacterAction['action'] }): CharacterAction {
  return {
    publicMessage: 'The record will show exactly what I say it shows, and nothing more.',
    evidenceIds: [],
    claims: [],
    intentTags: [],
    rationaleSummary: 'test',
    ...over,
  };
}
