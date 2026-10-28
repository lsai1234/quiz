# Shape your day as Pinpoint evidence: proposal

Amp Consult and offer plan, Phase 7.4: "Propose how these feed Pinpoint as
evidence, like a probe answer marked `drawn`. This touches the maths, so
propose it first, with `twenty-questions.test.ts` results before and after."

**Nothing here is live.** `DRAWN_EVIDENCE_LIVE` in
`src/lib/consult/pinpoint/drawn.ts` is `false`. As built, the curve reaches
Pinpoint only through the afternoon level, the same 1–10 `energy` the battery
gave, so every score is unchanged (a test checks that).

## What's read off the curve

`readCurve` (`src/lib/consult/day-curve.ts`), from the ten points 06:00–24:00:

| Item | Answers | Read as |
| --- | --- | --- |
| dip | deep · some · none | lowest point 12:00–18:00 that sits 3+ levels (deep) or 2 (some) under the best hours either side |
| morning | slow · fine | 06:00–08:00 two levels or more under 10:00–12:00 |
| evening | rise · flat | 20:00–22:00 two levels or more above anything from noon to 18:00 (a second wind, not just recovering from a dip) |

The five presets read as you'd expect: 3pm dip is a deep dip, Slow starter a
slow morning, Second wind a rise (after a small afternoon dip), Steady none of
them. Not sure gives no curve and no evidence.

## How they'd feed Pinpoint

Like a probe answer nobody had to ask. Each item is a probe item with the same
shape as the library's (a base rate per answer, pulls written as strength
words), and goes through the same `evidence()` as every probe, once, before
the round starts.

| Item | Answer | Pulls |
| --- | --- | --- |
| dip (base 25 / 20 / 55%) | deep | 3pm crash strongly; running on empty, eating less, wired and tired a little |
| | some | 3pm crash a little |
| | none | away from 3pm crash clearly; from running on empty and eating less a little |
| morning (30 / 70%) | slow | short on sleep clearly; broken nights and stiff starter a little |
| | fine | away from short on sleep a little |
| evening (25 / 75%) | rise | wired and tired clearly |
| | flat | away from wired and tired a little |

Two rules on top:

1. **Drawn evidence is an answer, never one "mainly about" a pattern.** It
   shows in the read as a reason ("Your day drops sharply around 4pm"), but a
   hunch still needs a probe answer behind it, so Amp never puts a pattern to
   someone on their drawing alone. It doesn't count as a probe that "tested" a
   pattern either, so it can't help rule one out.
2. **A drawing points away only a little** (at most 0.4 in log-odds, the size
   of a small nudge). A quick drawing can miss a dip that's there; one that
   shows a dip is hard to draw by accident. Without this cap, the crashers
   whose drawing missed the dip fell out before Amp asked them anything (below).

Two ways to combine it with what's there:

- **Add (recommended):** on top of everything, including the afternoon
  level's nudges.
- **Replace:** instead of the afternoon level's three nudges to the 3pm crash
  (the same afternoon, counted once).

## Results

The 20 Questions people, the same seeds as `twenty-questions.test.ts`, each
now drawing their day. They draw from what's true for them, not from the pulls
above, so this tests reading the curve as well as the maths: a pattern of
theirs shows in the drawing three times in four, a shape that isn't theirs
turns up one time in ten, and every point but the afternoon's wobbles a level a
third of the time. The afternoon matches the energy they gave, as the widget
makes it. (`src/lib/consult/pinpoint/__tests__/drawn-people.ts`.)

`twenty-questions.test.ts` itself is unchanged and passes, before and after:
its people have no curve, so drawn evidence can't move them.

At 20 people a case, one lucky seed moves a case by 5%, so the comparison is
also run with 60.

| | Found within 12 | Worst case | Median questions | Mean questions | Wrong guesses a consult | Pinned wrongly | Nothing going on: most questions |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Before: `twenty-questions.test.ts` today (20 each) | 90.8% | 75% (builder/weekend-warrior) | 5 | 5.50 | 0.518 | 0 | 10 |
| Drawn day, evidence off (as built) | 90.8% | 75% (builder/weekend-warrior) | 5 | 5.50 | 0.518 | 0 | 10 |
| Drawn day, evidence on: add | 89.5% | 75% (weight/crash) | 5 | 5.37 | 0.455 | 0 | 8 |
| Drawn day, evidence on: replace | 89.5% | 75% (builder/crash) | 4 | 4.68 | 0.459 | 0 | 12 |
| Before, 60 each | 88.1% | 76.7% (builder/weekend-warrior) | 5 | 5.43 | 0.497 | 0 | 10 |
| **Add, 60 each** | **90.3%** | **81.7%** (builder/weekend-warrior) | 5 | **5.17** | **0.426** | 0 | **8** |
| Replace, 60 each | 89.1% | 68.3% (ager/crash) | 4 | 4.55 | 0.409 | 0 | 12 |

Without the cap on pointing away (60 each): add 88.7%, worst 68.3%
(ager/crash), mean 4.39; replace 88.4%, worst 61.7% (everyday/crash).
Fewer questions, but the crashers who drew a flat day were dropped.

The 3pm crash, found within 12, of 60:

| | Before | Add | Replace |
| --- | --- | --- | --- |
| builder | 47 | 53 | 43 |
| ager | 46 | 52 | 41 |
| everyday | 46 | 51 | 44 |
| weight | 54 | 49 | 42 |

Mean questions to confirm, where it moves most (60 each): eating less
4.78 → 4.22, staying sharp 3.49 → 2.81, short on sleep 3.21 → 2.67, 3pm crash
3.49 → 3.12; keeping strong goes the other way, 5.81 → 6.55. The full
per-pattern and per-case tables come from
`DRAWN_REPORT=<file> npx jest drawn-evidence`.

### Reading it

- **Add** finds more people's main pattern (88.1% → 90.3%), lifts the worst
  case (76.7% → 81.7%), asks a quarter-question fewer on average, cuts wrong
  "Is this you?" guesses by about a seventh, and lets someone with nothing
  going on finish in 8 questions at most instead of 10. Nothing is ever
  pinpointed that the person didn't confirm.
- Its cost is the weight journey's 3pm crash (54 → 49 of 60): a deep dip also
  points a little to eating less, and on that journey eating less gets asked
  about first.
- **Replace** asks fewest questions but loses crashers whose drawing missed
  the dip, because it has dropped the afternoon level that would have caught
  them. Not recommended.
- Worth knowing either way: at 60 people a case, **today's** Pinpoint finds the
  main pattern 88.1% of the time, under the test's 90% bar. The test passes on
  its own 20 seeds (90.8%). That's not something this change causes, and
  changing it would touch the maths, so it's flagged here rather than fixed.

## To decide

1. Turn drawn evidence on, as **add** with the cap (recommended), as replace,
   or leave it off.
2. If on: the four reasons it can add to the read ("Your day drops sharply
   around 4pm", "Your day dips around 4pm", "Slow to get going in the
   morning", "A second wind in the evening") go into the review pack first,
   like any new line in the read. They restate the drawing; they don't
   interpret it.
3. Should the test's 90% bar be checked at 60 people a case? Today that
   would fail (88.1%) without the drawn evidence.

Going live is one line (`DRAWN_EVIDENCE_LIVE = true`), plus moving the "add"
checks in `drawn-evidence.test.ts` into `twenty-questions.test.ts` with drawn
people.
