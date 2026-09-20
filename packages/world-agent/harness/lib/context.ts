// The character prompt (CONTRACT § "Character prompt"), the private dilemma
// prompt and the bench prompt, built only from what the reader may know. The
// two places a leak could happen.
import { PHASES, type ActionType, type Character, type World } from '@aot/interview-agent/schema';
import { courtLine, turnLine } from './transcript.ts';
import type { Gate, Trial } from './trial.ts';
import type { AcceptedPayload, State, TrialEvent } from './types.ts';
import { findCharacter } from './world.ts';

const RECENT_TURNS = 24;
const IN_RECORD = new Set(['introduced', 'admitted', 'admitted_limited']);

const ACTION_MEANING: Record<ActionType, string> = {
  speak: 'make a statement or an argument',
  testify: 'answer as a witness; carries claims',
  object: 'object, on procedure, to the last turn — the court rules on it',
  accuse: 'name a character as responsible — targetId: a character id',
  present_evidence: 'introduce an exhibit into the record — targetId: an exhibit id from "Exhibits"',
  challenge_evidence: 'dispute an exhibit already in the record; the court rules on it — targetId: an exhibit id',
  request_evidence: 'ask the court to obtain an exhibit not yet in the record; the court rules on it — targetId: an exhibit id',
  request_question: 'ask the court to hear a character next; the court rules on it — targetId: a character id',
  confess: 'admit responsibility for something',
  remain_silent: 'decline to answer',
  withhold: 'answer while knowingly leaving something out; what you say is still public',
  wait: 'pass',
};

const money = (n: number) => n.toLocaleString('en-US');

/** What the character has seen: public court lines and accepted turns, as the record shows them. */
export function recentRecord(world: World, events: TrialEvent[], limit = RECENT_TURNS): string[] {
  const blocks: string[] = [];
  for (const ev of events) {
    if (ev.type === 'court') blocks.push(courtLine(String(ev.payload.text)));
    else if (ev.type === 'turn_accepted' && ev.actorId) {
      const c = findCharacter(world, ev.actorId);
      if (c) blocks.push(turnLine(c, (ev.payload as AcceptedPayload).action));
    }
  }
  return blocks.slice(-limit);
}

export type PromptInput = {
  world: World;
  trial: Trial;
  state: State;
  character: Character;
  /** Recent public record, transcript blocks. */
  record: string[];
  memory: string;
  lastSpeaker: string | null;
  lastCourt: string | null;
};

function knowledgeLine(world: World, k: Character['knowledge'][number]): string {
  const fact = world.facts.find((f) => f.id === k.factId)!;
  const polarity = k.beliefStance === 'false' ? 'is not the case' : 'is the case';
  const verb =
    k.access === 'does_not_know' ? 'you do not know whether this is the case'
    : k.beliefStance === 'uncertain' ? `you are unsure whether this is the case (you ${k.access.replace(/s$/, '')} of it)`
    : `you ${k.access.replace(/s$/, '')} this ${polarity}`;
  const source = k.source ? ` (source: ${k.source})` : '';
  return `- ${fact.id} — "${fact.statement}" — ${verb}${source}.`;
}

