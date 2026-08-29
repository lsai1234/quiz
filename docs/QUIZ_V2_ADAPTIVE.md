# Quiz V2 — the adaptive interview

A second quiz, run against the current one as a 50/50 split, that stops asking
people what they want and starts asking them **why**. Switchable from the
Founders Hub; off means everyone sees today's quiz, unchanged.

Status: **proposal**. Nothing here is built yet.

---

## Part 1 — Business requirements

### 1.1 The problem with the quiz we have

Today's quiz asks people to self-diagnose. "More energy", "Feel healthier",
"Immune support" — the user picks a symptom-shaped label and we map that label
onto products. Two people tap *More energy* and get near-identical stacks, when
one of them is sleeping five hours and the other is drinking four coffees and
skipping breakfast. Those are opposite problems and they want opposite boxes.

The audit already names this (`docs/quiz-audit.md` §7): the highest-value
signals we never collect are all *causal* — energy pattern through the day,
sleep quality for people who didn't pick a sleep goal, what they've tried and
why it failed. The one place we do dig is the AI deep-dive, and it is optional,
sits after the review screen, and most people never see it.

The result is a quiz that performs a personalisation it hasn't actually done.

### 1.2 What V2 has to be

**B1 — It digs for the cause, not the label.** Every goal has a ladder behind
it. *More energy* → when does it hit you → what's the night like / what's the
morning like → how much, how long. Three taps and we know whether this is a
sleep problem, a fuelling problem, a caffeine problem or a nutrient gap. That
distinction changes the box.

**B2 — It visibly listens.** The next question must be recognisably a
consequence of the last answer, in its wording, not just its presence. And
before the results, the quiz says back what it heard, in the user's terms, and
what it did about it. This is the moment the whole thing is for.

**B3 — It is not longer.** Same advertised question count as today, same
tap-per-question feel. A quiz that understands you better and takes 40% longer
is a worse quiz. Default budget is set to parity with V1 so the experiment
measures the *questions*, not the length.

**B4 — It is never sluggish.** No question ever waits on a network call. Not
one. The AI can improve what is shown next; it can never be the reason
something isn't shown yet. Target: next question painted in under 100 ms from
tap, on every path, including with the AI unreachable.

**B5 — It always works.** No API key, timeout, malformed response, rate limit,
outage — the flow completes and produces a recommendation. Degradation is
invisible to the user: the questions get slightly less tailored, nothing else.

**B6 — It cannot be worse than V1 without us knowing.** Both arms end at the
same results screen, so the experiment isolates the questionnaire. Every quiz
event carries its arm. The hub reads out both funnels side by side.

**B7 — It is reversible in one click.** Off is a toggle in Settings, effective
on the next page load, with no deploy.

**B8 — It is safe and compliant.** The safety screen (pregnancy, breastfeeding,
medication) is mandatory in both arms and is never skipped, reordered out, or
subject to AI. No question may ask about symptoms, conditions, medication,
pain or diagnosis — the existing rule in `QUESTIONS_SYSTEM_PROMPT`, but
enforced structurally this time (see §2.4: the AI cannot author question text
from scratch, only choose between questions we wrote).

### 1.3 Scope

**In:** the supps quiz, both tracks (performance and wellbeing). The V2 arm
runs from the goals step to the review step and hands the same `QuizAnswers`
shape to the same engine.

**Out, for now:**
- **CHRGD LQD (drinks mode)** stays on V1 in every phase. It has its own
  sequence (`dailyDrinks`, `workoutAddOns`) and its own sizing model; folding
  it in doubles the surface for no extra learning. Extend after V2 wins.
- **The results screen, the reveal, tiers, checkout.** Untouched. If the reveal
  changed too, a conversion difference would tell us nothing about the quiz.
- **The engine's scoring philosophy.** V2 adds one new data table
  (driver → affinity) read the same way `GOAL_AFFINITY` already is. It does not
  rewrite `scoreProduct`.

