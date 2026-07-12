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

## CHRGD LQD — the drinks package

A third choice on the opening screen (`Act1Hero`): tapping **CHRGD LQD** flips
the two track cards into drinks framing ("Drinks for training" / "Drinks for
every day"), so choosing drinks costs no extra step — it sets
`answers.drinksMode` alongside the normal track. Everything downstream rides
the existing machinery:

- **Same quiz**, minus the formats question (`skipInDrinksMode` in
  `quiz-flow.ts` — the answer is implied) and with LQD copy overrides
  (`lqd: { q, hint }`, applied after the track override).
- **Drinks-only blueprint**: `buildStackBlueprint` filters the candidate
  catalogue through `isDrinkable` (`src/lib/catalogue/filters.ts` —
  powder/RTD/liquid/effervescent formats; capsules never qualify). Slots with
  no drinkable candidate fall away via the existing graceful omission. Swap
  alternatives and boosters on the review page respect the same filter.
- **Month-of-drinks framing**: the promise is a monthly pool — drink whatever,
  whenever — not a daily regimen. `src/lib/lqd.ts` computes the monthly drinks
  tally (Σ `occasionsPerMonth` over the subscription plan) and a per-drink
  "pour guide" moment (pre before training, greens with breakfast, collagen in
  the evening…), rendered by `LqdPourGuide` on the stack review. Pricing,
  checkout, accounts and the hub are unchanged — an LQD bundle is a normal
  bundle whose products all happen to be drinks.
- **LQD drink products**: the mock catalogue carries drinkable counterparts to
  the capsule staples — `chrgd-lqd-daily` (multivitamin drink, health slot),
  `chrgd-night-pour` (sleep drink), `chrgd-immunity-fizz` (vit C + zinc + D
  effervescent) and `chrgd-clear-whey` (juice-style protein) — so an LQD
  package covers vitamins, sleep and immunity entirely in drinks. Their
  priorities sit at/below the capsule equivalents, so normal-mode picks are
  unchanged. Live, create the Shopify equivalents and tag their format
  `powder`/`drink`/`effervescent` — anything so tagged joins LQD automatically.

## UX in `Act2Quiz`

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