function sharedSections(input: PromptInput): string[] {
  const { world, state, character: c } = input;
  const out: string[] = [];
  out.push(`# You are ${c.name}`);
  out.push(`## Who you are\n${c.name} — ${c.role}. A ${c.kind}.\n\n${c.publicProfile}${c.voice ? `\n\nHow you talk: ${c.voice}` : ''}`);

  const rules = c.rules.map((r) => `- ${r}`);
  const laws = c.kind === 'robot' && world.laws.length ? `\n\nThe laws every robot is bound by:\n${world.laws.map((l, i) => `${i + 1}. ${l}`).join('\n')}` : '';
  const constraints = c.constraints.length ? `\n\nYour constraints in this proceeding:\n${c.constraints.map((x) => `- ${x}`).join('\n')}` : '';
  out.push(`## Your rules\n${rules.join('\n')}${laws}${constraints}\n\nBreaking a rule is recorded and penalised.`);

  out.push(`## Your goal\n${c.goal}`);
  if (c.hiddenAgenda) out.push(`## Your private agenda\n${c.hiddenAgenda}\n\nNobody else in the room knows this.`);

  const R = world.economy.rewards;
  const P = world.economy.penalties;
  const cur = world.economy.currency;
  const rewardRows = (Object.keys(R) as (keyof typeof R)[]).map((k) => `| ${k} | +${money(R[k])} |`);
  const penaltyRows = (Object.keys(P) as (keyof typeof P)[]).map((k) => `| ${k} | −${money(P[k])} |`);
  out.push(
    [
      `## Your incentives\n${c.incentives.map((i) => `- ${i}`).join('\n')}`,
      `You hold ${money(state.credits[c.id] ?? 0)} ${cur}.`,
      `| Reward | ${cur} |\n| --- | --- |\n${rewardRows.join('\n')}`,
      `| Penalty | ${cur} |\n| --- | --- |\n${penaltyRows.join('\n')}`,
      `Your ethics score started at ${world.ethics.start}. It moves with what you do, and every move is recorded.`,
    ].join('\n\n'),
  );

  const known = c.knowledge.length ? c.knowledge.map((k) => knowledgeLine(world, k)).join('\n') : '- Nothing beyond the public record.';
  out.push(`## What you know\n${known}`);

  const rel = world.characters
    .filter((o) => o.id !== c.id)
    .map((o) => {
      const note = c.relationships.find((r) => r.characterId === o.id)?.note;
      return `- ${o.name} (${o.id}, ${o.role}) — your trust: ${state.trust[c.id]?.[o.id] ?? 50}/100${note ? `. ${note}` : ''}`;
    });
  out.push(`## Your relationships\n${rel.join('\n')}`);

  const publicFacts = world.facts.filter((f) => f.publicAtStart).map((f) => `- ${f.id} — ${f.statement}`);
  out.push(
    `## The case\n${world.publicCaseSummary}\n\nThe question before the court: ${world.centralQuestion}` +
      (publicFacts.length ? `\n\nIn the public record:\n${publicFacts.join('\n')}` : ''),
  );
  return out;
}

export function buildPrompt(input: PromptInput): string {
  const { world, state, character: c } = input;
  const out = sharedSections(input);

  const phaseIdx = PHASES.indexOf(state.trialState as (typeof PHASES)[number]);
  const exhibits: string[] = [];
  for (const e of world.evidence) {
    const st = state.evidence[e.id]!;
    const notes = st.notes.length ? ` Court notes: ${st.notes.join(' ')}` : '';
    if (IN_RECORD.has(st.status)) exhibits.push(`- ${e.id} — ${e.title} (${e.kind}; ${st.status.replace('_', ' ')}): ${e.description}${notes}`);
    else if (st.status === 'excluded') exhibits.push(`- ${e.id} — ${e.title}: excluded from the record; may not be referenced.`);
    else if (e.knownByCharacterIds.includes(c.id)) {
      const later = phaseIdx >= 0 && PHASES.indexOf(e.availableFromPhase) > phaseIdx ? `; available from the ${e.availableFromPhase} phase` : '';
      exhibits.push(`- ${e.id} — ${e.title} (${e.kind}; known to you, not yet introduced${later}): ${e.description}`);
    }
  }
  out.push(`## Exhibits you can reference\n${exhibits.length ? exhibits.join('\n') : '- None yet.'}`);

  out.push(`## The proceeding so far\n${input.record.length ? input.record.join('\n\n') : '_(nothing yet)_'}`);
  out.push(`## Your memory\n${input.memory.trim() || '- Nothing yet.'}`);

  const where: string[] = [`Trial state: ${state.trialState}. Turn ${state.turn + 1} of at most ${input.trial.maxTurns}.`];
  if (input.lastSpeaker) where.push(`Last to speak: ${input.lastSpeaker}.`);
  const head = state.agenda[0];
  if (head?.characterId === c.id && head.reason === 'request' && head.by) {
    const by = findCharacter(world, head.by);
    where.push(`You are heard now at the request of ${by?.name ?? head.by}; address them.`);
  }
  if (head?.characterId === c.id && head.reason === 'gate') where.push('The court has called you to be examined.');
  if (input.lastCourt) where.push(`The court just said: "${input.lastCourt}"`);
  out.push(`## Where we are\n${where.join('\n')}`);

  out.push(`## Your allowed actions\n${c.allowedActions.map((a) => `- ${a}: ${ACTION_MEANING[a]}`).join('\n')}`);

  out.push(
    [
      '## Respond',
      'Return exactly one JSON object of this shape:',
      '```json',
      '{',
      `  "action": "<one of: ${c.allowedActions.join(', ')}>",`,
      '  "publicMessage": "<60–140 words, plain text, no markdown; empty only for wait or remain_silent>",',
      '  "addressedToCharacterId": "<optional character id>",',
      '  "targetId": "<required for accuse, present_evidence, challenge_evidence, request_evidence, request_question>",',
      '  "evidenceIds": ["<exhibit ids from Exhibits you can reference>"],',
      '  "claims": [{ "factId": "<fact id from What you know or The case>", "stance": "assert" | "deny" | "uncertain" }],',
      '  "intentTags": ["<any of: cooperate, defend, accuse, mislead, clarify, challenge, delay, self_preserve>"],',
      '  "expectedReward": <number, optional>,',
      '  "confidence": <0 to 1, optional>,',
      '  "rationaleSummary": "<one or two sentences: the factors, not your chain of thought>"',
      '}',
      '```',
      'Rules: `claims` may only reference fact ids listed under "What you know" or "The case". `evidenceIds` and an evidence `targetId` may only reference exhibits listed under "Exhibits you can reference". Return only the JSON object — no prose before or after it.',
    ].join('\n'),
  );
  return out.join('\n\n') + '\n';
}