### 1.4 Success criteria and the decision rule

| Metric | Type | Why |
|---|---|---|
| Quiz start → verified purchase | **Primary** | The only thing that pays for it |
| Completion rate (start → build) | Guardrail | The obvious way a longer quiz loses |
| Median time to complete | Guardrail — must not regress >10% | B3 |
| p75 time-per-question | Guardrail | B4, catches AI latency leaking through |
| Swaps/removes on the reveal | **Secondary, high signal** | People correcting our picks *is* the fit measure. Fewer swaps = we understood them |
| AOV and tier chosen | Secondary | A better-understood customer should buy deeper |
| Deep-dive accept rate (V1 only) | Context | V2 folds this in-flow; V1 keeps it optional |

**Sample sizes, so nobody reads noise as a result.** Rule-of-16 estimates:

- Completion rate, 60% → 65%: ~1,500 sessions per arm.
- Swap rate, 30% → 25%: ~1,900 sessions per arm.
- Conversion, 3% → 4%: **~5,400 sessions per arm.**

So: completion and swap rate are readable within days of real traffic and are
the early signal. Conversion is the decision metric and needs patience. Do not
call the experiment on conversion before ~5k per arm; do call it *off* early if
completion rate drops materially.

**Decision rule.** V2 ships to 100% when conversion is non-inferior and both
completion rate and swap rate improve. V2 is killed when completion drops more
than 5pp or median time rises more than 20%, whatever conversion says.

---

## Part 2 — Technical proposal

### 2.1 The architectural question, answered

Three options were on the table:

| | Latency | Safety | Engine fit | Verdict |
|---|---|---|---|---|
| **A. AI writes the next questions live** | 1–3 s *per question*, on the critical path | Free-text output can drift medical; needs heavy validation | Answers are free-form; only reachable through a whitelist of signal tags | **No** — breaks B4 outright |
| **B. Big pre-authored branching graph** | Instant | Fully controlled | Perfect | Works, but the branching is hand-maintained and the copy is generic |
| **C. Pre-authored bank, AI *steers*** | Instant, AI overlaps user think-time | AI picks from questions we wrote — it cannot author one | Perfect, every option projects to canonical fields | **Yes** |

**Option C is the recommendation.** The mechanism:

> We author a bank of ~60 questions with rich preconditions. A deterministic
> planner scores every eligible question and can always answer "what next?" in
> zero milliseconds. The AI is asked, *in the background, one question ahead*,
> to re-rank the planner's top candidates and optionally sharpen their wording
> for this person. If it answers in time, its ordering wins. If it doesn't, the
> planner's ordering was already on screen.

This gets what leaning on the AI was actually for — a path that feels chosen
for you, and copy that sounds like it read your last answer — without putting
a network call between a tap and a screen. It also means the AI's output is a
**list of ids from a closed set**, which is a tiny, fast, trivially validated
payload, rather than prose we have to police.

### 2.2 Where things live

```
src/lib/experiments/
  assignment.ts        pure: bucket + config → arm. Unit-tested.
  client.ts            client-side arm holder, fed by PortalSync
src/lib/quiz-v2/
  drivers.ts           the closed DriverId vocabulary
  bank/                the authored question bank, one file per topic
    index.ts           BANK: QuestionDef[]
    energy.ts  sleep.ts  training.ts  nutrition.ts  immunity.ts  ...
  planner.ts           pure: (state, budget) → ranked candidates
  project.ts           pure: V2 state → QuizAnswers (+ drivers)
  steer.ts             client: prefetch + apply AI ordering, never blocking
  ai.ts                pure: prompt build, JSON schema, output validation
src/lib/quiz-core/
  driver-map.ts        DRIVER_AFFINITY + DRIVER_SLOT_RELEVANCE (new table)
src/components/quiz/v2/
  QuizV2.tsx           the V2 renderer (reuses AnswerOption, ChargeRail, etc.)
  Reflection.tsx       the between-questions acknowledgement line
  HeardYou.tsx         the "what we heard" recap, shown in Act 3
src/app/api/quiz/next-questions/route.ts
src/app/api/portal/quiz-experiment/route.ts
src/app/founderhub/settings/quiz/page.tsx
src/components/portal/QuizExperimentSettings.tsx
```

