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

Note what Door A is. **It is not a skip — it is the answer we already get
most.** *"I honestly have no idea"* is the most-picked option on the question
this replaces, so it sits in the list as an ordinary fifth choice rather than
behind an escape hatch (§2.1 argues that out). The module does not add a
question to the quiz; it *replaces* one, and the worst case for a reader who
wants nothing to do with it is one tap, exactly as today.

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

So the target could be shown **before** the reader estimates anything. It
should not be — a number shown first anchors the self-report it is about to be
compared against, and §2.2 makes that case. What the hint states instead is the
*basis* ("you train four times a week"), which does the listening work without
handing over anything to aim at.

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

**Door C — the count.** Four meals, asked one at a time inside the same screen
(§2.3 is why stepped rather than a four-row form), each option anchored to
recognisable food and carrying grams behind it:

| Beat | Options | g |
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

1. **A big gap (more than one shake, 25g).** Lead with protein. `low-protein`
   confirmed. The threshold is a scoop on purpose: the question it answers is
   *"is this worth a product at all?"*, and that is exactly where the line is.
2. **A small gap (13–25g).** Worth a mention, not worth leading with. Noted.
   The floor is the estimate's own accuracy (§1.4) — below it we are not
   measuring a gap, we are reading our own noise, and reading it in our favour.
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

## Part 2 — The screen, designed

Part 1 says what the module knows. This part says what it feels like, because on
this particular screen those are not separable: a protein calculator that feels
like homework is a protein calculator nobody finishes, and an unfinished one is
worse than the coarse question it replaced.

Everything here is designed against one sentence from the V2 brief — *"I still
want the user to fly through the quiz"* — and one from the reader's head:
**"am I being told off?"**

### 2.1 The three doors are not a menu

The obvious build is a screen that offers three ways to answer. It is also
wrong, and worth saying why at length, because it is the version most people
would ship.

Every other screen in this quiz is *read one line, tap one thing, move*. A
screen that first asks **how** you would like to answer breaks that rhythm
before a single question has been asked. It converts a quiz into a settings
panel. And it does the damage to everybody, including the 70% who were always
going to tap the first plausible option and move on.

So the doors are not offered. **Door B is simply the screen**, and the other two
hang off it:

```
┌─────────────────────────────────────────────────┐
│  A NORMAL DAY                                   │   ← eyebrow, as every screen
│  What does a normal day of eating look like?    │   ← h2, as every screen
│  You train four times a week — that moves this  │   ← hint: the basis, not
│  number more than most people expect.           │      the target (§2.2)
├─────────────────────────────────────────────────┤
│  ○ Toast or cereal, sandwich, proper dinner     │
│  ○ Skip breakfast, something quick, big dinner  │   five full-width options,
│  ○ Eggs or yoghurt, decent lunch, meat at night │   the same control as every
│  ○ Protein at every meal, and I snack on it     │   other single-select screen
│  ○ I honestly have no idea                      │   ← Door A, in plain sight
│                                                 │
│  Rather work it out properly? →                 │   ← Door C, one quiet link
└─────────────────────────────────────────────────┘
```

To a reader who does the normal thing, **this is an ordinary question.** Same
control, same tap, same speed, no evidence that a "module" exists. That is the
whole design goal for the majority path.

Two decisions inside that are worth defending:

**Door A is the fifth option, not a link.** *"I honestly have no idea"* is
already the most-picked answer to the question this replaces, and hiding the
honest answer behind an escape hatch punishes honesty. In the list it costs one
tap like everything else, commits the coarse `low-protein` signal, and produces
no number — and the reader never feels they opted out of something.

**Door C is a link, not an option.** It is not an answer to the question; it is
a change of instrument. Rendering it as a sixth radio row would put "count it
properly" in the same visual grammar as "I eat eggs", which is a category error
the eye notices before the brain does.

### 2.2 Do not show the target first

The tempting move is to open with the number: *"people your size training four
times a week need 120–140g."* It flatters the quiz, proves we were listening,
and motivates the answer.

