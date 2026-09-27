# Amp Consult v5: Pinpoint

A proposal for a third route through the consult (`/quizv2`) that works like
20 Questions: your first answers decide what Amp asks next, it follows its
hunches with everyday scenarios, checks what it thinks with you, and ends with
a profile of what's really going on, with the stack built around it.

**Status: proposal only. Nothing in this document is built yet.** The visual
version, with a playable model of the question loop and phone mockups of every
new screen, is at https://claude.ai/artifact/SBPAiHk5TXdAG6sYG5Wmtg.

It replaces Part B of plan v4 (hunches and scenario checks), which was never
built. It's the same idea, taken much further.

It keeps the build rules from v3 and v4: scenes not chat, touch first, collect
then decide, calm when it counts, and rules decide while AI only writes the
words.

---

## 1. The brief, broken down

| You said | What I take it to mean |
|----------|------------------------|
| "I really like these as core questions" | Every screen built so far stays, in the same order, with its journey wording. Pinpoint adds to them and replaces nothing. |
| "It's still not customising this in the way I want it to" | Today the journey picks a set of questions for a *type* of person. The questions should react to *this* person, answer by answer. |
| "Think of the 20 questions ball" | Each answer changes the next question, narrowing down until Amp knows what's going on, and then it names it. |
| "Scenarios… is this something you feel or experience" | Questions become everyday moments people recognise themselves in, answered *That's me*, *Sometimes* or *Not me*. |
| "Build that thing out and spot patterns" | Amp connects answers across areas into named patterns: sleep, caffeine and energy as one story, not three scores. |
| "When you do it can reaffirm that" | When Amp is fairly sure, it says what it thinks and asks you. *Partly* or *Not me* keeps it going. |
| "Depending on how you input the first ones it might change what questions it asks" | Two people who both say they're tired get different follow-ups, because their other answers point different ways. |
| "I still want the AI input, everything we've worked towards" | The AI keeps every job it has and gains new ones (rewording scenarios, reading a described bad day, wording hunches). Rules still decide. |
| "Focuses on style, UI and UX a lot" | New tactile formats, a hunch moment, a live map, a checkpoint and an early exit, each sized to one phone screen. |
| "Build up that profile at the end" | The patterns Amp confirms become your profile: named, with evidence, what was ruled out, and what the stack does about each. |
| "Short, medium and long… recommend this and explain" | Speed run, Deep charge, and Pinpoint as a recommended third route, with a plain reason why it's worth the extra minutes. |
| "Before building anything stop and read back" | This document. No code has changed. |

---

## 2. The idea

| The 20 Questions ball | Amp's Pinpoint |
|-----------------------|----------------|
| Knows a long list of things you might be thinking of | Has a library of **patterns**: everyday explanations for how people feel |
| Asks the question that best splits what's left | Asks the scenario whose answer would change its mind the most |
| Each answer knocks things out | Each answer strengthens some leads and rules others out, visibly |
| "Is it a…?" | "I think I've got something: Wired and tired. Is that you?" |
| Wrong guess? It keeps asking | *Not me* rules it out, *Partly* asks one more, Amp carries on |
| Twenty questions at most | Up to 20, usually 8 to 12, and you can stop whenever you like |

**The loop, after every answer:** Lead (score every pattern) → Ask (the
scenario that best separates the live leads) → Narrow (the answer moves the
leads) → Check (a strong lead is put to you) → Reveal (when nothing left would
change Amp's mind, or you've had enough).

---

## 3. Where it fits

Three routes on the first screen. The heading becomes **"How well should I get
to know you?"**

| Route | Time | What it runs |
|-------|------|--------------|
| **Pinpoint** (first, *Recommended*) | about 6 min | All core screens + up to 4 follow-ups → Pinpoint round → safety check → review with *What I pinpointed* → charge-up with *Joining the dots* → profile and stacks |
| Deep charge | 3–4 min | As today, plus a *"Want me to pinpoint it?"* card on the review |
| Speed run | about 1 min | As today, plus the same card on the review (it adds the core screens Speed run skipped) |

- **Why Pinpoint?** opens one paragraph: "Two people who both say they're
  tired can need completely different things. One's short on sleep, one's
  running on coffee, one isn't eating before training. Pinpoint works out which
  tired you are."
