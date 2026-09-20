// RunData as the court page consumes it: the harness's own shape, re-exported
// with the entry aliases the player and the view pass around.
import type { RunData, ScriptEntry } from '@aot/world-agent/rundata';

export type { RunData, ScriptEntry };
export type TurnEntry = Extract<ScriptEntry, { kind: 'turn' }>;
export type CastEntry = RunData['cast'][number];