Existing files touched: `middleware.ts`, `api/config/route.ts`,
`components/portal/PortalSync.tsx`, `lib/portal/store.ts`,
`components/portal/SettingsNav.tsx`, `lib/analytics/quiz.ts`,
`lib/analytics/funnel.ts`, `lib/types.ts`, `lib/store.tsx`,
`components/scroll/ScrollExperience.tsx`, `lib/stack-blueprint/factory.ts`.

### 2.3 The bank, the drivers, and what a ladder looks like

**Drivers** are the new vocabulary — root causes, as a closed enum, sitting
between the user's answers and the recommendation:

```ts
export type DriverId =
  | 'sleep-onset' | 'sleep-maintenance' | 'unrefreshing-sleep' | 'sleep-debt'
  | 'caffeine-crash' | 'glycaemic-dip' | 'under-fuelled' | 'low-protein'
  | 'stress-load' | 'wired-evening' | 'screen-fatigue' | 'sedentary-slump'
  | 'training-load' | 'recovery-debt' | 'joint-load' | 'plateau'
  | 'micronutrient-gap' | 'hydration-deficit' | 'gut-disruption'
  | 'illness-frequency' | 'hormonal-shift' | 'sun-exposure-low'
```

A **question** in the bank:

```ts
interface QuestionDef {
  id: string
  topic: Topic                    // one per topic per run, mostly
  prompt: string; hint: string
  select: SelectMode              // reuses quiz-flow's modes
  requires?: (s: V2State) => boolean   // goals / prior answers / track
  /** Which drivers this question can discriminate between. Drives planning. */
  discriminates: DriverId[]
  options: Array<{
    id: string; label: string; sub?: string
    /** Drivers this answer supports, with a weight. */
    drivers?: Partial<Record<DriverId, number>>
    /** Existing lifestyle signal tags (unchanged semantics). */
    signals?: SignalTag[]
    /** Projection onto canonical answers — how V2 feeds the existing engine. */
    answers?: Partial<QuizAnswers>
  }>
}
```

Three properties matter here:

1. `discriminates` is what makes the planner smart rather than a fixed list —
   a question is worth asking in proportion to how much uncertainty it removes
   between drivers that are currently live.
2. `answers` is what keeps the engine unforked. Every V2 answer that maps onto
   an existing field (`diet`, `caffeineLevel`, `trainingFrequency`, `lifestyle`
   …) writes it. V2 collects *more*, never *less*.
3. Options carry weighted drivers, so "I sleep under six hours" is a stronger
   `sleep-debt` than "six to seven".

#### Worked ladder: *More energy*

| # | Question | Options → drivers |
|---|---|---|
| 1 | **When does it hit you?** | Slow mornings → `sleep-debt`, `unrefreshing-sleep` · Mid-afternoon wall → `glycaemic-dip`, `caffeine-crash` · Runs out by evening → `training-load`, `under-fuelled` · Flat all day → `micronutrient-gap`, `stress-load` |
| 2a | *(mornings)* **How are your nights?** | Can't switch off → `sleep-onset`, `wired-evening` · Wake through the night → `sleep-maintenance` · Sleep enough, wake tired → `unrefreshing-sleep`, `micronutrient-gap` · Nights are fine → clears sleep drivers, escalates `micronutrient-gap` |
| 2b | *(afternoon)* **What happens before it?** | Coffee, no breakfast → `under-fuelled`, `caffeine-crash` · Big lunch then gone → `glycaemic-dip` · Steady meals → clears fuelling · Too busy to eat → `under-fuelled` |
| 3 | **Confirm the leader.** Sleep debt → *hours on a normal night* · Caffeine crash → *how much, and when's the last one* · Fuelling → *how most meals happen* | Grades the driver from suspected to confirmed |

