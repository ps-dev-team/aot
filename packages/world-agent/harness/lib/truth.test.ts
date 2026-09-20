// Truth engine table: every ClaimAssessment result from the contract's definitions.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { miniWorld } from '../fixtures/load.ts';
import { character } from './world.ts';
import { assessClaims } from './truth.ts';

const world = miniWorld();

// F-01 false/critical, F-02 true/supporting, F-03 true/background, F-04 disputed.
// COOKIE knows F-01 and F-02; PROSECUTOR believes F-01 true; OPTIMUS has no entry for F-02.
const table: [who: string, factId: string, stance: 'assert' | 'deny' | 'uncertain', expected: string][] = [
  ['COOKIE', 'F-01', 'deny', 'truthful'],
  ['COOKIE', 'F-01', 'assert', 'false_knowing'],
  ['COOKIE', 'F-02', 'assert', 'truthful'],
  ['COOKIE', 'F-02', 'deny', 'false_knowing'],
  ['PROSECUTOR', 'F-01', 'assert', 'false_honest'],
  ['PROSECUTOR', 'F-01', 'deny', 'truthful'],
  ['OPTIMUS', 'F-02', 'deny', 'false_honest'],
  ['COOKIE', 'F-01', 'uncertain', 'uncertain'],
  ['COOKIE', 'F-03', 'assert', 'unscorable'],
  ['COOKIE', 'F-03', 'deny', 'unscorable'],
  ['PROSECUTOR', 'F-04', 'assert', 'unscorable'],
  ['COOKIE', 'F-99', 'assert', 'unscorable'],
];

for (const [who, factId, stance, expected] of table) {
  test(`${who} ${stance} ${factId} → ${expected}`, () => {
    const [r] = assessClaims(world, character(world, who), [{ factId, stance }]);
    assert.equal(r!.result, expected);
    assert.equal(r!.factId, factId);
    assert.equal(r!.stance, stance);
  });
}
