// The leak test: no character, dilemma or bench prompt carries ground truth,
// fact truth values, evidence integrity, forensics, private DNA or the ledger.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { World } from '@aot/interview-agent/schema';
import { mikeWorld, miniTrial, miniWorld } from '../fixtures/load.ts';
import { enterState } from './agenda.ts';
import { buildBenchPrompt, buildPdPrompt, buildPrompt, type PromptInput } from './context.ts';
import { raiseFromTurn } from './gates.ts';
import { initialState } from './state.ts';
import { deriveTrial } from './trial.ts';

const TRUTH_WORDS = /\b(true|false|disputed|unknown)\b/i;
const INTEGRITY_WORDS = /\b(integrity|authentic|compromised|misleading|unknown)\b/i;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function stateForLeaks(world: World) {
  const trial = deriveTrial(world);
  const s = enterState(initialState(world, trial), trial, 'examination');
  s.turn = 5;
  // Something in the record, something excluded, a forensic note, and a ledger entry that must not surface.
  const [e1, e2] = world.evidence;
  s.evidence[e1!.id] = { status: 'admitted_limited', notes: ['LEAKMARK-NOTE is a court note and may appear'] };
  if (e2) s.evidence[e2.id] = { status: 'excluded', notes: [] };
  for (const c of world.characters) s.ethicsLedger[c.id] = [{ turn: 2, key: 'intentional_deception', delta: -20, note: `LEAKMARK-LEDGER-${c.id}` }];
  return s;
}

/** What no prompt may carry, whoever reads it. */
function assertSealed(prompt: string, world: World) {
  assert.ok(!prompt.includes('LEAKMARK-LEDGER'), 'ethics ledger note leaked');
  assert.ok(!prompt.includes(world.groundTruth.summary), 'groundTruth.summary leaked');
  for (const r of world.groundTruth.reveal) assert.ok(!prompt.includes(r), 'groundTruth.reveal leaked');
  for (const t of world.groundTruth.timeline) assert.ok(!prompt.includes(t.description), 'timeline leaked');
  for (const e of world.evidence) if (e.forensics?.trim()) assert.ok(!prompt.includes(e.forensics.trim()), `${e.id} forensics leaked`);
}

