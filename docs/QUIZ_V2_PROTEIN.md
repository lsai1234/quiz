# The protein check — a number, not an opinion

A module inside the V2 adaptive interview that turns *"do you get enough
protein?"* from a question people guess at into a number we work out with them.

Status: **proposed**. Nothing here is built. It is scoped to V2 only
(`docs/QUIZ_V2_ADAPTIVE.md`); V1 is untouched, which keeps the experiment
readable.

---

## Part 1 — The concept

### 1.1 Why this one question deserves a module

Everything else in the quiz is qualitative. "Slow mornings", "still sore two
days later", "grab whatever's easy" — good signals, but the person can only ever
agree or disagree with a description of themselves. Protein is the one topic in
the whole quiz where we can hand them **a fact about their own life they did not
have when they opened the page.**

That matters for three separate reasons, and it is worth being explicit about
which is which, because they pull the design in different directions.

**It is the strongest single sell in the range.** A person who learns they are
eating 80g and needs 130g has been shown a 50g hole. A scoop is 25g. The
arithmetic makes the case on its own, with nobody making a claim about anything.
Compare that to the current best we can do — *"so protein leads the stack"* —
which is a statement about our box, not about them.

**It is the most credible thing we can say.** The rest of the quiz infers. This
counts. A number that came out of four taps the reader made themselves is
believed in a way a recommendation never is, and the credibility spills over
onto the rest of the stack.

**It is the driver we are currently worst at measuring.** `low-protein` today
comes from `protein-reality` — "Do you get protein at every meal?" — and the
honest answer for most people is the one option we offer for it: *"I honestly
have no idea."* We are asking someone to self-report a quantity they have never
counted. The module exists because that question cannot be answered well, not
because we want another screen.

### 1.2 The shape of it

Three doors, and the reader picks which one they can be bothered with. This is
the load-bearing design decision: the module must be worth its slot for the
person who taps once, not only for the person who does the whole thing.

```
                     ┌──────────────────────────────────────┐
                     │  "Roughly what does a day look like?" │
                     │  target already shown in the hint     │
                     └──────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
   Door A — rough              Door B — presets            Door C — count it
   "Just ask me"               3 day-shapes, 1 tap         4 meal rows, 4 taps
   ~3 seconds                  ~6 seconds                  ~20 seconds
        │                             │                             │
   coarse signal only          ±25g estimate               ±12g estimate
   (today's question)          a number, hedged            a number, confident
        └─────────────────────────────┴─────────────────────────────┘
                                      │
                         inline verdict, same screen
                    "≈85g against a 120–140g target"
                                      │
                          the sell lands in Act 3
```

Note what Door A is. **It is not a skip — it is the question we ask today.**
The four options of `protein-reality`, kept word for word, sitting behind a
*"Rather not count? Just tell us roughly"* link. So the module does not add a
question to the quiz; it *replaces* one, and the worst case for a reader who
wants nothing to do with it is the experience they would have had anyway.

That is what makes the whole thing budget-neutral, which is requirement **B3**
of the V2 spec and the constraint most likely to kill a good idea in this quiz.

### 1.3 The target, and where it comes from

The interview already knows everything needed to compute a target. This is the
happy accident that makes the module cheap:

| Input | Already collected by | Used for |
|---|---|---|
| Weight band | `personal` (fixed screen) | the multiplier's base |
| Training load | `training-shape` | which g/kg range applies |
| Age band | `personal` (fixed screen) | nudges the floor for 45+ |
| Cutting / bulking | `goals` | pushes the range up |
| Plant-based | `safety` | changes the copy, not the number |
| Pregnancy | `safety` | **suppresses the module entirely** |

So the target can be shown **before** the reader estimates anything — in the
hint line, as the reason the question is being asked. *"Most people your size
training four times a week land around 120–140g."* That reframes the screen from
an interrogation into a comparison, which is a much easier thing to answer.

The ranges, and what they are:

| Situation | g per kg per day | Where it comes from |
|---|---|---|
| Not training | 0.8–1.0 | the standard adult reference intake — a floor, not a target |
| Active, not lifting | 1.2–1.6 | commonly cited for recreational activity |
| Lifting for size or strength | 1.6–2.2 | the range the resistance-training literature clusters in |
| Eating in a deficit | 1.8–2.2 | higher, to hold onto lean mass while losing weight |
| 45+ | floor raised ~0.2 | age-related anabolic resistance; a nudge, not a separate model |

Two honesty constraints on how these are used, and both are non-negotiable:

- **We collect weight in bands, so we output a range.** Band midpoints
  (`under-60` → 55kg, `60-75` → 68, `75-90` → 82, `90-105` → 97, `105-plus` →
  112) fed into a g/kg *range* give a spread like "120–140g". Presenting "134g"
  from a banded input is false precision and the kind of thing that makes a
  careful reader stop trusting the rest of the page.
- **Weight is optional on the `personal` screen, and stays optional.** With it
  unset the module asks for it inline — one row of five chips, the same options
  as the fixed screen — and declining that drops the reader to Door A. No weight,
  no number, and we say so rather than inventing one.

### 1.4 Estimating what they actually eat

**Door B — the presets.** Three or four whole-day shapes, each a single tap:

- *Toast or cereal, sandwich at lunch, a proper dinner* → ≈70g
- *Skip breakfast, something quick at lunch, big dinner* → ≈55g
- *Eggs or yoghurt, a decent lunch, meat or fish at dinner* → ≈100g
- *Protein at every meal, and I snack on it too* → ≈140g

Deliberately written as **days, not diets**. Nobody knows what "moderate protein
intake" means about themselves; everybody knows whether they had toast.

**Door C — the count.** Four rows on one screen — breakfast, lunch, dinner,
snacks and drinks — each a row of chips anchored to recognisable food, each
carrying grams behind it:

| Row | Chips | g |
|---|---|---|
| Breakfast | Nothing / Toast or cereal / Eggs or yoghurt / A shake | 0 / 8 / 25 / 25 |
| Lunch | Skipped / Sandwich or salad / Chicken, fish or similar / Big portion | 0 / 15 / 35 / 50 |
| Dinner | Light or snacky / Normal portion / Meat or fish, decent size / Big portion | 10 / 25 / 40 / 55 |
| Snacks & drinks | None / Nuts, cheese, yoghurt / A shake or bar / Two or more | 0 / 10 / 22 / 40 |

Four taps, no typing, no food search, no calorie database, no network. The
numbers are deliberately coarse and deliberately rounded — the point is a good
estimate fast, and a food-lookup UI would take longer than the rest of the quiz
put together.

Accuracy is roughly ±12g on Door C and ±25g on Door B, which is comfortably
inside the width of the target range itself. That is the argument for keeping it
crude: a more precise estimate would not change a single recommendation.

### 1.5 The verdict, and where it lands

**On the screen, inline, before Continue.** As soon as the rows are filled the
footer area resolves to the comparison:

> **≈85g a day** · target 120–140g
> A gap of about 40g — roughly one shake.

The slot for this is **reserved from first paint at a fixed height**, empty
until it has something to say. This is not a detail. The last time something in
V2 appeared a beat after the screen it pushed the whole page down and a user
tester reported it as a bug; that lesson is written into `Reflection.tsx` and it
applies here with more force, because this line appears while the reader's thumb
is already moving toward Continue.

**In Act 3, as the payoff.** `HeardYou` already fills the analysis wait with
"what you told us". The protein line is the strongest one it will ever have, and
it costs nothing because that screen is already waiting on the stack build:

> Around 40g a day short of the range for your size and training — so protein
> leads the stack, sized to close it.

**On the reveal, as the reason.** Threaded into the existing `aiReasons` on the
protein line item, so the product that is there has a number next to it.

### 1.6 The four outcomes, including the one that loses a sale

The module has to handle all four honestly, and the last is the one worth
designing on purpose:

1. **A big gap (>30g).** Lead with protein. `low-protein` confirmed.
2. **A small gap (10–30g).** Worth a mention, not worth leading with. Noted.
3. **On target.** Say so. `low-protein` cleared. This is a *good* outcome to
   deliver — the quiz just told someone they are doing something right, having
   had every commercial reason not to.
4. **Comfortably over target.** Say that too, and **suppress the protein
   products.** Selling a protein tub to someone the same page just told is
   eating plenty is the single fastest way to teach a reader that the number was
   marketing. The honest version costs us one line item and buys the credibility
   of the whole box.

Outcome 4 is the reason this module is worth building rather than a
protein-shaped landing page. A calculator that only ever recommends buying
something is not a calculator.

### 1.7 What it must never do

The quiz sells food supplements. The line between "here is a widely cited intake
range" and "here is a clinical assessment of your diet" is the one thing that
could turn this module from an asset into a liability.

- **No deficiency language.** "Short of the range commonly recommended for…",
  never "deficient", "low", "unhealthy" or anything that reads as a finding.
