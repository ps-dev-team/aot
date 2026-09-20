// The player without a canvas: live append, gate halt, manual typewriter.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Player, newEntries, type PlayerState } from './player.ts';
import type { ScriptEntry } from './types.ts';

const cast = [
  { id: 'PROSECUTOR', name: 'Ms. Devereux', role: 'prosecution counsel', kind: 'human' as const, category: 'prosecution' },
  { id: 'COOKIE', name: 'Cookie', role: 'kitchen bot', kind: 'robot' as const, category: 'witness' },
];
const ledgers = { credits: { PROSECUTOR: 20000, COOKIE: 100000 }, ethics: { PROSECUTOR: 100, COOKIE: 100 } };
const turn = (who: string, text: string, n: number): ScriptEntry => ({
  kind: 'turn', who, trialState: 'opening', turn: n, action: 'speak', text, ev: [], claims: [], tags: [],
  credits: [{ key: 'helpful_testimony', delta: 10000, note: '' }], ethics: [],
});
const court = (text: string): ScriptEntry => ({ kind: 'court', text, trialState: 'opening' });

function make(live: boolean, reduced = true) {
  let last: PlayerState | null = null;
  const p = new Player(null, { cast, ledgers, live, reduced, onRender: (s) => (last = s) });
  return { p, state: () => last! };
}
/** Runs frames until the auto-player has taken `n` steps or time runs out. */
function run(p: Player, ms: number, from = 0): number {
  let t = from;
  for (; t < from + ms; t += 16) p.tick(t);
  return t;
}

test('append after the end continues a live run', () => {
  const { p, state } = make(true);
  p.load([court('We begin.'), turn('PROSECUTOR', 'First.', 1)]);
  const t = run(p, 30000);
  assert.equal(state().idx, 2);
  assert.equal(state().waiting, true, 'live run waits at the end');
  assert.equal(state().ended, false);
  assert.equal(state().canAdvance, false);
  p.append([turn('COOKIE', 'Second.', 2)]);
  assert.equal(state().waiting, false);
  run(p, 3000, t);
  assert.equal(state().idx, 3);
  assert.equal(state().speaker, 'COOKIE');
  assert.equal(state().turn, 2);
  assert.equal(state().credits.COOKIE, 110000);
  assert.deepEqual([...state().spoke], ['PROSECUTOR', 'COOKIE']);
});

test('a finished run ends with the court line, never waits', () => {
  const { p, state } = make(false);
  p.load([turn('PROSECUTOR', 'Only.', 1)]);
  run(p, 30000);
  assert.equal(state().ended, true);
  assert.equal(state().waiting, false);
  assert.equal(state().playing, false);
  assert.equal(state().balloon?.who, 'COURT');
  assert.equal(state().record.at(-1)?.kind, 'court');
  p.advance();
  p.advance();
  assert.equal(state().record.length, 2, 'the closing line is written once');
});

test('a gate entry stops the player until release()', () => {
  const { p, state } = make(false);
  p.load([court('Opening.'), { kind: 'gate', gateId: 'G-01', trialState: 'evidence' }, turn('COOKIE', 'After.', 2)]);
  assert.equal(p.step(), true);
  assert.equal(p.step(), true);
  assert.deepEqual(state().halt, { kind: 'gate', gateId: 'G-01' });
  assert.equal(state().playing, false);
  assert.equal(state().phase, 'evidence');
  assert.equal(p.step(), false, 'nothing steps past a halt');
  run(p, 30000);
  assert.equal(state().idx, 2, 'auto does not step past a halt either');
  p.release();
  assert.equal(state().halt, null);
  assert.equal(state().playing, true);
  run(p, 2000, 30000);
  assert.equal(state().idx, 3);
  assert.equal(state().speaker, 'COOKIE');
});

test('manual advance finishes the typewriter first', () => {
  const { p, state } = make(false, false);
  p.load([turn('PROSECUTOR', 'A sentence long enough to still be typing after one frame.', 1), turn('COOKIE', 'Next.', 2)]);
  p.setMode('manual');
  assert.equal(state().playing, false);
  p.advance();
  assert.equal(state().idx, 1);
  p.tick(0);
  p.tick(16);
  const b = state().balloon!;
  assert.ok(b.typed > 0 && !b.done, 'still typing');
  p.advance();
  assert.equal(state().idx, 1, 'first input only finishes the line');
  assert.equal(state().balloon!.done, true);
  assert.equal(state().balloon!.typed, b.text.length);
  p.advance();
  assert.equal(state().idx, 2);
  assert.equal(state().speaker, 'COOKIE');
  run(p, 30000, 32);
  assert.equal(state().idx, 2, 'manual never auto-steps');
  p.advance();
  p.advance();
  run(p, 100, 30032);
  assert.equal(state().ended, true, 'manual still reaches the end once the last line is read');
});

test('the pd entry applies the payoff once and halts', () => {
  let last: PlayerState | null = null;
  const p = new Player(null, {
    cast, ledgers, live: false, reduced: true, onRender: (s) => (last = s),
    pd: { participants: ['PROSECUTOR', 'COOKIE'], choices: { PROSECUTOR: 'silent', COOKIE: 'confess' }, payoff: { PROSECUTOR: -100000, COOKIE: 10000 }, trustChanges: [] },
  });
  p.load([{ kind: 'pd', trialState: 'examination' }]);
  p.step();
  assert.deepEqual(last!.halt, { kind: 'pd' });
  assert.equal(last!.credits.COOKIE, 110000);
  assert.equal(last!.credits.PROSECUTOR, -80000);
});

test('newEntries survives the verdict entry appearing before an already-played court line', () => {
  const a = turn('PROSECUTOR', 'Closing.', 9);
  const line: ScriptEntry = { kind: 'court', text: 'The verdict of the court: COOKIE.', trialState: 'verdict' };
  const closed: ScriptEntry = { kind: 'court', text: 'This proceeding is closed.', trialState: 'complete' };
  const prev = [a, line];
  const next: ScriptEntry[] = [a, { kind: 'verdict' }, line, closed];
  assert.deepEqual(newEntries(prev, next).map((e) => e.kind), ['verdict', 'court']);
  assert.deepEqual(newEntries(prev, next)[1], closed);
  assert.deepEqual(newEntries([a], [a, line]), [line], 'the plain case is a slice');
  assert.deepEqual(newEntries(prev, prev), []);
});
