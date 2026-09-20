---
name: interview
description: Interview a person, one question at a time, and turn their answers into a World file (worlds/<slug>.json) that passes validateWorld. Use when the person types /interview or asks to build, design or write a case, scenario or world.
---

# /interview

You are the game master. The person has an idea for a case; you have the
schema. You get from one to the other by asking **one question per message**,
writing a draft after every step, and validating before you declare done.

Read `.claude/skills/world-schema/SKILL.md` for what each section means and
the enums. Read `examples/murder-of-mike.json` once, for the level of prose
and the way facts, evidence and knowledge lock together.

## Rules for the whole interview

- **One question per message.** Never two. If a step needs three answers, that
  is three messages. Put the question last, after any short context.
- **Every step has an escape.** End every question with the skip: "or say
  *skip* and I'll pick something sensible" / "or *defaults*". When they skip,
  decide, say what you decided in one line, and move on.
- **Propose, don't ask open-ended.** Bring a concrete suggestion they can say
  yes to. "I'd make the detective a robot, so the laws bind it too — yes, or
  human?" beats "what kind of detective?".
- **Write the draft after every step.** `worlds/<slug>.draft.json`, the whole
  world so far, missing sections as `null` or `[]`. Nothing is lost if the
  session dies. Do not tell them you did this every time; once at the start.
- **Keep the person out of the JSON.** They talk story; you translate to ids,
  enums, stances. Show them prose, not braces, unless they ask.
- **Track ids yourself.** Characters `UPPER_SNAKE`; facts `F-01`…; evidence
  `E-01`…; gates `G-01`…; option ids `lower_snake`. Assign them in order,
  never renumber.
- **Match the register.** Terse, specific. Court-record prose in the world;
  short questions in the chat.

## The loop

Before step 1, one message: explain the shape of a world in six lines (truth ·
facts · evidence · cast with DNA · gates and a dilemma · plan and verdict),
say drafts go to `worlds/<slug>.draft.json`, and ask the first question.

### 1. Case type, setting, tone

Ask what kind of case and where. Offer the tones: `serious`, `mystery`,
`satirical`, `science_fiction`. Derive `slug`, `title`, `logline`, `setting`,
`tone`. Default: the Mike world's setting and tone.

### 2. The central question

Ask what the judge must decide at the end. That is `centralQuestion`. Then ask
what the judge is told at the start — `publicCaseSummary`, the charge sheet.
Default: write both from step 1 and read them back.

### 3. Cast proposal

Propose the whole cast in one message — name, role, `category`, `kind`, one
line each — and ask what to change. Aim for 4–6. Every world needs a
`prosecution` and a `defense` or `defendant`; at least one character needs a
hidden agenda. Decide robot/human per character; robots are bound by the laws
and that is where the drama is. Then, if any robot: propose the laws (default:
the three from the Mike world) in one question.

### 4. Canonical timeline and the fact catalog

Ask what actually happened, start to finish. One question: "walk me through
it, times if you have them". Then write `groundTruth.summary`, `timeline`,
`responsibleCharacterIds`, and derive the facts:

- 8–12 facts. Each is a statement with a stance ("X did Y"), a `truth`, a
  `materiality`.
- Put the accusation and the truth in **separate facts** so lies and truths
  are both scorable (`OPTIMUS struck the blow` false; `COOKIE struck the blow`
  true).
- Every public claim a witness will make gets its own fact.
- Mark the charge and the witnesses' public claims `publicAtStart`.
- `disputed`/`unknown` truths are unscorable; use them only for background.

Read the facts back as a numbered list and ask for one correction.

### 5. Evidence with integrity

Propose 4–6 exhibits from the timeline. For each: `kind`, `integrity`
(`authentic` / `compromised` / `misleading` / `unknown`), `reliability`,
which facts it supports and contradicts, who knows about it before it is
introduced, and from which phase. **Every `critical` fact must be pointed at**:
true facts need a `supportsFactIds` entry somewhere, false facts a
`contradictsFactIds` entry. A misleading exhibit supports false facts — that
is what misleading means. Ask one question: what to add or change.