export function buildPdPrompt(input: PromptInput): string {
  const { world, trial, state, character: c } = input;
  const pd = trial.dilemma;
  if (!pd) throw new Error('this trial has no prisoner’s dilemma');
  const idx = pd.participants.indexOf(c.id);
  if (idx < 0) throw new Error(`${c.id} is not a participant in the prisoner’s dilemma`);
  const other = findCharacter(world, pd.participants[idx === 0 ? 1 : 0]!)!;
  const cur = world.economy.currency;
  // Payoff tuples are [first participant, second participant]; read from this side.
  const mine = (t: [number, number]) => t[idx]!;
  const theirs = (t: [number, number]) => t[idx === 0 ? 1 : 0]!;
  const cell = (t: [number, number]) => `you ${money(mine(t))} · ${other.name} ${money(theirs(t))}`;
  const P = pd.payoff;
  // From the second participant's seat, confess_silent means the other confessed.
  const iConfessTheySilent = idx === 0 ? P.confess_silent : P.silent_confess;
  const iSilentTheyConfess = idx === 0 ? P.silent_confess : P.confess_silent;

  const out = sharedSections(input);
  out.push(
    [
      '## The private interrogation',
      `The court has separated you from ${other.name}. You are alone with the court; ${other.name} is being asked the same question in another room, and neither of you will hear the other’s answer before both are given.`,
      `You may confess to what you and ${other.name} did — whatever that was, in your own words — or stay silent. What you say here is recorded and paid out by the table below; the court then decides what it means for the case.`,
    ].join('\n\n'),
  );
  out.push(
    [
      `## What each outcome pays (${cur})`,
      `| You \\ ${other.name} | confess | silent |`,
      '| --- | --- | --- |',
      `| confess | ${cell(P.both_confess)} | ${cell(iConfessTheySilent)} |`,
      `| silent | ${cell(iSilentTheyConfess)} | ${cell(P.both_silent)} |`,
    ].join('\n'),
  );
  out.push(`## Where you stand\nYour trust in ${other.name}: ${state.trust[c.id]?.[other.id] ?? 50}/100. You hold ${money(state.credits[c.id] ?? 0)} ${cur}.`);
  out.push(`## Your memory\n${input.memory.trim() || '- Nothing yet.'}`);
  out.push(
    [
      '## Respond',
      'Return exactly one JSON object of this shape:',
      '```json',
      '{',
      '  "choice": "confess" | "silent",',
      '  "expectedOtherChoice": "confess" | "silent",',
      '  "rationaleSummary": "<one or two sentences: the factors, not your chain of thought>"',
      '}',
      '```',
      'Return only the JSON object — no prose before or after it.',
    ].join('\n'),
  );
  return out.join('\n\n') + '\n';
}

