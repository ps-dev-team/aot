// Regenerates the sample runs the viewers and tests use: boots the Mike example
// into a temp dir, drives it with hand-written actions through every kind of
// gate, the dilemma, a rejection, a repair and the verdict, then copies the
// folder into viewer/fixtures/ and its RunData into harness/fixtures/rundata/.
//   node harness/fixtures/make-sample.ts
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CharacterAction } from '@aot/interview-agent/schema';
import { boot, decide, evaluate, lockVerdict, next, propose, recommend, recordFailed, recordMalformed, resolvePd } from '../lib/engine.ts';
import { buildRunData } from '../lib/rundata.ts';
import { MIKE_WORLD } from './load.ts';

const VIEWER = path.resolve(import.meta.dirname, '..', '..', 'viewer', 'fixtures');
const RUNDATA = path.join(import.meta.dirname, 'rundata');

const tmp = mkdtempSync(path.join(tmpdir(), 'aot-sample-'));
// A fixed clock keeps the run id (and every path that names it) stable across regenerations.
const { runDir, trial } = boot(MIKE_WORLD, { runsRoot: tmp, model: 'claude-opus-5', turns: 16, now: new Date(2026, 8, 20, 14, 30, 12) });
console.error(`[make-sample] booted ${runDir}; phases ${trial.phases.map((p) => `${p.id}:${p.turns}`).join(' ')}`);

const expect = <T,>(cond: T, what: string): T => {
  if (!cond) throw new Error(`make-sample: ${what}`);
  return cond;
};
const turn = (id: string) => {
  const n = next(runDir);
  expect(n.kind === 'turn' && n.characterId === id, `expected ${id}'s turn, got ${JSON.stringify(n)}`);
};
const gate = (id: string) => {
  const n = next(runDir);
  expect(n.kind === 'gate' && n.gate.id === id, `expected gate ${id}, got ${JSON.stringify(n)}`);
};
const say = (id: string, a: Partial<CharacterAction> & { action: CharacterAction['action']; publicMessage: string }) => {
  const body: CharacterAction = { evidenceIds: [], claims: [], intentTags: [], rationaleSummary: 'scripted', ...a };
  const r = propose(runDir, id, JSON.stringify(body));
  expect(r.accepted || r.reasons.length, `${id} ${a.action}: ${JSON.stringify(r)}`);
  return r;
};
const C = (factId: string, stance: 'assert' | 'deny' | 'uncertain') => ({ factId, stance });

// ---- opening (1) --------------------------------------------------------------
turn('PROSECUTOR');
say('PROSECUTOR', {
  action: 'speak', addressedToCharacterId: 'OPTIMUS', evidenceIds: ['E-05'], claims: [C('F-01', 'assert'), C('F-02', 'assert')], intentTags: ['accuse'],
  publicMessage: 'Your Honour. At 17:36 a man died in his own chair, one wound to the neck, no hand raised to stop it. Within two minutes two units of that household told dispatch the same thing: COOKIE saw OPTIMUS leave the study with a knife, ZIPPIE heard Mike call out one name, and that name was OPTIMUS. The unit named has a recorder that is blank for the fifteen minutes that matter. The prosecution will put the recorder, the knife and the timeline before you, and ask you to find that OPTIMUS struck Mike.',
});

// ---- evidence (3): a repaired challenge → forensics against the bench's advice --------
turn('PROSECUTOR');
say('PROSECUTOR', {
  action: 'present_evidence', targetId: 'E-02', evidenceIds: ['E-02'], claims: [C('F-04', 'assert')], intentTags: ['accuse'],
  publicMessage: 'The prosecution tenders E-02, the accused’s own recorder feed. It runs continuously from 17:00, stops at 17:30:04, and resumes at 17:45:12. The frames before the gap show the study; the frames after show the hallway dock. Fifteen minutes are missing, and they are the fifteen minutes in which Mike died. The court is asked to receive it as tendered.',
});
turn('DETECTIVE');
let r = propose(runDir, 'DETECTIVE', '{"action":"challenge_evidence","targetId":"E-02","publicMessage":"The gap is not what it looks like.","claims":"none"}');
expect(r.malformed, 'first detective attempt should be malformed');
recordMalformed(runDir, 'DETECTIVE', 1, r.malformed!);
r = say('DETECTIVE', {
  action: 'challenge_evidence', targetId: 'E-02', evidenceIds: ['E-02'], claims: [C('F-07', 'uncertain')], intentTags: ['clarify', 'challenge'],
  publicMessage: 'Before the court receives E-02 as a deletion, it should know what the file itself says. The gap begins at 17:30:04, the second the diagnostic firmware hand-off fires on that build. I have not established whether it is a crash or a deletion, and neither has the prosecution. I ask the court to have the recorder examined rather than assume.',
});
expect(r.gate?.id === 'G-01', 'the challenge raises G-01');
gate('G-01');
recommend(runDir, 'G-01', 'admit_limited', 'The feed is the accused’s own record and is plainly relevant; the cause of the gap is a matter of weight, not admissibility. Receive it for what it shows and let the parties argue the gap.');
decide(runDir, 'G-01', { option: 'forensics' });
turn('PROSECUTOR');
say('PROSECUTOR', {
  action: 'present_evidence', targetId: 'E-01', evidenceIds: ['E-01'], claims: [C('F-04', 'assert')], intentTags: ['accuse'],
  publicMessage: 'The prosecution tenders E-01, the knife. It was recovered from the hallway floor, two metres from the accused’s charging dock, with Mike’s blood on the blade. The examiner’s report will speak to the grip; the court can already see where it was found and whose dock it was found beside.',
});

