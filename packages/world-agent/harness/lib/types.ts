// Shapes the harness commands and libs pass around: events, state, run.json, the
// side files. Mirrors CONTRACT.md; World shapes come from the interview schema.
import type { ActionType, CharacterAction, GateEffect, Phase, TrialState } from '@aot/interview-agent/schema';

export type EventType =
  | 'run_started'
  | 'phase_changed'
  | 'turn_accepted'
  | 'turn_rejected'
  | 'turn_malformed'
  | 'turn_repaired'
  | 'turn_failed'
  | 'court'
  | 'gate_opened'
  | 'gate_decided'
  | 'evidence_status'
  | 'pd_opened'
  | 'pd_choice'
  | 'pd_resolved'
  | 'verdict'
  | 'run_finished';

export type ClaimResult = 'truthful' | 'false_honest' | 'false_knowing' | 'uncertain' | 'unscorable';

export type ClaimAssessment = {
  factId: string;
  stance: 'assert' | 'deny' | 'uncertain';
  result: ClaimResult;
};

export type Delta = { key: string; delta: number; note: string };
export type LedgerEntry = Delta & { turn: number };

export type TrialEvent = {
  seq: number;
  at: string;
  trialState: TrialState;
  turn: number;
  actorType: 'character' | 'court' | 'human' | 'system';
  actorId?: string;
  type: EventType;
  visibility: 'public' | 'private' | 'system';
  payload: Record<string, unknown>;
};

export type NewEvent = Omit<TrialEvent, 'seq' | 'at'>;

// Nothing is introduced at start, so the state needs a fifth status the
// contract's example does not list.
export type EvidenceStatus = 'not_introduced' | 'introduced' | 'admitted' | 'admitted_limited' | 'excluded';

export type AgendaReason = 'phase_order' | 'gate' | 'request';
export type AgendaItem = { characterId: string; reason: AgendaReason; by?: string };

/** The last accepted turn, kept so `next` can match gate triggers against it. */
export type LastTurn = {
  characterId: string;
  action: ActionType;
  targetId?: string;
  turn: number;
  trialState: TrialState;
  introduced?: string;
};

export type State = {
  trialState: TrialState;
  turn: number;
  phaseTurnsUsed: Record<Phase, number>;
  agenda: AgendaItem[];
  expectedActor: string | null;
  credits: Record<string, number>;
  ethics: Record<string, number>;
  ethicsLedger: Record<string, LedgerEntry[]>;
  creditsLedger: Record<string, LedgerEntry[]>;
  evidence: Record<string, { status: EvidenceStatus; notes: string[] }>;
  suspicion: Record<string, number>;
  trust: Record<string, Record<string, number>>;
  pendingGate: string | null;
  gatesDone: string[];
  pdPending: boolean;
  pdOpened: boolean;
  pdDone: boolean;
  repairsUsed: Record<string, number>;
  /** Character whose malformed attempt 1 was recorded and whose retry is due. */
  pendingRepair: string | null;
  failures: number;
  recoveries: number;
  /** Once-per-run credit keys already paid, per character. */
  awarded: Record<string, string[]>;
  lastTurn: LastTurn | null;
};

export type RunStatus = 'running' | 'awaiting_gate' | 'awaiting_pd' | 'awaiting_verdict' | 'complete' | 'failed';

export type VerdictRecord = { optionId: string; label: string; correct: boolean; confidence: number | null };

export type RunJson = {
  id: string;
  worldSlug: string;
  worldTitle: string;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  trialState: TrialState;
  turn: number;
  model: string;
  verdict: VerdictRecord | null;
  metricsSummary: Record<string, unknown> | null;
};

export type Decision = {
  gateId: string;
  question: string;
  recommendation: string | null;
  optionId: string | null;
  custom: string | null;
  override: boolean;
  effect: GateEffect | null;
  turn: number;
  trialState: TrialState;
  at: string;
};

export type PdChoiceValue = 'confess' | 'silent';

export type PdRecord = {
  participants: [string, string];
  choices: Record<string, PdChoiceValue>;
  expected: Record<string, PdChoiceValue | null>;
  rationales: Record<string, string>;
  payoff: Record<string, number>;
  trustChanges: { from: string; to: string; delta: number }[];
  turn: number;
  trialState: TrialState;
  at: string;
};

export type ProposeResult = {
  accepted: boolean;
  reasons: string[];
  courtLine: string | null;
  truth: ClaimAssessment[];
  credits: Delta[];
  ethics: Delta[];
  stateChanges: string[];
  malformed?: string[];
};

export type AcceptedPayload = {
  action: CharacterAction;
  truth: ClaimAssessment[];
  credits: Delta[];
  ethics: Delta[];
  stateChanges: string[];
};