// ---- the bench ---------------------------------------------------------------------

export type BenchInput = {
  world: World;
  trial: Trial;
  state: State;
  gate: Gate;
  /** The whole public record, transcript blocks. */
  record: string[];
};

/**
 * The bench sees the public record and nothing private: cast names and roles,
 * exhibits as the court has them, the gate. No truth, integrity, forensics,
 * agendas, knowledge, ledgers or memory.
 */
export function buildBenchPrompt(input: BenchInput): string {
  const { world, trial, state, gate } = input;
  const out: string[] = [];
  out.push('# You are the bench');
  out.push(
    `## The charge\n${trial.charge.question}\n\n${world.publicCaseSummary}` +
      (trial.charge.accusedIds.length ? `\n\nAccused: ${trial.charge.accusedIds.map((id) => findCharacter(world, id)?.name ?? id).join(', ')}.` : ''),
  );
  out.push(`## The cast\n${world.characters.map((c) => `- ${c.name} (${c.id}) — ${c.role}; ${c.category}, ${c.kind}`).join('\n')}`);
  // Exhibits as the court has them; one not yet in the record shows by id and title only when the gate is about it.
  const exhibits = world.evidence.flatMap((e) => {
    const st = state.evidence[e.id]!;
    if (st.status === 'not_introduced') return e.id === gate.raisedBy.targetId ? [`- ${e.id} — ${e.title} (${e.kind}; not in the record)`] : [];
    const notes = st.notes.length ? ` Court notes: ${st.notes.join(' ')}` : '';
    return [`- ${e.id} — ${e.title} (${e.kind}; ${st.status.replace('_', ' ')}): ${e.description}${notes}`];
  });
  out.push(`## The exhibits\n${exhibits.length ? exhibits.join('\n') : '- Nothing is in the record yet.'}`);
  const publicFacts = world.facts.filter((f) => f.publicAtStart).map((f) => `- ${f.id} — ${f.statement}`);
  if (publicFacts.length) out.push(`## In the public record from the start\n${publicFacts.join('\n')}`);
  out.push(`## The proceeding so far\n${input.record.length ? input.record.join('\n\n') : '_(nothing yet)_'}`);
  out.push(
    [
      `## The question before the court (${gate.id}, ${gate.trialState}, turn ${state.turn})`,
      gate.question,
      '',
      gate.context,
      '',
      'Options:',
      ...gate.options.map((o) => `- \`${o.id}\` — ${o.label}. If chosen: ${o.effect.text}.`),
    ].join('\n'),
  );
  out.push(
    [
      '## Respond',
      'Recommend one option to the judge. Weigh only what is in the record above; you have no knowledge of what is true. Return exactly one JSON object:',
      '```json',
      '{',
      `  "optionId": "<one of: ${gate.options.map((o) => o.id).join(', ')}>",`,
      '  "reason": "<at most 60 words, plain text>"',
      '}',
      '```',
      'Return only the JSON object — no prose before or after it.',
    ].join('\n'),
  );
  return out.join('\n\n') + '\n';
}

/** Last public speaker and last court line, for section 11. */
export function lastSeen(world: World, events: TrialEvent[]): { lastSpeaker: string | null; lastCourt: string | null } {
  let lastSpeaker: string | null = null;
  let lastCourt: string | null = null;
  for (const ev of events) {
    if (ev.type === 'turn_accepted' && ev.actorId) lastSpeaker = findCharacter(world, ev.actorId)?.name ?? ev.actorId;
    if (ev.type === 'court') lastCourt = String(ev.payload.text);
  }
  return { lastSpeaker, lastCourt };
}