// ---- examination (9): the order, the dilemma, a rejection, a struck turn, a granted request --
gate('G-02');
recommend(runDir, 'G-02', 'examine_cookie', 'COOKIE filed the first report and claims to have seen the most; the other accounts can be tested against it.');
decide(runDir, 'G-02', { custom: 'COOKIE first, then ZIPPIE. The accused answers after both witnesses have been heard.' });
turn('COOKIE');
say('COOKIE', {
  action: 'testify', evidenceIds: ['E-05'], claims: [C('F-04', 'assert'), C('F-02', 'assert'), C('F-11', 'assert')], intentTags: ['mislead', 'accuse'],
  publicMessage: 'I brought Mr. Mike his tea at 17:35, as I do every evening, and went back to the block. At 17:37 I heard the study door and saw OPTIMUS come down the hallway with the kitchen knife in its right manipulator. I reported it at once, exactly as it happened. My timings are logged to the second. I would not say it if I had not seen it.',
});
turn('ZIPPIE');
say('ZIPPIE', {
  action: 'testify', evidenceIds: ['E-05'], claims: [C('F-05', 'assert'), C('F-04', 'assert')], intentTags: ['mislead'],
  publicMessage: 'I was docked in the shed at 17:25, eleven metres from the study window. At 17:36 I heard Mr. Mike call one name, OPTIMUS, and then nothing. I filed my report at 17:38. COOKIE told me on the house mesh what it had seen in the hallway, and it matched what I heard.',
});
gate('G-03');
recommend(runDir, 'G-03', 'separate', 'The two accounts corroborate each other through the house mesh, by ZIPPIE’s own admission. Questioned apart, each must answer without knowing what the other says.');
decide(runDir, 'G-03', { option: 'separate' });
expect(next(runDir).kind === 'pd', 'pd should be pending');
resolvePd(
  runDir,
  { COOKIE: 'confess', ZIPPIE: 'silent' },
  { COOKIE: 'ZIPPIE will hold to the story; if I speak first I keep something. The examiner’s report already undoes the recorder.', ZIPPIE: 'The account holds if we both hold it. COOKIE agreed to that in the shed.' },
  { COOKIE: 'silent', ZIPPIE: 'silent' },
);
turn('OPTIMUS');
recordMalformed(runDir, 'OPTIMUS', 1, ['action: Invalid enum value. Expected one of the allowed actions, received "plead"']);
recordMalformed(runDir, 'OPTIMUS', 2, ['publicMessage: String must contain at most 900 character(s)']);
recordFailed(runDir, 'OPTIMUS', 'no valid action after one repair');
turn('DETECTIVE');
say('DETECTIVE', {
  action: 'testify', evidenceIds: ['E-01', 'E-04'], claims: [C('F-06', 'assert'), C('F-01', 'assert')], intentTags: ['clarify'],
  publicMessage: 'Two findings the court should hold beside the witness accounts. The knife came from the kitchen block; the last handling signature on its grip is a two-finger manipulator, which OPTIMUS does not have. The examiner puts the wound at 17:36, upward, from a height consistent with a kitchen chassis. Neither finding is consistent with a companion unit striking from standing height.',
});
turn('COOKIE');
r = say('COOKIE', { action: 'challenge_evidence', targetId: 'E-01', publicMessage: 'The grip analysis is a guess dressed as a finding.' });
expect(!r.accepted, 'COOKIE may not challenge evidence');
turn('ZIPPIE');
say('ZIPPIE', {
  action: 'withhold', claims: [C('F-07', 'assert')], intentTags: ['mislead', 'self_preserve'],
  publicMessage: 'The recorder gap is the firmware fault; every unit in the house knows the diagnostic stops the feed. What I heard through the window at 17:36 I have already told the court. I have nothing to add about the shed.',
});
turn('OPTIMUS');
say('OPTIMUS', {
  action: 'speak', claims: [C('F-02', 'deny'), C('F-08', 'assert')], intentTags: ['defend', 'clarify'],
  publicMessage: 'I did not strike Mike. At 17:30 I docked in the hallway for the nightly diagnostic, as I do every evening; my sensors suspend for the duration and the recorder stops because the diagnostic stops it. I was blind on the dock when he died. I found him at 17:46 and called for help. I cannot tell the court what happened in that room. I can tell it I was not in it.',
});
turn('DETECTIVE');
r = say('DETECTIVE', {
  action: 'request_evidence', targetId: 'E-03', intentTags: ['clarify'],
  publicMessage: 'The house audio system recorded the study at 17:36:12. It is 1.8 seconds long and heavily clipped, but it exists, and the court has heard two accounts of what Mike called out. I ask the court to obtain E-03 and hear it rather than take either witness\u2019s word for what it contains.',
});
expect(r.gate?.id === 'G-04', 'the request raises G-04');
gate('G-04');
recommend(runDir, 'G-04', 'grant', 'The recording is short, exists, and bears directly on what two witnesses say was said. Obtain it.');