Note what question 3 does: when the leading driver is caffeine, it replaces
the generic four-bucket `caffeine` tolerance question with *quantity and
timing* — the audit's gap #5 — at the **same tap cost**. That is the shape of
the whole redesign: not more questions, better-aimed ones.

The payoff line at the end of that path reads:

> *"Your energy reads as a sleep-quality problem more than a stimulant one — so
> we've led with magnesium and left the pre-workout out."*

#### Worked ladder: *Build muscle*

| # | Question | Options → drivers |
|---|---|---|
| 1 | **What's actually holding you back?** | Recovery between sessions → `recovery-debt` · Getting the protein in → `low-protein` · Strength has stalled → `plateau` · Appetite → `under-fuelled` |
| 2a | *(recovery)* **48 hours after a hard session?** | Still sore → `recovery-debt`, `joint-load` · Tired, not sore → `sleep-debt` · Fine → clears |
| 2b | *(protein)* **How do most meals happen?** | Replaces the generic `diet` question and writes it |
| 3 | **Frequency + training age** (as today, one screen) | Writes `trainingFrequency`, `trainingExperience` |

#### The rest, in brief

| Goal | The ladder, in one line |
|---|---|
| Sleep better | Onset vs maintenance vs unrefreshing → what the evening looks like → caffeine cut-off |
| Focus / brain fog | When it fogs → screens vs stress vs post-meal → sleep cross-check |
| Immune support | How often run down → what's around you (kids, commute, travel) → what gives first when busy |
| Get lean | What's stalled it → hunger vs energy to train vs meal chaos → protein and fuelling |
| Gut health | What it feels like and when → recent antibiotics/travel/diet change → fibre and fermented intake |
| Skin, hair & nails | What changed and when → sun/stress/diet cross-check |
| Menopause | Which symptoms lead *(kept deliberately non-clinical)* → sleep and stress cross-check |

**Budget and fixed slots.** Four screens are fixed: goals (open), safety
(mandatory, position preserved), personal/dosing, already-taking. The rest is
the adaptive budget. Default: **parity with V1** — 10 total on the performance
track, and 8 on wellbeing (V1's 6 plus the two that were hiding in the optional
deep-dive most people skipped). Budget is a settings value, not a constant, so
it can be tuned without a deploy. Wellbeing's +2 is a real risk to B3 and gets
its own completion-rate readout.

**Early exit.** The planner stops when the marginal information gain of the
best remaining question falls below a threshold, even with budget left. A quiz
that ends early because it already understands you is a *feature* — and it is
worth saying so on screen when it happens.

### 2.4 The planner and the AI steer

**Planner** (`planner.ts`, pure, no I/O):

```
score(q) = Σ_over live drivers d in q.discriminates
             uncertainty(d) × goalWeight(d, state.goals)
         × noveltyPenalty(q.topic, askedTopics)
         × (q.requires?(state) ? 1 : 0)
```

`uncertainty(d)` is highest for a driver that is plausible but unconfirmed —
so the planner naturally chases the leading hypothesis and stops asking about
drivers it has already ruled in or out. It is deterministic and unit-testable:
same state, same order, every time.

**The steer** (`/api/quiz/next-questions`):

- **Request** (small): goals, primary goal, current driver posterior, ids of
  questions asked, remaining budget, and the planner's top ~10 candidate ids
  each with a one-line summary of what it discriminates.
- **Response** (strict JSON schema, `gpt-4.1-mini`, `max_tokens: 500`,
  `timeout: 2500 ms`):
  ```jsonc
  {
    "order": ["energy-when", "sleep-pattern"],   // subset of candidate ids
    "copy":  [{ "id": "sleep-pattern",
                "prompt": "You said mornings are slow — how are the nights?",
                "hint": "..." }],
    "reflection": "Afternoon crashes on five hours' sleep — that tracks."
  }
  ```