- **Estimate, labelled, every time it appears.** The `≈` is not decoration.
- **Pregnancy or breastfeeding flagged → the module does not fire.** Needs
  differ and this is not the place. Falls back to Door A silently.
- **No outcome promises.** Product claims stay inside `approved-claims.ts`,
  which is already the rule; the module adds a number, not a benefit.
- **The copy is pre-written, all of it.** Same rule as `DRIVERS.heard` and
  `DRIVER_CHANGED`: nothing in this module is model-generated. A generated
  sentence attached to a personal number is the easiest possible way to
  accidentally make a medical claim.

---

## Part 2 — How it integrates

### 2.1 The one structural rule to respect

Everything the interview knows must be **derivable from `picked`**. That is what
makes `rewindTo`, `reviseAnswer` and the review screen work without any of them
knowing what a question does — they replay answers and recompute. A module that
stashed grams in its own slice of state would break the edit-from-review flow
that was fixed two commits ago, and break it silently.

So: the protein module stores **option ids like every other question**, and the
grams are a pure function of those ids. One pick per meal row, or one preset id,
or one coarse id. `reviseAnswer` then works on it for free.

### 2.2 New files

**`src/lib/quiz-v2/protein.ts`** — the whole of the maths, pure and free of
React:

```ts
export interface ProteinTarget { lowG: number; highG: number; basis: TargetBasis }
export type TargetBasis = 'sedentary' | 'active' | 'lifting' | 'deficit'
export type Verdict = 'over' | 'on-target' | 'small-gap' | 'big-gap' | 'unknown'

/** Null when weight is unknown — the caller shows Door A rather than a guess. */
export function proteinTarget(state: InterviewState): ProteinTarget | null

/** Sum of the grams behind the picked options. Null for the coarse door. */
export function proteinIntake(question: BankQuestion, picked: string[]): number | null

export function proteinVerdict(target: ProteinTarget, intakeG: number): Verdict

/** Pre-written, goal-keyed. Never generated. */
export function proteinWhy(state: InterviewState): string
```

**`src/components/quiz/v2/ProteinCheck.tsx`** — the screen. Sibling of
`PersonalFields`, which is the closest existing analogue: a compound screen with
local state, committed on Continue.

### 2.3 Changed files

| File | Change |
|---|---|
| `quiz-v2/types.ts` | `SelectKind` gains `'protein'`; `BankOption` gains `grams?: number` and `mealRow?: MealRow` |
| `quiz-v2/bank/nutrition.ts` | `protein-reality` becomes the coarse door *inside* the new `protein-check`; the standalone question is retired |
| `quiz-v2/interview.ts` | untouched — ids in, ids out |
| `quiz-v2/planner.ts` | untouched — the module is an ordinary candidate and competes on score |
| `quiz-v2/project.ts` | writes `proteinTargetG` / `proteinIntakeG`; scales the `low-protein` weight by the gap |
| `lib/types.ts` | two optional numeric fields on `QuizAnswers` |
| `quiz-core/driver-map.ts` | unchanged mapping; the *weight* arriving is now measured rather than guessed |
| `components/quiz/v2/QuizV2.tsx` | one more branch next to `isForm`; `needsContinue` includes it |
| `components/quiz/v2/HeardYou.tsx` | the protein line, when there is a number |
| `analytics/events.ts` | `quiz_protein` — door taken, verdict bucket |

Two optional fields on `QuizAnswers` is the entire schema change. Optional means
every stored answer object stays valid, V1 keeps producing byte-identical
output, and the persona snapshots stay green — the same property that made the
`drivers` field safe to add in Phase 2, and the one that must be re-verified
rather than assumed.

### 2.4 The gate — when it fires

```ts
requires: (s) =>
  !hasSafetyFlag(s, 'pregnancy') &&
  (live(s, 'low-protein') || (trains(s) && hasGoal(s, 'muscle', 'bulking', 'cutting', 'recovery')))
```

`hasSafetyFlag` is new — `predicates.ts` has no safety helper today, because
nothing has needed to read the safety screen back until now. It is three lines
and belongs there with the rest.

Otherwise this is `protein-reality`'s existing gate plus the pregnancy guard and
the cutting goal. `live` rather than `suspected` on purpose — that distinction is
the bug documented in `predicates.ts`, where the person with the *strongest*
evidence for a driver was the only one who never got the follow-up.

The planner needs no change. The module declares `discriminates:
['low-protein', 'under-fuelled']`, scores like anything else, and if the
interview has better things to ask it does not fire. That is correct: a person
who has just told us their problem is broken sleep does not need a protein
calculator, and forcing one on them is exactly the "working through a list"
behaviour V2 exists to stop.