It also **corrupts the answer.** Shown a target first, people pick the option
nearer it — not from dishonesty but because a stated number reframes the
question from *what do you eat* to *how close am I*. We would be anchoring the
one input the entire module depends on, and then selling a gap computed from
it.

So the hint states the **basis** and withholds the number:

> *"You train four times a week — that moves this number more than most people
> expect."*

This does the listening work (**B2**) without giving anything to aim at, and it
buys the target a much better moment: arriving *with* the comparison, where it
is information rather than an instruction. Better design and cleaner data, which
is the rare case where the honest choice is also the effective one.

The basis line is pre-written per situation — lifting, active, sedentary,
deficit — like every other string in this quiz.

### 2.3 Door C: one meal at a time, not a form

Four meal rows on one screen is the obvious layout and it does not survive
contact with a phone. Four rows of four chips is ~440px of content in a scroll
area that is ~250px on a short window: cramped chips, a scrollbar, and tap
targets smaller than everything else in the quiz. It looks like a form because
it is one.

**So Door C steps.** One meal per beat, inside the same screen:

```
┌─────────────────────────────────────────────────┐
│  A NORMAL DAY            ● ● ○ ○                │   ← 4 dots: the end is
│  What does dinner usually look like?            │      visible from the start
├─────────────────────────────────────────────────┤
│  ○ Light or snacky                              │
│  ○ A normal portion                             │   full-size options, same
│  ○ Meat or fish, decent size                    │   ergonomics as any question
│  ○ A big portion                                │
├─────────────────────────────────────────────────┤
│  ≈60g so far                          [ ● ● ○ ○ ]│   ← the running total,
└─────────────────────────────────────────────────┘      pinned above the CTA
```

Four taps, four full-size targets, no scrolling, no chips, no typing. It reads
as *one question with four beats*, not four questions — and the proof is
sitting in the header the whole time: **the quiz's own `3 / 10` counter does not
move.** A reader who glances up gets told, by the most trusted number on the
screen, that they have not been sent down a side quest.

The back arrow steps back through the meals before it leaves the screen, so a
misfire costs one tap rather than the whole path. Tapping the Door C link again
returns to the presets with nothing lost.

### 2.4 The number builds

This is the part that makes the long path worth taking, and it is one rule:

**While incomplete, show the running total and nothing else. Only when every
meal is answered does the target appear.**

> after breakfast → `≈25g so far`
> after lunch → `≈60g so far`
> after dinner → `≈100g so far`
> after snacks → `≈110g a day · target 120–140g`

Showing the target against a partial total would be actively dishonest —
*"25g against 130g"* reads as catastrophe to someone who has simply not got to
lunch yet — and dishonest in the direction of our own commercial interest, which
is the worst available direction. Withholding it costs nothing and removes the
one moment on this screen where a reader could feel ambushed.

The total **counts up** to each new value over ~250ms in tabular figures rather
than snapping. Small, and it does real work: a number that ticks reads as
*measured*, a number that appears reads as *looked up*. Suppressed under reduced
motion, which the quiz already threads everywhere.

### 2.5 The verdict strip, and the lesson it inherits

The verdict is pinned **above the CTA**, in flow, at a **height reserved from
first paint**.

`Reflection.tsx` documents the opposite decision — it floats out of the layout
precisely so nothing can move — and the two are not in conflict, they are the
same principle applied to different facts. The reflection *may never arrive*
(with no API key it never does), so reserving space for it would trade a jump
for a permanent empty gap that most readers only ever see empty. The verdict
**always** arrives, the instant the reader taps, and never leaves. Reserved
space for a thing that always fills; no space at all for a thing that usually
does not.

Getting this wrong here would be worse than it was there, because this line
appears while the thumb is already travelling toward Continue. A footer that
moves under a moving thumb is not a cosmetic bug; it is a mis-tap.

Everything else about the strip:

- **`aria-live="polite"`.** The number changes with no navigation, so without it
  a screen-reader user gets silence. Polite, not assertive: it must not
  interrupt the confirmation of the option they just pressed.