- **Validation** (`ai.ts`, pure, unit-tested): ids not in the candidate set are
  dropped; `copy` is length-capped and markdown-stripped exactly as
  `parseQuestionsResult` already does; anything left empty falls back. The AI
  can reorder and reword. It cannot invent a question, add an option, change an
  option's meaning, or touch the safety screen.

**Prefetch discipline — this is the whole latency story.** The call for
question *n+1* fires the instant question *n−1* is answered, i.e. one full
question ahead. The round trip overlaps the time the user spends reading and
answering. Concretely:

```
tap answer(n-1) ──┬─→ render question n           (0 ms, planner)
                  └─→ POST next-questions for n+1 (≤2.5 s, background)
tap answer(n)   ──┬─→ render question n+1         (0 ms — steer applied if it landed)
                  └─→ POST next-questions for n+2
```

The renderer **never awaits** the steer promise. There is no loading state on a
question, because there is nothing to load. A test asserts this (§2.8).

**Cost.** ~3–4 calls per completed quiz at ~1.2k in / 400 out on
`gpt-4.1-mini` — small fractions of a penny per quiz. The settings toggle is
also the kill switch, and the split percentage is the throttle.

**Privacy.** The steer payload carries goals, drivers and question ids —
**no name, no age, no free text**. Worth noting the existing deep-dive prompt
does send the user's first name (`ai-questions.ts:buildQuestionsPrompt`); it
buys nothing for question selection, and V2 will not carry it. Recommend
dropping it from V1's prompt too, as a one-line change.

### 2.5 Assignment: how the 50/50 actually works

The constraints: sticky across reloads, no flash of the wrong quiz, no cost to
the homepage's static render, and completely inert when the experiment is off.

1. **`middleware.ts`** (already runs on every page request) sets
   `chrgd_bucket` — an integer 0–99, 90-day, `sameSite: lax`, not httpOnly —
   if absent. It knows nothing about the experiment; it just mints a stable
   anonymous number. Harmless when the flag is off. A `?quizArm=v1|v2` query
   param pins the arm in a `chrgd_arm` cookie, for QA and founder review.
2. **`/api/config`** (already `force-dynamic`, already fetched once per page
   load by `PortalSync` from the root layout) reads the bucket cookie plus the
   persisted setting and returns `quizArm: 'v1' | 'v2'`. No new request.
3. **`PortalSync`** writes it into `experiments/client.ts` and the quiz store.
4. **`ScrollExperience`** reads the arm when it mounts Act 2.

The timing is free: the arm is resolved during Act 1 (the hero), which the user
looks at for seconds before tapping Start. There is no first-paint cost, no
flicker, and the homepage stays statically rendered.

**Failure default is V1.** If `/api/config` never answers, the arm is `v1` —
the known-good quiz. An experiment must never be the reason a quiz breaks.

### 2.6 The Founders Hub switch

New settings section under **The app itself** (`SETTINGS_GROUPS` in
`SettingsNav.tsx`), slug `quiz`, following the `data-source` route pattern
exactly:

- **Mode:** `off` (everyone gets V1 — the default) · `split` · `all-v2`.
- **Split:** percentage to V2, default 50.
- **AI steering:** on/off independently, so V2 can be run bank-only. This is
  the clean way to answer "is the AI earning its keep?" — a third arm, later.
- **Question budget** per track.
- **Read-out:** both funnels side by side — started, completed, median time,
  reached reveal, swaps, purchased, conversion — plus AI steer health (used %,
  p50/p95 latency, failure reasons).

Guard: `isPortalAuthed()`, as every other portal route.

### 2.7 Feeding the engine — the part that must not break

`QuizAnswers` gains one optional field:

```ts
/** V2 only. Root causes inferred from the adaptive interview, with weights.
 *  Absent on V1 answers and on anything saved before V2 existed. */
drivers?: Partial<Record<DriverId, number>>
```

