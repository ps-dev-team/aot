// The append-only trace. `seq` continues from the last line; nothing here
// rewrites a line, ever.
import fs from 'node:fs';
import { files, localIso } from './run.ts';
import type { NewEvent, TrialEvent } from './types.ts';

export function readEvents(runDir: string): TrialEvent[] {
  const file = files.events(runDir);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as TrialEvent);
}

function lastSeq(runDir: string): number {
  const file = files.events(runDir);
  if (!fs.existsSync(file)) return 0;
  const text = fs.readFileSync(file, 'utf8').trimEnd();
  if (text === '') return 0;
  const last = text.slice(text.lastIndexOf('\n') + 1);
  return (JSON.parse(last) as TrialEvent).seq;
}

export function appendEvent(runDir: string, ev: NewEvent): TrialEvent {
  const full: TrialEvent = { seq: lastSeq(runDir) + 1, at: localIso(), ...ev };
  fs.appendFileSync(files.events(runDir), JSON.stringify(full) + '\n');
  return full;
}
