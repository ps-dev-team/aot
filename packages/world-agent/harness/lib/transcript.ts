// The court record: what the human reads. Court turns only, one heading per
// phase the first time it is entered, a blank line between turns.
import fs from 'node:fs';
import path from 'node:path';
import type { Character, CharacterAction, TrialState, World } from '@aot/interview-agent/schema';
import { files, shortTime } from './run.ts';

export const PHASE_HEADINGS: Record<TrialState, string> = {
  opening: 'Opening',
  evidence: 'Evidence',
  examination: 'Examination',
  closing: 'Closing',
  verdict: 'Verdict',
  reveal: 'Reveal',
  complete: 'Complete',
};

export function initTranscript(runDir: string, world: World, runId: string, startedAt: Date): void {
  const file = files.transcript(runDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# ${world.title} — court record\n_Run ${runId} · started ${shortTime(startedAt)}_\n`);
}

export const readTranscript = (runDir: string) => fs.readFileSync(files.transcript(runDir), 'utf8');

export function appendBlock(runDir: string, block: string): void {
  fs.appendFileSync(files.transcript(runDir), `\n${block}\n`);
}

/** Writes `## Phase` once; a second entry into the same phase is a no-op. */
export function enterPhase(runDir: string, phase: TrialState): void {
  const heading = `## ${PHASE_HEADINGS[phase]}`;
  if (readTranscript(runDir).split('\n').includes(heading)) return;
  appendBlock(runDir, heading);
}

export const courtLine = (text: string) => `**THE COURT** — ${text}`;

const SILENT = new Set(['wait', 'remain_silent']);

/** One character turn in the record, with the `>` annotation when it has one. */
export function turnLine(c: Character, action: CharacterAction): string {
  const who = `**${c.name}** _(${c.role})_`;
  if (SILENT.has(action.action)) return `${who} — _(remains silent)_`;
  const parts: string[] = [];
  const ev = [...new Set([...(action.action === 'present_evidence' && action.targetId ? [action.targetId] : []), ...action.evidenceIds])];
  if (ev.length) parts.push(`exhibits ${ev.join(', ')}`);
  if (action.claims.length) parts.push(`claims ${action.claims.map((k) => `${k.factId} ${k.stance}`).join(', ')}`);
  const line = `${who} — ${action.publicMessage.trim()}`;
  return parts.length ? `${line}\n> ${parts.join(' · ')}` : line;
}