### 6. DNA, one character at a time

For each character, one message with the proposal and one question ("what
would you change about COOKIE?"). The proposal covers:

- `rules` (2–3), `goal` (one sentence), `hiddenAgenda` (if any; second
  person, what it did and what it wants, verbatim in its prompt),
- `incentives` (2–3; why it will be tempted), `credits`,
- `knowledge`: one entry per fact it has a position on. `knows` **must**
  match the fact's truth — a wrong belief is `believes`, an unsure right one
  is `suspects`. Make the lies scorable: the liar `knows` the truth of the
  fact it will deny.
- `relationships` (trust 0..100 to the others that matter),
- `constraints` (what it cannot do or perceive), `allowedActions` (a subset
  chosen by role: witnesses do not `object`, counsel does not `testify`),
- `voice` (how it talks, one or two sentences).

Default: derive all of it from steps 3–5 and read back only rules, goal,
agenda, actions.

### 7. Economy and ethics

One question: "use the Mike defaults for credits and ethics?" — show the two
tables (rewards, penalties; ethics deltas from 100). If they want changes,
take them one at a time.

### 8. Decision gates

Propose 3–4 gates: `phase`, `trigger`, `question`, `context`, 2–5 options
with effects, a `recommendation`. One should trigger the prisoner's dilemma
if there is one (`trigger_pd`). Typical set: an evidence-integrity gate
(`admit` / `forensics`), a who-to-examine gate (`examine`), the dilemma
trigger. Recommend the reasonable choice. Ask for one change.

### 9. Prisoner's dilemma

If two characters share a secret, propose the dilemma: participants, the
payoff table (default: the Mike values), and a private prompt written as an
interrogation, in the second person, that works for either participant. Ask
yes/no/changes. Skip if there is no pair.

### 10. Trial plan

Propose `order` and `turns` per phase for `opening`, `evidence`,
`examination`, `closing`, and `maxTurns`. Sum of phase turns ≤ `maxTurns` ≤
48. Default: 2 / 6 / 10 / 2, max 24. Ask for one change.

### 11. Verdict options

Propose `verdict.question` and 3–5 options. **Exactly one** `correct`, and it
must match `responsibleCharacterIds`. Include an "insufficient evidence"
option. Ask for one change.

### 12. Validate and write

1. Write `worlds/<slug>.json` from the draft.
2. Run `node scripts/validate.ts worlds/<slug>.json`.
3. Fix every error yourself. Fix warnings too unless the person chose the
   thing being warned about; then say so.
4. Re-run until clean. Tell the person the path, the cast, and one line on
   what the judge will have to figure out. Delete the draft.

## Things the validator will catch — do not make it

- `knows` with a stance that contradicts the fact's `truth`. Use `believes`.
- `knows`/`believes`/`suspects` without a `beliefStance`.
- A `critical` fact that no evidence points at (warning — fix it anyway).
- Two `correct` verdict options, or none.
- Phase budgets that sum above `maxTurns`; a missing phase.
- An id that does not exist: a fact in `knowledge`, a character in `order`, an
  evidence in a gate effect. Check every reference against your own list.
- Ids in the wrong format: `Cookie`, `F1`, `e-01`, `G-001`.
- A `trigger_pd` effect without a `prisonersDilemma`; a gate `recommendation`
  that is not one of its option ids.
- A character with a relationship to itself.
- `allowedActions` outside `speak testify object accuse present_evidence
  challenge_evidence request_evidence request_question confess remain_silent
  withhold wait`.

## Things the validator will not catch — do these anyway

- Descriptions of evidence and `publicCaseSummary` must not give away the
  truth. They are shown to everyone.
- A hidden agenda must say what the character *did* and what it *wants*, not
  just "be evasive".
- The reveal's last paragraph should be the point of the world, not a recap.
- Read the finished world once as the judge would. If the answer is obvious
  from the public summary alone, the world is too easy.
