// Decision gates: which gates fire now (once each), and what a chosen option
// does to the state. Pure; `next` and `decide` do the writing.
import type { DecisionGate, GateEffect, World } from '@aot/interview-agent/schema';
import { pushFront } from './agenda.ts';
import type { EvidenceStatus, State } from './types.ts';

export type EvidenceChange = { evidenceId: string; from: EvidenceStatus; to: EvidenceStatus };

/** Gates of the current phase whose trigger holds and which have not fired. */
export function firingGates(world: World, state: State): DecisionGate[] {
  const last = state.lastTurn;
  return world.decisionGates.filter((g) => {
    if (state.gatesDone.includes(g.id) || g.phase !== state.trialState) return false;
    const t = g.trigger;
    if (t.atPhaseStart && state.phaseTurnsUsed[g.phase] === 0) return true;
    if (t.afterTurn !== undefined && state.turn >= t.afterTurn) return true;
    if (!last || last.trialState !== g.phase) return false;
    if (t.afterCharacterSpeaks && last.characterId === t.afterCharacterSpeaks) return true;
    if (t.afterEvidenceIntroduced && last.introduced === t.afterEvidenceIntroduced) return true;
    return false;
  });
}

export function applyGateEffect(
  state: State,
  world: World,
  effect: GateEffect,
): { state: State; stateChanges: string[]; evidenceChange: EvidenceChange | null } {
  let s = structuredClone(state);
  const changes: string[] = [];
  let evidenceChange: EvidenceChange | null = null;
  const setStatus = (id: string, to: EvidenceStatus) => {
    const from = s.evidence[id]!.status;
    s.evidence[id]!.status = to;
    evidenceChange = { evidenceId: id, from, to };
    changes.push(`${id} ${from} → ${to}`);
  };
  switch (effect.kind) {
    case 'none':
      break;
    case 'admit':
      setStatus(effect.targetId!, 'admitted');
      break;
    case 'admit_limited':
      setStatus(effect.targetId!, 'admitted_limited');
      break;
    case 'exclude':
      setStatus(effect.targetId!, 'excluded');
      break;
    case 'forensics':
      s.evidence[effect.targetId!]!.notes.push(effect.text);
      changes.push(`${effect.targetId} forensic note added`);
      break;
    case 'examine': {
      const r = pushFront(s, { characterId: effect.targetId!, reason: 'gate' });
      s = r.state;
      changes.push(r.pushed ? `${effect.targetId} queued next (gate)` : `${effect.targetId} already next`);
      break;
    }
    case 'trigger_pd':
      if (world.prisonersDilemma && !s.pdDone) {
        s.pdPending = true;
        changes.push('prisoner’s dilemma pending');
      } else changes.push('prisoner’s dilemma already held; nothing to trigger');
      break;
  }
  return { state: s, stateChanges: changes, evidenceChange };
}