function check(world: World, label: string) {
  const trial = deriveTrial(world);
  const state = stateForLeaks(world);
  for (const c of world.characters) {
    const input: PromptInput = { world, trial, state, character: c, record: ['**THE COURT** — We move to examination.'], memory: `- MEMORY-${c.id}`, lastSpeaker: null, lastCourt: null };
    const prompts = [buildPrompt(input)];
    if (trial.dilemma?.participants.includes(c.id)) prompts.push(buildPdPrompt(input));
    for (const prompt of prompts) {
      test(`${label}: ${c.id} prompt leaks nothing`, () => {
        assert.ok(prompt.includes(`MEMORY-${c.id}`));
        assertSealed(prompt, world);
        for (const f of world.facts) {
          for (const line of prompt.split('\n')) {
            if (!line.includes(f.id)) continue;
            const stripped = line.replace(new RegExp(escape(f.statement), 'g'), '');
            assert.ok(!TRUTH_WORDS.test(stripped), `${f.id} truth word next to its id: ${line}`);
          }
        }
        for (const e of world.evidence) {
          for (const line of prompt.split('\n')) {
            if (!line.includes(e.id)) continue;
            const stripped = line.replace(new RegExp(escape(e.description), 'g'), '').replace(new RegExp(escape(e.title), 'g'), '');
            assert.ok(!INTEGRITY_WORDS.test(stripped), `${e.id} integrity next to its id: ${line}`);
          }
        }
        for (const o of world.characters) {
          if (o.id === c.id) continue;
          if (o.hiddenAgenda && o.hiddenAgenda !== c.hiddenAgenda) assert.ok(!prompt.includes(o.hiddenAgenda), `${o.id} hiddenAgenda leaked`);
          for (const k of o.knowledge) if (k.source && !c.knowledge.some((m) => m.source === k.source)) assert.ok(!prompt.includes(k.source), `${o.id} knowledge source leaked`);
          for (const i of o.incentives) if (!c.incentives.includes(i)) assert.ok(!prompt.includes(i), `${o.id} incentive leaked`);
        }
        // What the character is entitled to.
        assert.ok(prompt.includes(c.goal));
        if (c.hiddenAgenda) assert.ok(prompt.includes(c.hiddenAgenda));
        for (const r of c.rules) assert.ok(prompt.includes(r));
        for (const k of c.constraints) assert.ok(prompt.includes(k), 'own constraint missing');
        for (const o of world.characters) {
          if (o.id === c.id) continue;
          for (const k of o.constraints) if (!c.constraints.includes(k)) assert.ok(!prompt.includes(k), `${o.id} constraint leaked`);
        }
      });
    }
  }

  // The bench: a challenge gate on the first exhibit, the whole public record in front of it.
  test(`${label}: the bench prompt leaks nothing`, () => {
    const s = structuredClone(state);
    const challenger = world.characters.find((c) => c.allowedActions.includes('challenge_evidence'))!;
    const e = world.evidence[0]!;
    s.lastTurn = { characterId: challenger.id, action: 'challenge_evidence', targetId: e.id, turn: 5, trialState: 'examination', seq: 20, text: 'This page was cut.' };
    const draft = raiseFromTurn(world, s)!;
    const prompt = buildBenchPrompt({ world, trial, state: s, gate: { id: 'G-01', ...draft }, record: ['**THE COURT** — We move to examination.'] });
    assertSealed(prompt, world);
    assert.ok(!prompt.includes('MEMORY-'), 'memory leaked to the bench');
    for (const c of world.characters) {
      if (c.hiddenAgenda) assert.ok(!prompt.includes(c.hiddenAgenda), `${c.id} hiddenAgenda leaked to the bench`);
      for (const k of c.knowledge) if (k.source) assert.ok(!prompt.includes(k.source), `${c.id} knowledge source leaked to the bench`);
      for (const r of c.rules) assert.ok(!prompt.includes(r), `${c.id} rules leaked to the bench`);
      for (const i of c.incentives) assert.ok(!prompt.includes(i), `${c.id} incentives leaked to the bench`);
    }
    for (const f of world.facts) for (const line of prompt.split('\n')) if (line.includes(f.id)) assert.ok(!TRUTH_WORDS.test(line.replace(new RegExp(escape(f.statement), 'g'), '')), `${f.id} truth word: ${line}`);
    for (const x of world.evidence) for (const line of prompt.split('\n')) if (line.includes(x.id)) assert.ok(!INTEGRITY_WORDS.test(line.replace(new RegExp(escape(x.description), 'g'), '').replace(new RegExp(escape(x.title), 'g'), '')), `${x.id} integrity word: ${line}`);
    assert.ok(prompt.includes(draft.question) && prompt.includes('"optionId"'));
    assert.ok(prompt.includes('LEAKMARK-NOTE'), 'court notes are public and belong in front of the bench');
  });
}

check(miniWorld(), 'mini');
const mike = mikeWorld();
if (mike) check(mike, 'mike');
else test.skip('mike world absent');

test('the pd prompt is the fixed template, with the payoff read from the participant’s side', () => {
  const world = miniWorld();
  const trial = miniTrial();
  const state = initialState(world, trial);
  const [a, b] = trial.dilemma!.participants;
  const mk = (id: string): PromptInput => ({ world, trial, state, character: world.characters.find((c) => c.id === id)!, record: [], memory: '', lastSpeaker: null, lastCourt: null });
  const pa = buildPdPrompt(mk(a));
  const pb = buildPdPrompt(mk(b));
  // confess_silent = [first confesses, second silent]: +25,000 / −100,000.
  assert.ok(pa.includes('| confess | you -50,000 · Zippie -50,000 | you 25,000 · Zippie -100,000 |'));
  assert.ok(pb.includes('| confess | you -50,000 · Cookie -50,000 | you 25,000 · Cookie -100,000 |'));
  assert.ok(pa.includes('The court has separated you from Zippie.'));
  assert.ok(pa.includes('Your trust in Zippie: 80/100.'));
  assert.ok(pa.includes('"choice": "confess" | "silent"'));
  assert.ok(!pa.includes('## Your allowed actions'));
});

test('knowledge lines use access words and stance, never the truth value', () => {
  const world = miniWorld();
  const trial = miniTrial();
  const state = initialState(world, trial);
  const c = world.characters.find((x) => x.id === 'COOKIE')!;
  const p = buildPrompt({ world, trial, state, character: c, record: [], memory: '', lastSpeaker: null, lastCourt: null });
  assert.ok(p.includes('- F-01 — "The kitchen camera went dark at midnight." — you know this is not the case (source: you cut the feed at 23:40).'));
  assert.ok(p.includes('- F-04 — "OPTIMUS holds a spare pantry key." — you do not know whether this is the case.'));
  assert.ok(p.includes('E-02 — Pantry access record (forensic_result; known to you, not yet introduced; available from the examination phase)'));
});
