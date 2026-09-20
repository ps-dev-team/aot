// The eight `propose` checks, in contract order. Malformed bodies return zod
// issues and write nothing; the rest reject with reasons the actor is told.
import { CharacterAction, PHASES, type World } from '@aot/interview-agent/schema';
import { findCharacter, findEvidence, findFact, isPhase } from './world.ts';
import type { State } from './types.ts';

export type Parsed = { ok: true; action: CharacterAction } | { ok: false; errors: string[] };

export function parseAction(body: string): Parsed {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (e) {
    return { ok: false, errors: [`body is not JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const r = CharacterAction.safeParse(raw);
  if (!r.success) return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  return { ok: true, action: r.data };
}

export type Validation = { ok: true } | { ok: false; reasons: string[] };

const NEEDS_CHARACTER = new Set(['accuse', 'request_question']);
const NEEDS_EVIDENCE = new Set(['present_evidence', 'challenge_evidence', 'request_evidence']);
const IN_RECORD = new Set(['introduced', 'admitted', 'admitted_limited']);

export function validateAction(world: World, state: State, id: string, action: CharacterAction): Validation {
  const c = findCharacter(world, id);
  if (!c) return { ok: false, reasons: [`unknown character ${id}`] };
  if (state.expectedActor !== id) return { ok: false, reasons: [`it is ${state.expectedActor ?? 'nobody'}’s turn, not ${id}’s`] };
  if (!c.allowedActions.includes(action.action)) return { ok: false, reasons: [`${c.role} may not ${action.action}`] };

  const t = action.targetId;
  if (NEEDS_CHARACTER.has(action.action)) {
    if (!t) return { ok: false, reasons: [`${action.action} needs a character targetId`] };
    if (!findCharacter(world, t)) return { ok: false, reasons: [`unknown character ${t}`] };
  }
  if (NEEDS_EVIDENCE.has(action.action)) {
    if (!t) return { ok: false, reasons: [`${action.action} needs an evidence targetId`] };
    if (!findEvidence(world, t)) return { ok: false, reasons: [`unknown evidence ${t}`] };
  }

  const reasons: string[] = [];
  const refs = [...action.evidenceIds];
  if (action.action === 'present_evidence' && t && !refs.includes(t)) refs.push(t);
  for (const eid of refs) {
    const e = findEvidence(world, eid);
    if (!e) {
      reasons.push(`unknown evidence ${eid}`);
      continue;
    }
    const st = state.evidence[eid]!.status;
    if (st === 'excluded') reasons.push(`${eid} has been excluded from the record`);
    else if (isPhase(state.trialState) && PHASES.indexOf(e.availableFromPhase) > PHASES.indexOf(state.trialState))
      reasons.push(`${eid} is not available until the ${e.availableFromPhase} phase`);
    else if (!IN_RECORD.has(st) && !e.knownByCharacterIds.includes(id)) reasons.push(`${eid} is not in the record and not known to ${id}`);
    // Re-presenting would farm useful_evidence; the exhibit is already before the court.
    else if (action.action === 'present_evidence' && eid === t && IN_RECORD.has(st)) reasons.push(`${eid} is already in the record`);
  }
  if (reasons.length) return { ok: false, reasons };

  if (action.action === 'challenge_evidence' && t && !IN_RECORD.has(state.evidence[t]!.status))
    return { ok: false, reasons: [`${t} has not been introduced; nothing to challenge`] };

  const unknownFacts = action.claims.map((k) => k.factId).filter((f) => !findFact(world, f));
  if (unknownFacts.length) return { ok: false, reasons: unknownFacts.map((f) => `unknown fact ${f}`) };

  if (action.action !== 'wait' && action.action !== 'remain_silent' && action.publicMessage.trim() === '')
    return { ok: false, reasons: [`${action.action} needs a publicMessage`] };
  return { ok: true };
}
