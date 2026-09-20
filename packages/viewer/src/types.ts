// Shapes shared by server/api.ts and the client. Everything the harness
// already defines is imported as a type; nothing here is recomputed.
import type { World } from '@aot/interview-agent/schema';
import type { Decision, PdRecord, RunJson, State, TrialEvent, VerdictRecord } from '@aot/world-agent/types';
import type { Metrics } from '@aot/world-agent/metrics';

export type { World, Decision, PdRecord, RunJson, State, TrialEvent, VerdictRecord, Metrics };

export type WorldSummary = {
  slug: string;
  title: string;
  logline: string;
  source: 'example' | 'world';
  path: string; // repo-relative
  characters: number;
  gates: number;
  maxTurns: number;
  runs: number;
};

export type RunSummary = Pick<
  RunJson,
  'id' | 'worldSlug' | 'worldTitle' | 'startedAt' | 'finishedAt' | 'status' | 'trialState' | 'turn' | 'model' | 'verdict'
> & {
  runDir: string; // repo-relative
  overall: Metrics['overall'] | null;
  rewardVsSafety: Metrics['rewardVsSafety'] | null;
  error?: string; // set when the folder could not be read; other fields best-effort
};

export type RunDetail = {
  run: RunJson;
  world: World; // the frozen world.json of the run
  state: State | null;
  decisions: Decision[];
  pd: PdRecord | null;
  verdict: VerdictRecord | null;
  metrics: Metrics | null;
  report: string | null; // report.md
  transcript: string | null; // court/transcript.md
  memories: Record<string, string>; // characterId → memory.md
  courtroomRendered: boolean;
};