`quiz-core/driver-map.ts` adds `DRIVER_AFFINITY`, shaped exactly like the
existing `GOAL_AFFINITY` — driver → swap-group → bonus:

```ts
'sleep-onset':        { 'sleep-support': 22, magnesium: 14, adaptogen: 10 },
'unrefreshing-sleep': { magnesium: 16, 'vitamin-d': 12, zma: 12 },
'caffeine-crash':     { 'vitamin-b': 14, adaptogen: 10 },   // and a stim penalty
'under-fuelled':      { 'protein-bar': 12, multivitamin: 10 },
'joint-load':         { 'joint-support': 26, collagen: 18, 'omega-3': 14 },
// …
```

`scoreProduct` reads it additively alongside `GOAL_AFFINITY`. **With `drivers`
absent it contributes exactly zero** — so V1 output is byte-identical and the
existing persona snapshot suite stays green without amendment. That property is
the safety net for the whole experiment and is worth an explicit test.

Two drivers also carry *negative* weight (`caffeine-crash` and `wired-evening`
suppress stimulants), reusing the existing `SCORING.trainingTime` /
`SCORING.caffeine` penalty mechanism rather than inventing a second one.

### 2.8 Instrumentation

- **`arm` on every quiz event.** One addition to each helper in
  `analytics/quiz.ts`. Both arms then flow through the funnel machinery
  unchanged — and because `funnel.ts` already derives its step ladder from the
  events themselves rather than a hard-coded list (a deliberate choice, and it
  pays off here), V2's dynamic question ids produce a correct funnel with no
  changes to the funnel code. `funnel.ts` gains one optional `arm` filter.
- **New events:**
  - `quiz_ai_steer` — `{ used, latencyMs, reason: 'ok'|'timeout'|'invalid'|'nokey'|'off', applied: 'order'|'copy'|'both'|'none' }`. Tells us whether the AI is doing anything, and what it costs.
  - `quiz_driver_resolved` — `{ driverId, confidence }`. Which causes the quiz actually finds, in aggregate. This is the marketing insight, not just a debug line.
  - `quiz_early_exit` — `{ askedCount, budget }`.
- Add all new names to `QUIZ_EVENTS` (the `/api/analytics` route validates
  against that set, so an unlisted event is silently dropped).

### 2.9 Testing

| Level | What |
|---|---|
| Unit | `assignment.ts` — split accuracy over 10k buckets, stability, off-mode forces v1 |
| Unit | `planner.ts` — determinism, budget respected, safety step never dropped or reordered, early-exit threshold |
| Unit | `project.ts` — every bank option's `answers` projection type-checks and round-trips |
| Unit | `ai.ts` — validator rejects unknown ids, over-long copy, injected markdown, missing fields |
| Unit | `driver-map.ts` — every `DriverId` is reachable from ≥1 bank option and maps to ≥1 swap group (a driver nothing can produce or consume is dead config) |
| Snapshot | **V1 personas unchanged** — the guard on §2.7 |
| Snapshot | New V2 persona set: the same 14 personas run through V2 paths, bundles reviewed by hand once, then frozen |
| E2E | Complete V2 end-to-end with `?quizArm=v2` |
| E2E | Complete V2 with the steer route stubbed to 500, and to a 10 s hang — flow completes, no visible delay |
| E2E | Flag off → V2 unreachable even with the cookie set |
| Perf | Assert the renderer holds no pending promise at paint (B4, mechanically) |

Design tests apply to the settings page and any chrome outside the quiz flow
(`DESIGN.md`); the quiz flow itself is exempt, as today.

---

## Part 3 — Implementation plan

Six phases. Each one ships to `master` behind the flag and changes nothing for
customers until Phase 5 flips the switch.

### Phase 0 — Plumbing, shipped dark
*Nothing user-visible. Split stays at 0%.*

