// Who speaks next: phase seeding from the plan's order, pushes from requests and
// gates, budget accounting and the phase transitions. All pure.
import { PHASES, type Phase, type TrialState, type World } from '@aot/interview-agent/schema';
import { isPhase, phasePlan } from './world.ts';
import type { AgendaItem, State } from './types.ts';

const setExpected = (s: State) => {
  s.expectedActor = s.agenda[0]?.characterId ?? null;
};

const cycle = (world: World, phase: Phase): AgendaItem[] =>
  phasePlan(world, phase).order.map((characterId) => ({ characterId, reason: 'phase_order' as const }));

/** One cycle of the phase's order. */
export function seedAgenda(state: State, world: World, phase: Phase): State {
  const s = structuredClone(state);
  s.agenda = cycle(world, phase);
  setExpected(s);
  return s;
}

/** Puts `item` at the front unless that character is already next. */
export function pushFront(state: State, item: AgendaItem): { state: State; pushed: boolean } {
  if (state.agenda[0]?.characterId === item.characterId) return { state, pushed: false };
  const s = structuredClone(state);
  s.agenda.unshift(item);
  setExpected(s);
  return { state: s, pushed: true };
}

export const budgetSpent = (state: State, world: World, phase: Phase) =>
  state.phaseTurnsUsed[phase] >= phasePlan(world, phase).turns;
export const maxTurnsReached = (state: State, world: World) => state.turn >= world.trialPlan.maxTurns;

/**
 * The actor's slot is consumed: counter and phase budget advance, the head is
 * dropped, and the order is re-cycled if the phase still has budget.
 */
export function consumeTurn(state: State, world: World): State {
  const s = structuredClone(state);
  s.turn += 1;
  if (isPhase(s.trialState)) s.phaseTurnsUsed[s.trialState] += 1;
  s.agenda.shift();
  if (s.agenda.length === 0 && isPhase(s.trialState) && !budgetSpent(s, world, s.trialState) && !maxTurnsReached(s, world))
    s.agenda = cycle(world, s.trialState);
  setExpected(s);
  return s;
}

/**
 * Whether `next` must leave the current phase. A gate-queued examination is
 * honoured past the phase budget; maxTurns is the hard stop.
 */
export function phaseOver(state: State, world: World): boolean {
  if (!isPhase(state.trialState)) return false;
  if (maxTurnsReached(state, world)) return true;
  if (state.agenda.length === 0) return true;
  return budgetSpent(state, world, state.trialState) && state.agenda[0]?.reason !== 'gate';
}

/** After the current phase: the next one, or `verdict` after closing or at maxTurns. */
export function nextTrialState(state: State, world: World): TrialState {
  if (!isPhase(state.trialState)) return state.trialState;
  if (maxTurnsReached(state, world)) return 'verdict';
  const i = PHASES.indexOf(state.trialState);
  return i + 1 < PHASES.length ? PHASES[i + 1]! : 'verdict';
}

export function enterState(state: State, world: World, to: TrialState): State {
  const s = structuredClone(state);
  s.trialState = to;
  s.agenda = isPhase(to) ? cycle(world, to) : [];
  setExpected(s);
  return s;
}
