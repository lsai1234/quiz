# The Quiz — UX architecture & roadmap

The acquisition funnel: `ScrollExperience` → `Act1Hero` → **`Act2Quiz`** →
`Act3Analysis` → `Act4Reveal` (`StackReviewPage`) → `Act5Bundle`. Quiz state lives
in `src/lib/store.tsx`.

## Flow model (the questionnaire backbone)

`Act2Quiz` is driven by a single ordered, id-based step sequence in
`src/lib/quiz-flow.ts` (`QUIZ_STEPS` + `activeSteps(track)`):

- Each step has an `id`, `section`, copy (+ wellbeing override), `tracks` it
  belongs to, and an `advance` mode (`auto` single-choice / `manual` multi).
- `activeSteps(track)` filters the sequence for the chosen track, so the
  performance track includes the training steps and wellbeing skips them — with
  **no numeric-index special-casing**. Progress, next/prev, and the review
  "edit" jumps all read from this sequence.

The order **leads with the goal** (engaging) and puts personal info second.

**Keep-yours-or-try-ours:** the supps step skips anything the user already
takes, but each excludable selection gets an inline follow-up toggle — "Keep my
own" (default, unchanged behaviour) or "Include CHRGD's" — stored in
`answers.tryOurs`, which bypasses that item's already-taking exclusion in
`scoreProduct`. The review screen shows a "Trying ours" row when any are
flipped. Only items that actually drive an exclusion offer the toggle.