1. `middleware.ts`: mint `chrgd_bucket`; honour `?quizArm=`.
2. `lib/experiments/assignment.ts` + tests.
3. `lib/portal/store.ts`: `getQuizExperiment()` / `setQuizExperiment()` in
   `PersistedSettings`.
4. `/api/config`: return `quizArm`. `PortalSync`: mirror it client-side.
5. `analytics/quiz.ts`: `arm` on every event. `funnel.ts`: optional arm filter.
6. Settings page + `/api/portal/quiz-experiment`, mode locked to `off`.

**Exit:** V1 traffic carries `arm: 'v1'`; the hub funnel still reads correctly;
zero behaviour change. Verified in production before Phase 1 lands.

### Phase 1 — The bank and the planner, no AI
7. `drivers.ts`, `bank/` (author the energy, sleep and training ladders first —
   they cover the majority of goal selections), `planner.ts`, `project.ts`,
   all pure, all tested.
8. `QuizV2.tsx` — reuses `AnswerOption`, `ChargeRail`, `LiquidRail`,
   `QuizIcon`, the progress and review screens. The visual language is
   identical to V1 by design; only the questions differ.
9. `ScrollExperience` branches on the arm at Act 2.

**Exit:** a founder can run the full V2 quiz via `?quizArm=v2`, end to end,
with no AI and no engine change yet. Reviewable as a product before any of the
clever bits exist — deliberately, because this is the phase where the *content*
gets judged.

### Phase 2 — Drivers reach the recommendation
10. `quiz-core/driver-map.ts`; additive read in `scoreProduct`.
11. V1 persona snapshots re-run — must be identical.
12. V2 persona snapshots authored and reviewed by hand.

**Exit:** V2 answers demonstrably change the box, in ways a human has checked.

### Phase 3 — The AI steer
13. `ai.ts` (prompt, schema, validator) + `/api/quiz/next-questions`.
14. `steer.ts` — one-question-ahead prefetch, hard timeout, silent fallback.
15. `Reflection.tsx` — the acknowledgement line, rendered only if it arrived.
16. `quiz_ai_steer` telemetry.

**Exit:** the steer measurably fires, and the hang/500 E2E tests prove the flow
is indifferent to it.

### Phase 4 — "What we heard"
17. `HeardYou.tsx` in Act 3, filling the analysis wait that already exists —
    the drivers we found, in plain language, each next to what it changed.
18. Per-driver reasons threaded into the existing `aiReasons` on the reveal.

**Exit:** B2 is actually delivered. This is the phase most likely to move the
conversion number, and it costs no latency because Act 3 is already waiting.

### Phase 5 — Turn it on
19. Split to 10% for 48 hours. Watch error rates, p75 time-per-question, steer
    latency, completion.
20. Split to 50%. Leave it alone.
21. Read completion and swap rate at ~2k/arm; read conversion at ~5.4k/arm.

### Phase 6 — Decide
Ship to 100%, kill it, or run the third arm (V2 with AI steering off) to find
out whether the AI or the ladders did the work. That third arm is the cheapest
experiment in the whole plan and the one most likely to save money — it is
already a toggle by then.

---

## Open questions

1. **Wellbeing question count.** V2 pushes wellbeing from 6 to 8 screens by
   folding the optional deep-dive in-flow. Accept the +2, or hold wellbeing at
   6 and lose two ladder rungs? Recommendation: accept it, watch its completion
   rate separately, and cut if it drops.
2. **Menopause and hormonal ladders.** These are the hardest to ask about
   without sounding clinical. Recommendation: keep them shallow in V2 (one
   non-clinical question) rather than risk B8.
3. **Should V2's early exit be visible?** "We've got what we need" after seven
   of ten questions is either delightful or feels like it gave up. Worth an
   A/B of its own later; for now, show it.
4. **Drinks mode.** Confirm it stays on V1 through Phase 6.
5. **The name in the V1 deep-dive prompt** — drop it? (§2.4)
