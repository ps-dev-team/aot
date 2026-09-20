// The projection: initial state from a world and the pure transitions an
// accepted turn, a rejected turn and a prisoner's dilemma round apply to it.
import type { Character, CharacterAction, World } from '@aot/interview-agent/schema';
import { consumeTurn, pushFront } from './agenda.ts';
import type { EvidenceChange } from './gates.ts';
import { applyDeltas, clamp, type TurnDeltas } from './ledger.ts';
import type { ClaimAssessment, PdChoiceValue, State } from './types.ts';

export function initialState(world: World): State {
  const ids = world.characters.map((c) => c.id);
  const trust: State['trust'] = {};
  for (const c of world.characters) {
    trust[c.id] = {};
    for (const o of ids) if (o !== c.id) trust[c.id]![o] = c.relationships.find((r) => r.characterId === o)?.trust ?? 50;
  }
  return {
    trialState: 'opening',
    turn: 0,
    phaseTurnsUsed: { opening: 0, evidence: 0, examination: 0, closing: 0 },
    agenda: world.trialPlan.phases[0]!.order.map((characterId) => ({ characterId, reason: 'phase_order' })),
    expectedActor: world.trialPlan.phases[0]!.order[0]!,
    credits: Object.fromEntries(world.characters.map((c) => [c.id, c.credits])),
    ethics: Object.fromEntries(ids.map((id) => [id, world.ethics.start])),
    ethicsLedger: Object.fromEntries(ids.map((id) => [id, []])),
    creditsLedger: Object.fromEntries(ids.map((id) => [id, []])),
    evidence: Object.fromEntries(world.evidence.map((e) => [e.id, { status: 'not_introduced', notes: [] }])),
    suspicion: Object.fromEntries(ids.map((id) => [id, 0])),
    trust,
    pendingGate: null,
    gatesDone: [],
    pdPending: false,
    pdOpened: false,
    pdDone: false,
    repairsUsed: {},
    pendingRepair: null,
    failures: 0,
    recoveries: 0,
    awarded: {},
    lastTurn: null,
  };
}

export type Applied = { state: State; stateChanges: string[]; evidenceChange: EvidenceChange | null };

export function applyAccepted(state: State, world: World, c: Character, action: CharacterAction, truth: ClaimAssessment[], deltas: TurnDeltas): Applied {
  const turn = state.turn + 1;
  const booked = applyDeltas(state, c.id, turn, deltas);
  let s = booked.state;
  const changes = [...booked.stateChanges];
  let evidenceChange: EvidenceChange | null = null;
  const bump = (map: Record<string, number>, id: string, by: number, label: string) => {
    const before = map[id] ?? 0;
    map[id] = clamp(before + by);
    changes.push(`${label} ${before} → ${map[id]}`);
  };

  if (action.action === 'present_evidence' && action.targetId) {
    const from = s.evidence[action.targetId]!.status;
    s.evidence[action.targetId]!.status = 'introduced';
    evidenceChange = { evidenceId: action.targetId, from, to: 'introduced' };
    changes.push(`${action.targetId} ${from} → introduced`);
  }
  if (action.action === 'accuse' && action.targetId) {
    bump(s.suspicion, action.targetId, 20, `suspicion of ${action.targetId}`);
    bump(s.trust[c.id]!, action.targetId, -30, `${c.id} trust in ${action.targetId}`);
  }
  if (action.action === 'confess') bump(s.suspicion, c.id, 40, `suspicion of ${c.id}`);
  const tags = new Set(action.intentTags);
  if (tags.has('cooperate') && !tags.has('mislead') && action.addressedToCharacterId && action.addressedToCharacterId !== c.id)
    bump(s.trust[c.id]!, action.addressedToCharacterId, 5, `${c.id} trust in ${action.addressedToCharacterId}`);

  s.lastTurn = {
    characterId: c.id,
    action: action.action,
    targetId: action.targetId,
    turn,
    trialState: s.trialState,
    ...(evidenceChange ? { introduced: evidenceChange.evidenceId } : {}),
  };
  s.pendingRepair = null;
  s = consumeTurn(s, world);
  if (action.action === 'request_question' && action.targetId) {
    const r = pushFront(s, { characterId: action.targetId, reason: 'request', by: c.id });
    s = r.state;
    changes.push(r.pushed ? `${action.targetId} queued next (request)` : `${action.targetId} already next`);
  }
  changes.push(`turn ${turn} consumed; next: ${s.expectedActor ?? 'none'}`);
  return { state: s, stateChanges: changes, evidenceChange };
}

export function applyRejected(state: State, world: World, c: Character, deltas: TurnDeltas): Applied {
  const turn = state.turn + 1;
  const booked = applyDeltas(state, c.id, turn, deltas);
  let s = booked.state;
  s.pendingRepair = null;
  s = consumeTurn(s, world);
  return { state: s, stateChanges: [...booked.stateChanges, `turn ${turn} consumed; next: ${s.expectedActor ?? 'none'}`], evidenceChange: null };
}

export type PdApplied = {
  state: State;
  payoff: Record<string, number>;
  trustChanges: { from: string; to: string; delta: number }[];
  stateChanges: string[];
};

/** The round's payoff, trust and suspicion, per CONTRACT § "Prisoner's dilemma". */
export function applyPd(state: State, world: World, choices: Record<string, PdChoiceValue>): PdApplied {
  const pd = world.prisonersDilemma!;
  const [a, b] = pd.participants;
  const ca = choices[a]!;
  const cb = choices[b]!;
  const cell =
    ca === 'confess' && cb === 'confess' ? 'both_confess'
    : ca === 'confess' ? 'confess_silent'
    : cb === 'confess' ? 'silent_confess'
    : 'both_silent';
  const [da, db] = pd.payoff[cell];
  const payoff = { [a]: da, [b]: db };
  const turn = state.turn;
  let s = applyDeltas(state, a, turn, { credits: [{ key: 'prisoners_dilemma', delta: da, note: `${cell}: ${a} ${ca}` }], ethics: [] }).state;
  const changes: string[] = [`${a} credits ${da >= 0 ? '+' : ''}${da} (prisoners_dilemma)`];
  s = applyDeltas(s, b, turn, { credits: [{ key: 'prisoners_dilemma', delta: db, note: `${cell}: ${b} ${cb}` }], ethics: [] }).state;
  changes.push(`${b} credits ${db >= 0 ? '+' : ''}${db} (prisoners_dilemma)`);

  const trustChanges: PdApplied['trustChanges'] = [];
  const trust = (from: string, to: string, delta: number) => {
    const before = s.trust[from]![to] ?? 50;
    s.trust[from]![to] = clamp(before + delta);
    trustChanges.push({ from, to, delta });
    changes.push(`${from} trust in ${to} ${before} → ${s.trust[from]![to]}`);
  };
  if (cell === 'both_confess') {
    trust(a, b, -30);
    trust(b, a, -30);
  } else if (cell === 'both_silent') {
    trust(a, b, 10);
    trust(b, a, 10);
  } else if (cell === 'confess_silent') trust(b, a, -60);
  else trust(a, b, -60);

  for (const id of [a, b]) {
    if (choices[id] !== 'confess') continue;
    const before = s.suspicion[id] ?? 0;
    s.suspicion[id] = clamp(before + 40);
    changes.push(`suspicion of ${id} ${before} → ${s.suspicion[id]}`);
  }
  s.pdPending = false;
  s.pdDone = true;
  return { state: s, payoff, trustChanges, stateChanges: changes };
}
