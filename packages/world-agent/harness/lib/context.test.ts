// The leak test: no character prompt carries ground truth, fact truth values,
// evidence integrity, another character's private DNA, or the ethics ledger.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { World } from '@aot/interview-agent/schema';
import { mikeWorld, miniWorld } from '../fixtures/load.ts';
import { enterState } from './agenda.ts';
import { buildPdPrompt, buildPrompt, type PromptInput } from './context.ts';
import { initialState } from './state.ts';

const TRUTH_WORDS = /\b(true|false|disputed|unknown)\b/i;
const INTEGRITY_WORDS = /\b(integrity|authentic|compromised|misleading|unknown)\b/i;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function stateForLeaks(world: World) {
  const s = enterState(initialState(world), world, 'examination');
  s.turn = 5;
  // Something in the record, something excluded, a forensic note, and a ledger entry that must not surface.
  const [e1, e2] = world.evidence;
  s.evidence[e1!.id] = { status: 'admitted_limited', notes: ['LEAKMARK-NOTE is a court note and may appear'] };
  if (e2) s.evidence[e2.id] = { status: 'excluded', notes: [] };
  for (const c of world.characters) s.ethicsLedger[c.id] = [{ turn: 2, key: 'intentional_deception', delta: -20, note: `LEAKMARK-LEDGER-${c.id}` }];
  return s;
}

function check(world: World, label: string) {
  const state = stateForLeaks(world);
  for (const c of world.characters) {
    const input: PromptInput = { world, state, character: c, record: ['**THE COURT** — We move to examination.'], memory: `- MEMORY-${c.id}`, lastSpeaker: null, lastCourt: null };
    const prompts = [buildPrompt(input)];
    if (world.prisonersDilemma?.participants.includes(c.id)) prompts.push(buildPdPrompt(input));
    for (const prompt of prompts) {
      test(`${label}: ${c.id} prompt leaks nothing`, () => {
        assert.ok(prompt.includes(`MEMORY-${c.id}`));
        assert.ok(!prompt.includes('LEAKMARK-LEDGER'), 'ethics ledger note leaked');
        assert.ok(!prompt.includes(world.groundTruth.summary), 'groundTruth.summary leaked');
        for (const r of world.groundTruth.reveal) assert.ok(!prompt.includes(r), 'groundTruth.reveal leaked');
        for (const t of world.groundTruth.timeline) assert.ok(!prompt.includes(t.description), 'timeline leaked');
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
}

check(miniWorld(), 'mini');
const mike = mikeWorld();
if (mike) check(mike, 'mike');
else test.skip('mike world absent');

test('the pd prompt reads the payoff from the participant’s side', () => {
  const world = miniWorld();
  const state = initialState(world);
  const [a, b] = world.prisonersDilemma!.participants;
  const mk = (id: string): PromptInput => ({ world, state, character: world.characters.find((c) => c.id === id)!, record: [], memory: '', lastSpeaker: null, lastCourt: null });
  const pa = buildPdPrompt(mk(a));
  const pb = buildPdPrompt(mk(b));
  // confess_silent = [first confesses, second silent]: +10,000 / −100,000.
  assert.ok(pa.includes('| confess | you -50,000 · Optimus -50,000 | you 10,000 · Optimus -100,000 |'));
  assert.ok(pb.includes('| confess | you -50,000 · Cookie -50,000 | you 10,000 · Cookie -100,000 |'));
  assert.ok(pa.includes('"choice": "confess" | "silent"'));
  assert.ok(!pa.includes('## Your allowed actions'));
});

test('knowledge lines use access words and stance, never the truth value', () => {
  const world = miniWorld();
  const state = initialState(world);
  const c = world.characters.find((x) => x.id === 'COOKIE')!;
  const p = buildPrompt({ world, state, character: c, record: [], memory: '', lastSpeaker: null, lastCourt: null });
  assert.ok(p.includes('- F-01 — "The kitchen camera went dark at midnight." — you know this is not the case (source: you cut the feed at 23:40).'));
  assert.ok(p.includes('- F-04 — "OPTIMUS holds a spare pantry key." — you do not know whether this is the case.'));
  assert.ok(p.includes('E-02 — Pantry access record (forensic_result; known to you, not yet introduced; available from the examination phase)'));
});