**Track framing:** the two tracks are presented as **Everyday wellness** (id
`wellbeing`, listed first) and **Performance + wellness** (id `performance`) —
the second *adds* training on top of wellness rather than excluding it. On the
combined track the goals step shows both goal grids (Performance + Everyday
wellness sections), and the wellness follow-up questions appear on either track
(they're a pure function of the wellness goals picked). The engine needs no
special-casing: required slots and product picks key off the chosen goals, not
the track.

## CHRGD LQD — the pre-made drinks package

A third choice on the opening screen (`Act1Hero`): tapping **CHRGD LQD** flips
the two track cards into drinks framing and shows the zero-prep pitch ("Every
drink arrives ready-made · No powders, no pills, no mixing · Drink what we
send — you're covered"). It sets `answers.drinksMode` alongside the normal
track; everything downstream rides the existing machinery.

**The package promise is convenience**: everything arrives as a real,
ready-made drink. Easier than a shelf of tubs and pill bottles — the customer
drinks what we send and their month is covered.

- **Same quiz**, minus the formats question (`skipInDrinksMode` in
  `quiz-flow.ts` — the answer is implied), plus one LQD-only step — **"How many
  drinks a day?"** (`drinksPerDay`, `onlyInDrinksMode`, sits right after goals)
  — and with LQD copy overrides (`lqd: { q, hint }`, applied after the track
  override). `drinksPerDay` is a *pace*, not a dose: it never changes the
  amounts or pricing, only how the month-of-drinks story is framed.
- **Pre-made only blueprint**: `buildStackBlueprint` filters candidates
  through `isReadyToDrink` (`src/lib/catalogue/filters.ts` — `rtd`, `drink`,
  `shot`, `can`… formats). **Powders and effervescents never qualify** — they
  need mixing. Slots with no RTD candidate fall away via the existing graceful
  omission. Swap alternatives and boosters on the review page respect the same
  filter (`lqdOnly`).
- **The LQD ready-to-drink range** (mock catalogue): LQD Protein (bottled
  shakes), Hydrate (electrolyte bottles), Charge / Charge Zero (energy cans),
  Daily Vits (vitamin drink), Night (wind-down bottle), Immunity Shot, Greens
  (cold-pressed bottles), Recover (post-session bottles) and Creatine Shot —
  full slot coverage as drinks. One case ≈ one month at standard usage, so a
  subscription never needs more than a case per line per month. Priorities and
  goal sets sit at/below the powder/capsule counterparts, so **normal-mode
  picks are unchanged** (regression-tested). Live, tag Shopify products
  `rtd`/`drink`/`shot` and they join LQD automatically.
- **Month-of-drinks logic** (`src/lib/lqd.ts`, `buildLqdPlan`): the LQD promise
  is that you *don't* need a drink of everything every day. The whole month's
  drinks land in one box and you sip them at your own pace — it's the **monthly
  total** that keeps you covered, not a daily schedule. So each line is
  classified as:
  - **timed** — the pre-workout / `energy` slot only: one per session, a real
    moment (keeps its `pourMomentFor` note).
  - **anytime** — vitamins, protein, greens, hydration, recovery, sleep, gut:
    a pool with no daily obligation (gets a `coverageNoteFor` line: "N for the
    month — have them most days and you're covered").

  `buildLqdPlan` totals the pool, splits timed vs anytime, and **reconciles the
  chosen `drinksPerDay` pace against the fixed pool**: `daysOfCover` +
  a `fit` (`brisk` runs it down early → suggest boosters · `balanced` lands on a
  month · `stretches` lasts past 30 days). This is a presentation layer over the
  already-sized subscription plan — quantities, pricing, checkout, accounts and
  the hub are all unchanged. `LqdPourGuide` renders it as a **liquid**
  experience (filling month gauge with a drifting meniscus, drinks as little
  liquid levels; `.lqd-*` classes in `globals.css`, held still under
  `prefers-reduced-motion`). The quiz's pace step uses the same liquid-glass
  motif.
- The mixable powders added earlier (Daily Fizz, Clear Whey, Night Pour,
  Immunity Fizz) remain regular-catalogue products for the normal stack
  builder; they are not LQD-eligible.

## UX in `Act2Quiz`

- **Answer-guidance pill.** Each step declares a `select` mode in
  `quiz-flow.ts` (`one` / `multi` / `optional` / `form`); the header renders a
  matching pill — "Pick one" (radio icon), "Pick all that apply" or "Pick any
  — or skip" (checkbox icon) — so the user never has to discover whether one
  tap advances or they choose several. Option marks reinforce it: single-choice
  options show a **circle** (radio), multi-select a **rounded square**
  (checkbox). `form` steps (personal, review) show no pill.
- **Self-explaining Continue.** When a manual step's requirement isn't met the
  button isn't a dead grey control — it names what's missing ("Pick at least
  one goal", "Add your age to continue", "Choose a bundle") and enables once
  satisfied.
- Real **Step X of Y** counter + a top progress bar; a one-time "N quick
  questions · about a minute" cue on the first step.
- Consistent **Back** (every step past the first) + **Continue** (every manual
  step); single-choice steps auto-advance but Back always works, including
  across the wellbeing skip (it just walks the sequence).
- **Focus management**: focus moves to the question heading on each step.
- A terminal **review** step summarises the answers, each row tapping back to its
  step to edit, before "Build my stack →" runs the existing
  `handleFinish`/`generateStack` (engine, `Act3`, `Act4` untouched —
  `QuizAnswers` is unchanged).

## Selling as you answer (all quizzes)

The quiz does the merchandising while it's being filled in. `src/lib/quiz-sell.ts`
(`sellingCueFor`) maps the just-made pick to a short, claim-safe, benefit-led
line; `Act2Quiz` shows it as a non-blocking chip (`SellingCueChip`) that springs
up on each answer and drifts away on its own. There are two copy sets: the
normal stack keeps the stack-benefit voice; **drinks mode makes every cue about
drinks and convenience** ("A pre-workout you just crack open", "one box instead
of a shelf of tubs"). Cues are keyed to the chosen value so re-picking re-shows.

## Liquid brand chrome (LQD)

In drinks mode the whole run *feels* like liquid, not just the copy:
- the signature right-edge rail becomes a **`LiquidRail`** — a glass tube that
  fills with liquid as you answer (wavy meniscus, rising bubbles, droplet cap,
  a quiet "% poured"), swapped in for the `ChargeRail`;
- the floor becomes a **rising liquid pool** that grows with progress, with a
  drifting surface and bubbles;
- the pace step's options use a **liquid-glass** motif (each glass fills to its
  level); and the generating overlay pours ("Topped up · Pouring your month…").
All liquid motion is held still under `prefers-reduced-motion`
(`.lqd-*` / `cue-*` rules in `globals.css`).

## Retention-style UX roadmap (north-star: quiz-taking experience)

**Done (this round):** questionnaire flow overhaul (sequence backbone, progress +
time, consistent nav, lead-with-goal, focus, answer review).

**Next:**
- *Instant-start / skippable hero* — the Start CTA currently only appears at the
  end of the hero animation; add a persistent Start so the quiz begins
  immediately (showcase stays for those who scroll).
- *Persist & resume* — `zustand/persist` the quiz store + a "resume where you
  left off" prompt (a refresh currently wipes all answers).
- *Results moment* — real fit score (not the `84` fallback), per-product "why
  this for you" (reuse `aiReasons`), edit-answers-from-results, make the Act3
  wait outcome-driven rather than a fixed ~3.4s.

**Later:** contextual micro-feedback after answers (reuse the unused
`components/quiz/LiveFeedback.tsx`); an accessibility pass (auto-advance +
screen readers, colour-only cues, keyboard); mobile-hero perf review + deep-link
to the quiz; consolidate the two checkout surfaces (`Act5Bundle` appears
unreachable vs `StackReviewPage`).