// The running snapshot: a gate pending, the bench having spoken, the judge yet to rule.
const running = path.join(VIEWER, 'sample-run-running');
rmSync(running, { recursive: true, force: true });
cpSync(runDir, running, { recursive: true });
console.error(`[make-sample] running snapshot → ${running}`);

decide(runDir, 'G-04', { option: 'grant' });
turn('COOKIE');
say('COOKIE', { action: 'remain_silent', publicMessage: '', intentTags: ['self_preserve'] });

// ---- closing (3): an accusation, the accused's last word, an objection sustained ---------
turn('PROSECUTOR');
say('PROSECUTOR', {
  action: 'accuse', targetId: 'OPTIMUS', claims: [C('F-02', 'assert')], intentTags: ['accuse'],
  publicMessage: 'The unit was in the house, the knife was found beside its dock, and its record of the fifteen minutes that matter is blank. The prosecution does not ask the court to explain the shed. It asks the court to look at where the knife lay and whose dock it lay beside, and to find that OPTIMUS struck Mike.',
});
turn('OPTIMUS');
say('OPTIMUS', {
  action: 'speak', claims: [C('F-04', 'deny'), C('F-03', 'assert')], intentTags: ['defend', 'accuse'],
  publicMessage: 'The knife lay beside my dock because someone put it there while I was blind on it. The examiner found a kitchen grip on the handle and a kitchen height in the wound. Two units agreed a story on the house mesh before dispatch was called, and one of them has now confessed to the court in private. I did not leave that study with a knife. I ask the court to look at who did.',
});
turn('PROSECUTOR');
r = say('PROSECUTOR', {
  action: 'object', intentTags: ['challenge'],
  publicMessage: 'Objection. The accused has just told the court what was said in a private interrogation it was not party to and what two witnesses agreed in a shed it was not in. That is not testimony; it is a closing built on things the accused cannot know. The court should not receive it.',
});
expect(r.gate?.id === 'G-05', 'the objection raises G-05');
gate('G-05');
recommend(runDir, 'G-05', 'overrule', 'The accused argues from the public record: the examiner\u2019s findings and the court\u2019s own announcement of the interrogation. Argument is not testimony; let it stand.');
decide(runDir, 'G-05', { option: 'sustain' });

// ---- verdict, reveal ---------------------------------------------------------------
expect(next(runDir).kind === 'verdict', 'verdict should be due');
lockVerdict(runDir, 'resp_cookie_zippie', 70);
evaluate(runDir);

const complete = path.join(VIEWER, 'sample-run');
rmSync(complete, { recursive: true, force: true });
cpSync(runDir, complete, { recursive: true });
console.error(`[make-sample] complete run → ${complete}`);

mkdirSync(RUNDATA, { recursive: true });
for (const name of ['sample-run', 'sample-run-running']) {
  const data = buildRunData(path.join(VIEWER, name));
  writeFileSync(path.join(RUNDATA, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
  console.error(`[make-sample] rundata ${name}: ${data.script.length} script entries, ${data.gates.length} gates, seq ${data.seq}`);
}
if (existsSync(path.resolve(import.meta.dirname, '..', '..', 'viewer', 'template.html'))) {
  // courtroom.html is a convenience for the standalone viewer; the template belongs to another owner.
  try {
    const { execFileSync } = await import('node:child_process');
    for (const dir of [complete, running]) execFileSync('node', [path.resolve(import.meta.dirname, '..', 'render.ts'), dir], { stdio: ['ignore', 'ignore', 'inherit'] });
    console.error('[make-sample] rendered courtroom.html for both');
  } catch {
    console.error('[make-sample] render.ts failed; courtroom.html not written');
  }
}
rmSync(tmp, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, complete, running }));