- **Never red.** Accent cyan for a gap — it is an opportunity, not a fault.
  Neutral warm for on-target and over. Nothing on this screen is an alarm.
- **`≈` always.** The estimate is labelled as an estimate everywhere it is
  rendered, including here, including when it is flattering.
- **Two lines maximum**, and the second is where the translation lives ("about
  one shake"), because the gram figure alone means nothing to most readers.

### 2.6 Four endings, and the tone of each

The verdict copy is where this module earns or loses trust, so it is written
out rather than left to the build:

| Verdict | On-screen | Why this tone |
|---|---|---|
| Big gap | `≈90g a day · target 130–180g`<br>*About 40g short of the range — about a shake and a bit.* | Plain arithmetic. The shake count rounds to the nearest **half**, because "two shakes" for a 40g gap overstates it by a quarter — and overstating the gap is overstating what we are selling. |
| Very big gap | `≈50g a day · target 130–180g`<br>*About 80g short — enough that it wants spreading across meals, not added in one go.* | Past ~2.5 shakes the honest answer stops being a product, and the sentence says so rather than quoting more tubs. |
| Small gap | `≈117g a day · target 130–180g`<br>*About 15g short — close. Easiest to close on the days you train.* | Proportionate. The second half varies by basis: "on the days you train" is useful to a lifter and slightly silly to someone who told us they don't. |
| On target | `≈130g a day · target 130–180g`<br>*That's on the money — nothing to fix here.* | Say it warmly and move on. We just told someone they are doing something right, having had every reason not to. |
| Over | `≈200g a day · target 130–180g`<br>*That's plenty. We'll leave protein out of your box.* | The most trust-building sentence in the quiz. It must be pleased, not grudging. |

The last row is the design decision the whole module should be judged on. A
calculator that only ever concludes *buy the thing* is not a calculator, and one
that says so out loud in the one case where it costs us a line item is the only
version whose other three rows can be believed.

### 2.7 The details that will otherwise get lost

- **The review row** reads `≈85g a day · target 120–140g`, never a list of
  option ids. Raw ids have reached this screen twice already in V2 (`35-44`,
  `75-90`), both times found by looking rather than by a test.
- **Editing from review returns to the door they used**, in the state they left
  it — Door C reopens on the summary of four answered meals, not back at
  breakfast.
- **The inline weight row.** Weight is optional on the personal screen. If it is
  unset, the module asks for it *inside* the screen — one row of five, the same
  labels — with `Skip` demoting to the coarse answer. It never blocks, and it
  never invents a weight.
- **First paint has no verdict**, only the reserved space and the CTA in its
  disabled state, so nothing shifts between paint and first tap.
- **Reduced motion** removes the count-up and the door transitions; the numbers
  and the copy are identical.
- **The dots are not a progress bar.** Four discrete dots, because four is
  countable at a glance and a bar implies a duration.

---

## Part 3 — How it integrates

### 3.1 The one structural rule to respect

Everything the interview knows must be **derivable from `picked`**. That is what
makes `rewindTo`, `reviseAnswer` and the review screen work without any of them
knowing what a question does — they replay answers and recompute. A module that
stashed grams in its own slice of state would break the edit-from-review flow
that was fixed two commits ago, and break it silently.

So: the protein module stores **option ids like every other question**, and the
grams are a pure function of those ids. One pick per meal row, or one preset id,
or one coarse id. `reviseAnswer` then works on it for free.

### 3.2 New files

**`src/lib/quiz-v2/protein.ts`** — the whole of the maths and all of the
copy, pure and free of React. **Built (Phase 1).** As shipped:

```ts
export type TargetBasis = 'sedentary' | 'active' | 'lifting' | 'deficit'
export type Verdict = 'big-gap' | 'small-gap' | 'on-target' | 'over'

/** A narrow struct, not `InterviewState` — see the note below. */
export interface ProteinProfile {
  weightBand: WeightBand | null
  ageBracket: AgeBracket | null
  basis: TargetBasis
}

/** Null when weight is unknown. Never falls back to an average person. */
export function proteinTarget(p: ProteinProfile): ProteinTarget | null

/** Sum of the grams behind the picks. Null when nothing carries a number. */
export function proteinIntake(
  picked: readonly string[],
  gramsFor: (optionId: string) => number | undefined,
): number | null

export function proteinVerdict(t: ProteinTarget, intakeG: number): Verdict
export function proteinGap(t: ProteinTarget, intakeG: number): number
/** 0 when on-target or over, so the caller clears the driver. */
export function proteinDriverWeight(t: ProteinTarget, intakeG: number): number

/** Pre-written. Never generated. */
export const BASIS_LINE: Record<TargetBasis, string>
export function verdictCopy(t: ProteinTarget, intakeG: number): VerdictCopy
export const runningTotal: (intakeG: number) => string

/** The adapter. Type-only import of the interview, so it compiles away. */
export function proteinBasis(state: InterviewState): TargetBasis
export function proteinProfile(state: InterviewState): ProteinProfile
```

Two deliberate departures from the sketch this replaces:

**It takes a profile, not an `InterviewState`.** The maths reaches for four
values; taking the whole interview would make a standalone `/protein` page
(open question 2) a refactor rather than an import. The adapter that reads one
out of the other sits at the bottom of the file behind a type-only import, so
lifting the module out later is a deletion.

**`proteinIntake` takes a lookup, not a question.** The grams live on bank
options, and passing `gramsFor` keeps the bank as the single place option ids
are declared while letting the arithmetic be tested without one.

**`src/components/quiz/v2/ProteinCheck.tsx`** — the screen. Sibling of
`PersonalFields`, which is the closest existing analogue: a compound screen with
local state, committed on Continue.

### 3.3 Changed files

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

### 3.4 The gate — when it fires

```ts
requires: (s) =>
  proteinModuleAllowed(s) &&
  (live(s, 'low-protein') || (trains(s) && hasGoal(s, 'muscle', 'bulking', 'cutting', 'recovery')))
```

`proteinModuleAllowed` is new, and §3.5 is why it is a named helper rather than
one clause of the gate. `predicates.ts` has no safety helper today because
nothing has needed to read the safety screen back until now.

The rest is `protein-reality`'s existing gate plus the cutting goal. `live` rather than `suspected` on purpose — that distinction is
the bug documented in `predicates.ts`, where the person with the *strongest*
evidence for a driver was the only one who never got the follow-up.

The planner needs no change. The module declares `discriminates:
['low-protein', 'under-fuelled']`, scores like anything else, and if the
interview has better things to ask it does not fire. That is correct: a person
who has just told us their problem is broken sleep does not need a protein
calculator, and forcing one on them is exactly the "working through a list"
behaviour V2 exists to stop.

### 3.5 The consent gate, and the hole underneath it

The Article 9 consent gate landed on the safety screen while this was being
written, and it changes the pregnancy guard in a way that is easy to get wrong.

**Declining consent does not produce an empty answer — it produces no answer.**
`HealthDataConsent` is explicit about this: the safety options do not exist
until consent is given, because "a smaller set of answers" is not a meaningful
version of optional. So a reader who declines has no `safetyFlags` at all.

A gate written as *"pregnancy is not ticked"* therefore fires for **everyone who
declined**, including the person it exists to protect. That is the whole guard
inverted by an absence, and it would never show up in a test written against the
happy path.

So the condition is three states, not two:

| Consent | Pregnancy | Module |
|---|---|---|
| Given | ticked | **suppressed** — falls back to Door A |
| Given | not ticked | runs |
| **Declined or not yet given** | unknowable | **suppressed** — falls back to Door A |

```ts
export const proteinModuleAllowed = (s: InterviewState): boolean =>
  !!s.healthDataConsent?.accepted && !hasSafetyFlag(s, 'pregnancy')
```

Named, in `predicates.ts`, with its own test for the declined case
specifically — the same treatment `live` got after the `suspected` hole, and for
the same reason: the failure is silent and only affects the people it most
matters for.

Two consequences worth stating plainly:

- **The module is off for anyone who declined**, which is a real cost in reach.
  It is the right cost. Door A still runs, so those readers get today's
  question and a stack, just not a number.
- **Consent can be withdrawn** — the component has an Undo. Withdrawal must
  re-run the gate and drop the module's answer, exactly as `reviseAnswer` drops
  a later answer an edit invalidated. Since the module's state lives in `picked`
  (§3.1), this is the machinery that already exists rather than new code, but it
  needs a test rather than an assumption.

### 3.6 What it costs in time and latency

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

## Part 4 — Implementation plan

Five phases. Each lands on `master` behind the existing arm flag and changes
nothing for customers, because V2 is still off.

### Phase 1 — The maths and the words — **done**
1. `quiz-v2/protein.ts`: target, intake, verdict — plus the two sets of
   pre-written strings the design turns out to need, `basisLine` (§2.2) and
   `verdictCopy` (§2.6). They live here rather than in the component because
   they are the part a person needs to read and argue with, and a string that
   only exists inside JSX never gets reviewed.
2. Unit tests: every weight band × every basis; the 45+ nudge; the deficit case;
   null weight; all four verdicts at their boundaries; midpoint arithmetic; the
   running-total sum for a partial day.
3. A table test that pins the full band × basis grid, so a change to the ranges
   is visible in a diff rather than buried in a helper.
4. A test that no verdict string states a deficiency, and that every rendered
   intake carries the `≈` (§1.7).

**Exit:** the numbers are right and reviewable as a table, and the sentences a
reader will actually see are readable in one file, with no UI to argue about
yet. This is the phase where the *ranges* and the *tone* get a second opinion.

### Phase 2 — The screen
4. `types.ts`: the `'protein'` select kind, `grams`, `mealRow`.
5. `bank/nutrition.ts`: author `protein-check` — preset options, meal-row
   options, and the coarse door carrying `protein-reality`'s four options
   verbatim. Retire the standalone question.
5b. `predicates.ts`: `hasSafetyFlag` and `proteinModuleAllowed`, with the
   declined-consent case tested explicitly (§3.5).
6. `ProteinCheck.tsx`: the preset list with Door A in it and Door C on a link
   (§2.1); the stepped meal beats and their four dots (§2.3); the
   build-then-compare rule for the running total (§2.4); the reserved,
   `aria-live` verdict strip (§2.5); the inline weight row when weight is
   unset.
7. `QuizV2.tsx`: render it; include it in `needsContinue` and `canContinue`.
8. Review-row rendering: `≈85g a day` rather than a list of option ids — the
   same class of bug as the raw `35-44` that shipped to the review screen twice.

**Exit:** all three doors complete the quiz; an edit from the review screen
returns to the right door in the state it was left; a reader who declined
consent never sees anything but the preset list; and nothing on the screen moves
between first paint and the first tap.

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
16. E2E: all three doors to a stack; pregnancy suppresses the module;
    **declining health-data consent** suppresses it too; withdrawing consent
    after answering drops the module's answer; the over-target path removes
    protein from the box.
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

3. **Is the estimate itself special category data?** Weight band and age sit
   outside the Article 9 gate today, described as dosing inputs. A dietary
   self-report plus a target derived from it is a step closer to health data
   than weight alone, even though it is a nutrition comparison rather than a
   condition. **Recommendation:** do not decide this in the build — it wants the
   same review the consent gate got. The safe default in the meantime is the one
   §3.5 already specifies, because gating the module on health-data consent
   covers it either way.

4. **Should V1 get it too?** No — that would contaminate the experiment, which
   is the whole reason V2 exists as a separate arm. If it wins, it ships with V2.

5. **The 45+ nudge.** Our top age band is `45+`, and the evidence for raising
   protein targets is really about 60+. Applying a nudge at 45 is defensible but
   imprecise. **Recommendation:** keep the nudge small (+0.2 g/kg on the floor
   only) and do not mention age in the copy, so we are not making a claim we
   cannot support with a band this wide.