- A line under the cards: you can stop Pinpoint whenever you like, and Amp
  builds from what it has.
- The upgrade offer keeps every answer. The circuit check's answers are still
  only held for the session, so after an upgrade the check is shown again with
  its answers in place (one tap).

---

## 4. The brain

### 4.1 Patterns

A pattern is a plain-English explanation of how someone feels, written about
habits and situations, never conditions. Each has:

- `name` and `line` ("Wired and tired": "Caffeine late in the day, slow to drop
  off, then a crash");
- `journeys` it applies to (builder, ager, weight, everyday);
- `nudges`: how core answers move it ("4+ caffeinated drinks: towards,
  clearly");
- the scenarios that test it (by reference from the probes);
- `effects` on the stack (needs and weights), optional `keepOut` ingredients,
  and a `because` line ("For your 3pm crash").

### 4.2 Scenarios (probes)

One everyday moment plus its answers. For every answer the author writes which
patterns it points **towards** or **away from**, and how strongly: *a little*,
*clearly* or *strongly*. The probabilities are generated from those words, so
review is of sentences ("Breakfast is a coffee: towards Running on empty,
strongly"), not numbers.

### 4.3 The maths

- Each pattern *i* holds a score ℓᵢ in log-odds: journey base rate plus core
  nudges (±0.4 / ±0.8 / ±1.2 for a little / clearly / strongly).
- For each answer *o* of a probe and each pattern it points at, the strength
  generates P(o | i true) and P(o | i false) from a fixed template per format.
  Answering adds ln(P(o|T) / P(o|F)) to ℓᵢ.
- Lead strength pᵢ = 1 / (1 + e^(−ℓᵢ)). Patterns are scored independently, so
  several can be true at once.
- **Next probe:** among eligible, unasked probes, the one with the highest
  expected information gain over live patterns (not pinpointed, not ruled out):
  Σᵢ [H(pᵢ) − Σₒ P(o)·H(pᵢ | o)], with P(o) = pᵢ·P(o|T) + (1 − pᵢ)·P(o|F).
- **Hunch** when pᵢ ≥ 0.75 and at least two *scenario* answers support it
  (answers whose log ratio for *i* is above 0.3; core answers don't count
  towards the two).
- **Verdicts:** *That's me* sets ℓ = +5 and locks it (pinpointed). *Partly* asks
  one more of its probes, then locks at the lighter weight. *Not me* sets
  ℓ = −5 and locks it (ruled out).
- **Auto-ruled-out** when pᵢ < 0.08 after at least one probe has tested it.
- **Stop** when the best gain left is under 0.05 bits, when three patterns are
  pinpointed, at 20 probes, or when the person taps *Build my stack now*
  (offered from probe 5).
- **Checkpoint** at about probe 10: "Two strong leads, one still fuzzy. Three
  more questions, or build now?"
- **Follow-ups inside the core screens** need a gain of at least 0.25 for a
  probe in that section. At most one per core screen, four in total.
- **Variety:** never the same format three times running; easier formats
  first; ties break towards staying in the same area.
- **Contradictions** (a scenario answer that conflicts with a core answer) get
  a clarifying probe: "Earlier you said 9 out of 10 for energy. Is the 3pm
  crash just some days?"
- **Nothing found** is a result: "Honestly? You're in good shape. I'll keep your
  stack to the basics."
- **In the stack:** pinpointed counts in full, *Partly* at 60%, strong but
  unchecked (stopped early, pᵢ ≥ 0.75) at 50%, ruled out not at all. At most
  three pinpointed patterns per person.

Every threshold is a starting value, tuned with the simulated-people test and
then with real answers. Everything is deterministic: same answers, same
questions, same stack.

---

## 5. The experience

Every Pinpoint screen fits one phone screen (checked at 390×664 with the
founder strip, and 375×667). Single-tap probes move on by themselves after the
selected state has shown (one `enter` duration); Back undoes the last answer.

### 5.1 Formats

| Format | Used for | Input | Notes |
|--------|----------|-------|-------|
| **Scenario card** | The workhorse: "Sound like you?" | *That's me* · *Sometimes* · *Not me*; swipe right/left; *Not sure* | Card follows the finger with no transition and settles on the spring. Radio semantics; arrow keys work. *Why I'm asking* says in a line what it separates; *It's more complicated* opens Tell Amp. |
| **This or that** | Telling two leads apart | Two cards; *Both* · *Neither* | "11pm: mind racing, or asleep in minutes?" |
| **How often** (signal meter) | Frequency | Never · Now and then · Most weeks · Most days | Four bars like phone signal; tap or drag across. |
| **Day line** | Timing (last caffeine, the slump, training) | Slider 06:00–24:00, 30-minute steps; quiet extras (*No caffeine*, *It varies*) | `aria-valuetext` "About 4pm". Borrows the sun arc's colours. |
| **Quick fire** | Small facts, change of pace | 2–4 yes/no rows on one screen | Each row flips to its answer; focus moves to the next row. |
| **Hunch card** | The reaffirm moment | *That's me* · *Partly* · *Not me* | Pattern name, the evidence in your words, and what links to what (chips joined by a lit wire). |

### 5.2 The round

1. **So far.** The round opens with Amp's leads glowing on your profile map
   (the existing six-area hexagon, with lines between the areas each lead
   links), and an estimate: "Up to 12 questions, usually about 6". With the AI
   on: *Or tell me about a bad day*.
2. **Probes and hunches** as chosen by §4.3.
3. **Checkpoint** at about 10.
4. **Done:** on to the safety check.

### 5.3 What makes it feel like a game

- **The reticle.** On Pinpoint screens Amp sits inside a focusing ring that
  closes a notch as the top lead strengthens and snaps shut on a pinpoint. The
  one new signature visual.
- **Hot and cold.** Reaction lines become commentary: "Warmer." "Thought so."
  "Ah. Not your sleep, then." Scripted, AI-worded when on.
- **A counter you can trust:** "Question 7 · up to 20", with a time-left
  estimate.
- **Always a way out:** *Build my stack now* from probe 5; the checkpoint.
- **Ruled-out moments:** a crossed-off chip slides into the leads chip.
- **Leads chip:** under the data line; opens *What I'm thinking* (pinpointed,
  still checking, ruled out with the reason, and *Build my stack now*). Leads
  show as words and bars, never percentages.

### 5.4 Motion, haptics, Amp

- All timing from `lib/consult/motion.ts`; no literal durations (the tokens
  test enforces this). New named animations: reticle close, trace draw, chip
  strike. Reduced motion: instant, same layout.
- Haptics: the existing tick on each answer, a double tick when a hunch forms,
  the charge buzz on *That's me*.
- Amp states: `hunch` (leans in, spark), reactions `eureka` (burst on confirm)
  and `puzzled` (tilt on *Not me*). SVG Amp first; the Rive file needs the
  same three.
- The charge-up stays the only full-screen animation.

### 5.5 Comfort mode and accessibility

- Comfort mode (automatic from 65): no swipes (big stacked buttons), no
  auto-advance (explicit Next), bigger type, read aloud available.
- Every gesture has a button. Focus moves to each new question. A polite live
  region announces lead changes ("Amp's lead: Wired and tired", "Ruled out:
  short on sleep").
- axe with contrast on every format in the browser tests.

---

## 6. The profile at the end

- **Review** opens with *What I pinpointed*: each pattern with its evidence
  chips and *Not quite?*; one line for what was ruled out; then the answers and
  the safety check as today. Editing a core answer that a pinpointed pattern
  relied on (its lead without the verdict drops below 0.4) marks it
  **Recheck**: one probe.
- **Charge-up** gains the step *Joining the dots*: lines draw between the
  profile areas each pattern connects, and the names appear. Same 2.6 seconds.
- **Fully charged** shows the profile: each pattern, what the stack does about
  it (product wording only from the claims register), keep-outs, what was ruled
  out, then the three stacks, and one optional tap: *Did Amp get you?*
- **Payload `consult-2.1`**: `patterns: { pinpointed, partly, ruled_out }` (ids
  only) and `because: { [sku]: PatternId[] }`. The validator still accepts
  2.0. The results page can show "Built for: …" later, behind the consult flag.
- Later, optional: a share card, "Amp pinpointed me: Wired and tired".

---

## 7. The AI

| The AI does | The rules do |
|-------------|--------------|
| Rewords each scenario's text to fit the person, using non-sensitive context (journey, goals, training summary, notes from non-sensitive scenes). Answers are never rewritten. | Choose every probe, and when to stop |
| Reads *Tell me about a bad day* (typed or said) into probe answers, shown as cards to confirm | Own the library, links and thresholds |
| Words the hunch play-back from the scripted evidence, and the hot-and-cold lines | Decide hunches and what a verdict changes |
| Writes two sentences of *What I found* | Every product, exclusion and claim |
| Tell Amp on any probe | The safety check and anything sensitive: never sent |

- `ai/copy.ts` gains kinds `probe` (`{ text }`, ≤ 140 characters), `hunch`
  (`{ line }`, ≤ 160) and `found` (`{ text }`, ≤ 200). Each is schema-checked,
  runs the banned-word and claims filters, and falls back to the script.
- Prefetch: while a probe is on screen, the wording for the two likeliest next
  probes is fetched. AI text only replaces the script if it arrives *before*
  the card renders; it never swaps text someone is reading.
- `ai/understand.ts` gains pick kind `probe`, value `probeId:answerKey`,
  validated against the library and limited to probes currently eligible. The
  label comes from the library, not the model.
- Red-team additions: the AI must never name or imply a condition ("sounds
  like you might be anaemic"); a reworded probe that changes meaning or answers
  is discarded.
- With the AI off, Pinpoint works end to end (scripted text, no bad-day box).
  All calls go through `auditRoute` and show in the hub.

---

## 8. Safety, privacy and claims

- Patterns describe situations and habits. None is named after a deficiency or
  illness, and none says what a product does.
- Product wording only from `claims.ts` (e.g. magnesium "contributes to a
  reduction of tiredness and fatigue", never "helps you sleep").
- **v1 is lifestyle only:** sleep timing, caffeine, food habits, training,
  daylight, stiffness. Stress, mood and digestion wait for v2, behind an
  explicit consent like the weight-loss symptoms.
- **Signposting, not diagnosing:** a few combinations add a gentle note, e.g.
  "Tired most days for over a month, even with 8 hours and a varied plate?
  Worth mentioning to your GP or pharmacist." Wording and triggers need
  clinical sign-off.
- The safety check runs after the round and overrides everything. Under-18s
  still stop at "about you".
- Pinpoint answers persist on the phone like other lifestyle answers (resume
  works). DPIA section needed.

---

## 9. The v1 pattern library (working titles)

| Pattern | Mostly for | Recognised as | A test scenario | Changes |
|---------|-----------|---------------|-----------------|---------|
| The 3pm crash | Everyday, weight | Fine in the morning, flat by mid-afternoon | Day line: when the slump hits | energy, basics |
| Wired and tired | Everyday, builders | Tired by day, can't drop off, caffeine late | This or that: 11pm | sleep, stress; keeps caffeine out |
| Short on sleep | Everyone | Drops off fine, not enough hours | Quick fire: snooze, lie-ins, early alarm | sleep |
| Running on empty | Builders, everyday | Training or working on little food | "Before a session, you…" | protein, basics, energy |
| Protein gap | Builders, weight, agers | Protein at one meal, not three | Quick fire: protein per meal | protein |
| Not recovering | Builders | Sore for days, sessions heavier | How often: still sore two days later | recovery, sleep, protein |
| Caffeine to train | Builders | Pre-workout on top of coffee, late sessions | Day line: last caffeine | stimulant-free pre-workout; sleep |
| Sweat it out | Builders (endurance, sport) | Long or hot sessions, salt marks on kit | "After a long session, you…" | hydration |
| Plant-powered gap | Builders, everyday | Plant-based and active | "Fortified foods? Not really." | protein (plant), b12-iron |
| Indoor life | Everyone | Dark commutes, desk all day | "A normal weekday lunchtime" | low-sun |
| Weekend warrior | Builders, everyday | Big efforts crammed into weekends | "The day after a match" | recovery, joints |
| Stiff starter | Agers | Stiff first thing, eases once moving | This or that: mornings or after sitting | joints, collagen, omega |
| Keeping strong | Agers | Stairs, bags, jars getting harder | How often: a low chair takes a push | protein, low-sun (creatine only with sign-off) |
| Staying sharp | Agers, focus goal | Names, keys, losing the thread | "Worse when tired, or most of the time?" | omega (DHA), b12-iron, focus |
| Broken nights | Agers, everyday | Awake at 3am, hard to get back off | How often: awake in the night | sleep |
| Eating less, running low | Weight | Smaller meals, flagging | "A normal lunch now looks like…" | protein, basics |

About 60 probes in total, 3–5 per pattern, many shared. The full content goes
to the pharmacist as a document and a read-only hub page before launch.

---

## 10. How it's built

### 10.1 Modules

| Where | What |
|-------|------|
| `src/lib/consult/pinpoint/library.ts` (+ content JSON) | Patterns and probes as typed data with plain-language links; validated in tests |
| `…/pinpoint/leads.ts` | `leads(answers)`: every pattern's score from core answers, probe answers and verdicts. Pure. |
| `…/pinpoint/choose.ts` | `nextStep(answers, stage)`: `probe` · `hunch` · `checkpoint` · `done`. Gain, variety, stop rules. |
| `…/pinpoint/effects.ts` | Pinpointed patterns → needs, keep-outs, `because` reasons for the engine |
| `…/pinpoint/playback.ts` | Scripted hunch, hot-and-cold and ruled-out lines (the AI's fallbacks) |
| `src/components/consult/pinpoint/` | `PinpointScene`, `ScenarioCard`, `ThisOrThat`, `SignalMeter`, `DayLine`, `QuickFire`, `HunchCard`, `LeadsSheet`, `PatternMap`, `Reticle` |
| `flow.ts`, `scenes.json` | Route `pinpoint`; scenes `follow-move`, `follow-rest`, `follow-fuel`, `follow-body` (after each section's last core screen) and `pinpoint` (the round, before `circuit`); section `pinpoint` in the meter |
| `engine.ts`, `handoff.ts` | Pattern effects in `scoreNeeds`; `ENGINE_VERSION` bump; payload `consult-2.1` |
| `AmpConsult`, `SceneShell`, `Analysis` | Three-route choice and upgrade action; Pinpoint data line, reticle and leads chip; *Joining the dots*; the profile |
| `ai/copy.ts`, `ai/understand.ts` | Kinds `probe`, `hunch`, `found`; pick kind `probe` |
| `lib/analytics/consult.ts`, hub | Events below; a Pinpoint panel; the library page |

### 10.2 Data

```ts
type Route = 'speed' | 'deep' | 'pinpoint'

interface PinpointAnswer {
  /** In order. Back pops the last one of the current stage. */
  asked: { probe: ProbeId; answer: AnswerKey; stage: PinpointStage }[]
  verdicts: Partial<Record<PatternId, 'yes' | 'partly' | 'no'>>
  /** "Build my stack now", or "build now" at the checkpoint. */
  stopped: boolean
}
type PinpointStage = 'follow-move' | 'follow-rest' | 'follow-fuel' | 'follow-body' | 'pinpoint'

interface Pattern {
  id: PatternId
  name: string
  line: string
  journeys: Journey[]
  nudges: { when: Condition; towards: Strength }[]
  effects: { need: NeedId; weight: number }[]
  keepOut?: Ingredient[]
  because: string
}

interface Probe {
  id: ProbeId
  area: SectionId
  format: 'scenario' | 'this-or-that' | 'how-often' | 'day-line' | 'quick-fire'
  text: string                       // ~120 characters at most
  askIf?: Condition                  // e.g. only for plant-based plates
  answers: { key: AnswerKey; label: string; points: { pattern: PatternId; towards: Strength }[] }[]
}

type Strength = 'a little' | 'clearly' | 'strongly'
              | 'away a little' | 'away clearly' | 'away strongly'
```

`ConsultAnswers.pinpoint: PinpointAnswer | null` (null on other routes).

### 10.3 Flow rules

- New condition `{ followUp: SectionId }`: holds on the Pinpoint route when
  that stage has already been started **or** the chooser has a probe for the
  area with gain ≥ 0.25. Once shown, a follow-up stays in `visibleScenes`, so
  index, back, review and resume don't jump.
- `isAnswered('follow-*')`: its one probe answered (or *Not sure*).
  `isAnswered('pinpoint')`: the chooser says done, or `stopped`.
- Back inside a Pinpoint scene pops the last answer of that stage; with none
  left, normal flow back.
- Resume: `pinpoint` persists with the other lifestyle answers, and the current
  step is recomputed from it (deterministic), so it resumes on the exact
  question.
- Upgrade action from a Speed or Deep review: route becomes `pinpoint`; jump to
  the first unanswered core screen (Speed) or the round (Deep).

### 10.4 Analytics (ids and numbers only, never text)

- `consult_probe` `{ probe, format, answer, index, ms }`
- `consult_hunch` `{ pattern, outcome: 'yes' | 'partly' | 'no' }`
- `consult_pinpoint_stop` `{ reason, questions }`
- `consult_upgrade` `{ from: 'speed' | 'deep' }`
- `consult_got_you` `{ yes }`

Hub panel: confirm rate per pattern (under 60% means its links need work),
questions to first pinpoint, drop-off by question number, time per format.

### 10.5 Tests

- **The 20 Questions test:** simulated people with hidden patterns answer as
  those patterns predict, one answer in ten random. Find the main pattern
  within 12 probes at least 9 times in 10; never exceed 20; never repeat a
  probe; never pinpoint anything not confirmed.
- **Golden paths:** fixed answer scripts give an exact probe order (content
  changes show up in review).
- **Library checks:** every pattern has ≥ 3 probes, every probe points
  somewhere, text passes length, banned-word and claims checks.
- **Personas:** each pattern moves the stack as the library says, only when
  pinpointed; every safety persona still passes and still blocks a release.
- **Screens:** every format by touch, keyboard and screen reader; comfort mode;
  axe with contrast; the no-scroll check at both phone sizes; reduced motion;
  AI on, off and slow.

---

## 11. Build order

Three builds at a time, a status update after each, pushed to the branch and
master. Pinpoint stays at `/quizv2` behind the founder login.

| Phase | What | Done when |
|-------|------|-----------|
| 1 · The brain (nothing visible) | Library format and v1 draft content; leads; chooser; stack effects | Same answers give the same probes and stack; the 20 Questions test passes; personas pass |
| 2 · Playable | Three-route choice; the round with scenario cards, this-or-that, hunches, ruled-out moments, reticle and leads chip; review's *What I pinpointed*; resume | A full Pinpoint run works on a phone by touch and keyboard, and resumes on the right question |
| 3 · The full set | Signal meter, day line, quick fire; follow-ups in the core screens; checkpoint and early exit; comfort versions; phone-fit and accessibility pass | Every format passes axe and the no-scroll check; comfort mode never auto-advances |
| 4 · The payoff | *Joining the dots*; the profile on Fully charged; payload 2.1; the upgrade offer | Every pinpointed pattern shows with its evidence and what the stack does; the upgrade keeps every answer |
| 5 · AI | Probe rewording, bad-day reading, hunch wording, *What I found*; fake OpenAI and live check; red-team | Every AI piece has a scripted fallback, shows in the AI log and passes red-team |
| 6 · Measure and tune | Events; hub panel; library page; A/B of Pinpoint as recommended | Confirm rate per pattern and drop-off by question visible in the hub |

Phase 1 can start while the content is with the pharmacist; nothing goes live
without that sign-off.

---

## 12. Decisions made (overrule any)

1. The name is **Pinpoint** (alternatives: Full charge, Deep dive).
2. Pinpoint is listed first and marked Recommended; Deep charge and Speed run
   are unchanged apart from the upgrade offer on their review.
3. Up to 20 probes, usually 8–12; at most 4 during the core screens; *Build my
   stack now* from probe 5; checkpoint at about 10.
4. Rules choose; the AI words and reads.
5. v1 is lifestyle only; stress, mood and digestion wait for v2 with consent.
6. Leads show as words and bars, never percentages.
7. What was ruled out is shown (leads chip, review, Fully charged).
8. At most three pinpointed patterns per person.
9. Pattern names are plain and friendly, never clinical.
10. Comfort mode has no swipes and no auto-advance.

## 13. What's needed from you

1. Go-ahead, or changes to anything above.
2. Pharmacist (ideally also nutritionist) review of the pattern library, its
   links and the signposting lines.
3. Three more Amp states in the Rive file: hunch, eureka, puzzled.
4. Illustrations: v1 scenario pictures drawn in-house as line drawings in the
   glyph style, unless you'd rather use an illustrator.
5. A DPIA section for Pinpoint answers.
6. Still outstanding: the OpenAI key on the live site, the Rive file, the scan
   photos, the fibre products.
