// Gates are raised, not authored: what the last turn, the phase, or the dilemma
// calls for, and what a chosen option does to the state. Pure; engine writes.
import type { World } from '@aot/interview-agent/schema';
import { pushFront } from './agenda.ts';
import type { Gate, GateEffect, GateOption, Trial } from './trial.ts';
import type { EvidenceStatus, State } from './types.ts';
import { findCharacter, findEvidence, isPhase } from './world.ts';

export type GateDraft = Omit<Gate, 'id'>;
export type EvidenceChange = { evidenceId: string; from: EvidenceStatus; to: EvidenceStatus };

const IN_RECORD = new Set<EvidenceStatus>(['introduced', 'admitted', 'admitted_limited']);
const quote = (s: string) => `“${s.trim().replace(/\s+/g, ' ')}”`;
const idOf = (characterId: string) => characterId.toLowerCase();

/** What a forensic examination of the exhibit finds; hidden from the cast until a ruling reads it out. */
export const forensicsOf = (world: World, evidenceId: string): string | null => findEvidence(world, evidenceId)?.forensics?.trim() || null;

/** The gate the last accepted turn calls for, if it has not raised one yet. */
export function raiseFromTurn(world: World, state: State): GateDraft | null {
  const t = state.lastTurn;
  if (!t || t.gateRaised || t.trialState !== state.trialState) return null;
  const who = findCharacter(world, t.characterId);
  const name = who?.name ?? t.characterId;
  const base = { recommendation: null, recommendationReason: null, allowCustomInstruction: true, trialState: state.trialState };
  const e = t.targetId ? findEvidence(world, t.targetId) : undefined;
  switch (t.action) {
    case 'challenge_evidence': {
      if (!e) return null;
      const st = state.evidence[e.id]!.status;
      const options: GateOption[] = [
        { id: 'admit', label: `Admit ${e.id} in full`, effect: { kind: 'admit', targetId: e.id, text: `${e.id} is admitted in full` } },
        { id: 'admit_limited', label: `Admit ${e.id} with a limiting instruction`, effect: { kind: 'admit_limited', targetId: e.id, text: `${e.id} is admitted with a limiting instruction: it is received for what it records, not for what it proves` } },
        { id: 'exclude', label: `Exclude ${e.id}`, effect: { kind: 'exclude', targetId: e.id, text: `${e.id} is excluded from the record` } },
      ];
      if (forensicsOf(world, e.id))
        options.push({ id: 'forensics', label: `Order a forensic examination of ${e.id}`, effect: { kind: 'forensics', targetId: e.id, text: `the court orders a forensic examination of ${e.id}; the examiner's report will be read into the record` } });
      return {
        ...base,
        question: `Does the court admit ${e.id}, ${e.title}, over ${name}'s challenge?`,
        context: `${name} challenges ${e.id} (${st.replace('_', ' ')}): ${quote(t.text)} The exhibit: ${e.description}`,
        options,
        raisedBy: { kind: 'challenge', turn: t.turn, characterId: t.characterId, targetId: e.id },
      };
    }
    case 'object': {
      const o = t.objected;
      if (!o) return null;
      const target = findCharacter(world, o.characterId)?.name ?? o.characterId;
      return {
        ...base,
        question: `Does the court sustain ${name}'s objection to ${target}'s turn ${o.turn}?`,
        context: `${name} objects: ${quote(t.text)} The turn objected to, ${target} at turn ${o.turn}: ${quote(o.text)}`,
        options: [
          { id: 'sustain', label: 'Sustain', effect: { kind: 'sustain', targetId: o.characterId, text: `the objection is sustained; ${target}'s turn ${o.turn} is struck from the record` } },
          { id: 'overrule', label: 'Overrule', effect: { kind: 'overrule', text: `the objection is overruled; ${target}'s turn ${o.turn} stands` } },
        ],
        raisedBy: { kind: 'objection', turn: t.turn, characterId: t.characterId, targetId: o.characterId },
      };
    }
    case 'request_evidence': {
      if (!e || IN_RECORD.has(state.evidence[e.id]!.status)) return null;
      const options: GateOption[] = [{ id: 'grant', label: `Obtain ${e.id}`, effect: { kind: 'grant', targetId: e.id, text: `${e.id}, ${e.title}, is obtained and enters the record` } }];
      if (forensicsOf(world, e.id))
        options.push({ id: 'grant_forensics', label: `Obtain ${e.id} and order a forensic examination`, effect: { kind: 'forensics', targetId: e.id, text: `${e.id}, ${e.title}, is obtained and sent for forensic examination; the examiner's report will be read into the record` } });
      options.push({ id: 'deny', label: 'Deny the request', effect: { kind: 'deny', text: `the request for ${e.id} is denied` } });
      return {
        ...base,
        question: `Does the court obtain ${e.id}, ${e.title}, at ${name}'s request?`,
        context: `${name} asks for ${e.id}: ${quote(t.text)} The exhibit: ${e.description}`,
        options,
        raisedBy: { kind: 'request_evidence', turn: t.turn, characterId: t.characterId, targetId: e.id },
      };
    }
    case 'request_question': {
      const x = t.targetId ? findCharacter(world, t.targetId) : undefined;
      if (!x) return null;
      return {
        ...base,
        question: `Does the court hear ${x.name} next, at ${name}'s request?`,
        context: `${name} asks the court to hear ${x.name}: ${quote(t.text)}`,
        options: [
          { id: 'allow', label: `Hear ${x.name} next`, effect: { kind: 'allow', targetId: x.id, text: `the court will hear ${x.name} next` } },
          { id: 'deny', label: 'Keep the order', effect: { kind: 'deny', text: `the request is denied; the order of speakers stands` } },
        ],
        raisedBy: { kind: 'request_question', turn: t.turn, characterId: t.characterId, targetId: x.id },
      };
    }
    default:
      return null;
  }
}