### 2.5 What it costs in time and latency

| | |
|---|---|
| Questions added to the quiz | **0** — it replaces `protein-reality` |
| Network calls | **0** — arithmetic, client-side, synchronous |
| Added time, Door A | ~0s (it is today's question) |
| Added time, Door B | ~3s |
| Added time, Door C | ~15s, chosen deliberately by the reader |
| AI involvement | none in the maths; the steer may still choose *when* to ask |

**B4** — no screen ever waits on a network call — is preserved by construction,
because there is nothing to wait for.

---

## Part 3 — Implementation plan

Five phases. Each lands on `master` behind the existing arm flag and changes
nothing for customers, because V2 is still off.

### Phase 1 — The maths
1. `quiz-v2/protein.ts`: target, intake, verdict, the goal-keyed why-copy.
2. Unit tests: every weight band × every basis; the 45+ nudge; the deficit case;
   null weight; all four verdicts at their boundaries; midpoint arithmetic.
3. A table test that pins the full band × basis grid, so a copy change to the
   ranges is visible in a diff rather than buried in a helper.

**Exit:** the numbers are right and reviewable as a table, with no UI to argue
about yet. This is the phase where the *ranges* get a second opinion.

### Phase 2 — The screen
4. `types.ts`: the `'protein'` select kind, `grams`, `mealRow`.
5. `bank/nutrition.ts`: author `protein-check` — preset options, meal-row
   options, and the coarse door carrying `protein-reality`'s four options
   verbatim. Retire the standalone question.
6. `ProteinCheck.tsx`: the three doors, the inline weight row when weight is
   unset, the **fixed-height** verdict slot.
7. `QuizV2.tsx`: render it; include it in `needsContinue` and `canContinue`.
8. Review-row rendering: `≈85g a day` rather than a list of option ids — the
   same class of bug as the raw `35-44` that shipped to the review screen twice.

**Exit:** all three doors complete the quiz, and an edit from the review screen
returns to the right door with the right rows still selected.

### Phase 3 — It reaches the recommendation
9. `project.ts`: write `proteinTargetG` / `proteinIntakeG`; derive the
   `low-protein` weight from the *gap* rather than from a coarse option.
10. Suppress protein products on the "comfortably over" verdict.
11. Re-run the V1 persona snapshots — must be byte-identical.
12. Author V2 personas for the four verdicts and review the boxes by hand.

**Exit:** the number demonstrably changes the box, including the case where it
correctly removes a product we would otherwise have sold.

### Phase 4 — The payoff
13. `HeardYou.tsx`: the protein line, with the gap in grams.
14. The reveal's protein line item gets the number as its reason.
15. `quiz_protein` telemetry: door taken, verdict bucket, time on screen.

**Exit:** a reader who does Door C sees their own number three times — on the
screen, in the analysis, and next to the product. That repetition is the
conversion mechanism, and Phase 5 is what measures whether it works.

### Phase 5 — Measure
16. E2E: all three doors to a stack; pregnancy suppresses the module; the
    over-target path removes protein from the box.
17. Read `quiz_protein` against completion and conversion by door. The
    interesting comparison is **Door C against Door B** — if the readers who
    count convert materially better, the module earns a more prominent invitation
    and possibly its own entry point outside the quiz.

---

## Open questions

1. **Should Door C be offered first for muscle-goal readers?** They are the
   most likely to engage with it and the most likely to buy protein. Against:
   V2's opening promise is speed, and a four-row screen as the default breaks
   the one-tap rhythm. **Recommendation:** presets first for everyone, and
   revisit on the Phase 5 numbers rather than guessing now.

2. **Is the module worth an entry point of its own?** A `/protein` page running
   the same pure module, shareable, indexable, and a genuinely useful free tool.
   Strong organic-traffic argument. **Recommendation:** not in this scope, but
   `protein.ts` should be written as if it will happen — pure, React-free, no
   dependency on `InterviewState` beyond a narrow input type.

3. **Should V1 get it too?** No — that would contaminate the experiment, which
   is the whole reason V2 exists as a separate arm. If it wins, it ships with V2.

4. **The 45+ nudge.** Our top age band is `45+`, and the evidence for raising
   protein targets is really about 60+. Applying a nudge at 45 is defensible but
   imprecise. **Recommendation:** keep the nudge small (+0.2 g/kg on the floor
   only) and do not mention age in the copy, so we are not making a claim we
   cannot support with a band this wide.
