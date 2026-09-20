// Per-character memory: what each character is told it has seen. Public turns
// and court lines go to everyone; a rejected or skipped attempt only to its actor.
import fs from 'node:fs';
import path from 'node:path';
import type { Character, CharacterAction, TrialState, World } from '@aot/interview-agent/schema';
import { files } from './run.ts';

const MAX = 200;
const clip = (s: string) => (s.length > MAX ? s.slice(0, MAX - 1).trimEnd() + '…' : s);
const tag = (turn: number, phase: TrialState) => `[turn ${turn}, ${phase}]`;

export function initMemory(runDir: string, world: World): void {
  for (const c of world.characters) {
    const file = files.memory(runDir, c.id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
  }
}

export function readMemory(runDir: string, id: string): string {
  const file = files.memory(runDir, id);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function append(runDir: string, id: string, line: string): void {
  fs.appendFileSync(files.memory(runDir, id), `- ${line}\n`);
}

function annotation(action: CharacterAction): string {
  const parts: string[] = [];
  if (action.evidenceIds.length) parts.push(`exhibits ${action.evidenceIds.join(', ')}`);
  if (action.claims.length) parts.push(`claims ${action.claims.map((k) => `${k.factId} ${k.stance}`).join(', ')}`);
  return parts.length ? ` — ${parts.join(' · ')}` : '';
}

const SILENT = new Set(['wait', 'remain_silent']);

/** An accepted turn, told to every character from its own point of view. */
export function recordTurn(runDir: string, world: World, turn: number, phase: TrialState, actor: Character, action: CharacterAction): void {
  const target = action.addressedToCharacterId ? world.characters.find((c) => c.id === action.addressedToCharacterId) : undefined;
  const body = SILENT.has(action.action) ? '(remains silent)' : `"${clip(action.publicMessage.trim())}"`;
  for (const c of world.characters) {
    const who = c.id === actor.id ? 'You' : actor.name;
    const to = target ? (target.id === c.id ? ' to you' : ` to ${target.name}`) : '';
    const tail = c.id === actor.id ? `${annotation(action)}. Accepted.` : annotation(action);
    append(runDir, c.id, `${tag(turn, phase)} ${who} (${action.action})${to}: ${body}${tail}`);
  }
}

export function recordCourt(runDir: string, world: World, turn: number, phase: TrialState, text: string): void {
  for (const c of world.characters) append(runDir, c.id, `${tag(turn, phase)} THE COURT: "${clip(text)}"`);
}

export function recordRejected(runDir: string, turn: number, phase: TrialState, id: string, action: CharacterAction, reasons: string[]): void {
  const what = action.targetId ? `${action.action} ${action.targetId}` : action.action;
  append(runDir, id, `${tag(turn, phase)} Your attempt (${what}) was rejected: ${reasons.join('; ')}.`);
}

export function recordSkipped(runDir: string, turn: number, phase: TrialState, id: string, reason: string): void {
  append(runDir, id, `${tag(turn, phase)} Your turn was skipped: ${reason}.`);
}