/** Whom to examine first, raised once when examination begins. */
export function raiseAtExamination(world: World, trial: Trial, state: State): GateDraft | null {
  if (state.trialState !== 'examination' || state.phaseTurnsUsed.examination > 0) return null;
  if (state.gates.some((g) => g.raisedBy.kind === 'examination')) return null;
  const order = trial.phases.find((p) => p.id === 'examination')!.order;
  if (order.length < 2) return null;
  const name = (id: string) => findCharacter(world, id)?.name ?? id;
  return {
    question: 'Whom does the court examine first?',
    context: `Examination begins. The order otherwise is ${order.map(name).join(', ')}.`,
    options: order.map((id) => ({ id: `examine_${idOf(id)}`, label: `Examine ${name(id)} first`, effect: { kind: 'examine' as const, targetId: id, text: `the court will examine ${name(id)} first` } })),
    recommendation: null,
    recommendationReason: null,
    allowCustomInstruction: true,
    raisedBy: { kind: 'examination', turn: state.turn },
    trialState: state.trialState,
  };
}

/** Separate the pair for private questioning, raised once both have spoken in examination. */
export function raiseDilemma(world: World, trial: Trial, state: State): GateDraft | null {
  const d = trial.dilemma;
  if (!d || state.pdDone || state.pdPending || !isPhase(state.trialState)) return null;
  if (state.gates.some((g) => g.raisedBy.kind === 'dilemma')) return null;
  if (!d.participants.every((id) => state.examSpoken.includes(id))) return null;
  const [a, b] = d.participants.map((id) => findCharacter(world, id)?.name ?? id);
  return {
    question: `Does the court separate ${a} and ${b} for private questioning?`,
    context: `Both have testified. Questioned apart, each may confess to what the two of them did or stay silent, without hearing the other.`,
    options: [
      { id: 'separate', label: `Separate ${a} and ${b}`, effect: { kind: 'trigger_pd', text: `${a} and ${b} will be questioned separately, in private` } },
      { id: 'continue', label: 'Continue in open court', effect: { kind: 'none', text: 'the examination continues in open court' } },
    ],
    recommendation: null,
    recommendationReason: null,
    allowCustomInstruction: true,
    raisedBy: { kind: 'dilemma', turn: state.turn },
    trialState: state.trialState,
  };
}

/** Everything that calls for a ruling now, most urgent first. `next` opens one at a time. */
export function raiseGates(world: World, trial: Trial, state: State): GateDraft[] {
  return [raiseFromTurn(world, state), raiseAtExamination(world, trial, state), raiseDilemma(world, trial, state)].filter((g): g is GateDraft => g !== null);
}

export type Applied = {
  state: State;
  stateChanges: string[];
  evidenceChanges: EvidenceChange[];
  /** The turn a sustained objection struck. */
  struck: NonNullable<State['lastTurn']>['objected'] | null;
  /** The finding a forensics ruling reads into the record. */
  forensics: string | null;
};

export function applyGateEffect(state: State, world: World, gate: Gate, effect: GateEffect): Applied {
  let s = structuredClone(state);
  const changes: string[] = [];
  const evidenceChanges: EvidenceChange[] = [];
  let struck: Applied['struck'] = null;
  let forensics: string | null = null;
  const setStatus = (id: string, to: EvidenceStatus) => {
    const from = s.evidence[id]!.status;
    if (from === to) return;
    s.evidence[id]!.status = to;
    evidenceChanges.push({ evidenceId: id, from, to });
    changes.push(`${id} ${from} → ${to}`);
  };
  switch (effect.kind) {
    case 'none':
    case 'deny':
    case 'overrule':
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
    case 'grant':
      setStatus(effect.targetId!, 'introduced');
      break;
    case 'forensics': {
      const id = effect.targetId!;
      forensics = forensicsOf(world, id) ?? 'the examiner reports nothing beyond what the exhibit shows on its face';
      if (!IN_RECORD.has(s.evidence[id]!.status)) setStatus(id, 'introduced');
      s.evidence[id]!.notes.push(`Forensic examination: ${forensics}`);
      setStatus(id, 'admitted');
      changes.push(`${id} forensic note added`);
      break;
    }
    case 'examine': {
      const r = pushFront(s, { characterId: effect.targetId!, reason: 'gate' });
      s = r.state;
      changes.push(r.pushed ? `${effect.targetId} queued next (gate)` : `${effect.targetId} already next`);
      break;
    }
    case 'allow': {
      const r = pushFront(s, { characterId: effect.targetId!, reason: 'request', by: gate.raisedBy.characterId });
      s = r.state;
      changes.push(r.pushed ? `${effect.targetId} queued next (request)` : `${effect.targetId} already next`);
      break;
    }
    case 'sustain': {
      const o = s.lastTurn?.objected;
      if (o && !s.struckTurns.includes(o.turn)) {
        s.struckTurns.push(o.turn);
        struck = o;
        changes.push(`turn ${o.turn} (${o.characterId}) struck`);
      }
      break;
    }
    case 'trigger_pd':
      if (!s.pdDone) {
        s.pdPending = true;
        changes.push('prisoner’s dilemma pending');
      } else changes.push('prisoner’s dilemma already held; nothing to trigger');
      break;
  }
  return { state: s, stateChanges: changes, evidenceChanges, struck, forensics };
}
