# Act 1 — the hero (`src/components/scroll/Act1Hero.tsx`, `src/app/hero.css`)

## Current design: the first question is the front page

One screen, one job: get the first tap.

```
getCHRGD                                   [Shop >]

        capsules bursting out of the bottle,
        which hovers on a glowing charge pad

            Know exactly
            what to take.
  A few quick questions, then a supplement stack
   built around your goals, training and diet.

        What do you want to work on?
  [ More energy    ] [ Sleep better       ]
  [ Build muscle   ] [ Less stress        ]
  [ Get lean       ] [ Focus & brain fog  ]
  [ Recover faster ] [ Immune support     ]
  Tap one to start. You can add more on the next screen.
        Something else? See every goal >
  ✓ About 90 seconds  ✓ No sign-up  ✓ Skips what you already take
```

Tapping a goal pours the charge across it (420ms, nothing under reduced motion)
and opens the quiz on its goals screen with that goal already chosen and lit,
the rest of the grid beside it to add to. "See every goal" opens the quiz on
its own track chooser with nothing chosen. On a wide screen the bottle moves
beside the words, so the answers are not below a laptop's fold.

## What it replaced, and why

The previous hero asked the same question as two cards: **Everyday wellness**
and **Performance + wellness**. On an iPhone the first card sat at the bottom
edge of the screen and the second under Safari's toolbar, below a 150px bottle
and a three-line headline. And the choice itself was a category, not a want:
nobody arrives thinking "performance + wellness", they arrive thinking "I'm
knackered" or "I want to put on muscle". The visitor had to translate their
reason for coming into our taxonomy before they could start.

What the new one changes:

1. **Concrete answers, not categories.** Eight goals people recognise
   themselves in. The track is derived from the goal, not asked: a training
   goal opens the combined track, a wellness goal opens wellness, exactly as the
   quiz's own two cards would. The goals screen keeps its switch.
2. **The answers are above the fold.** Everything needed to decide — what this
   is, what you get, what it costs you, and the answers — fits above the
   toolbar of an iPhone 15. On a short phone the first rows are in view.
3. **The tap is an answer, not a door.** It is the first answer of the quiz,
   and the next screen shows it lit. "You can add more on the next screen"
   removes the hesitation of somebody with two goals who is not sure which to
   tap.
4. **The tap is seen to land.** The charge pours across the answer before the
   quiz slides in — the brand's "progress is poured, not filled" idea, on the
   very first interaction.
5. **A headline that names the problem.** "Know exactly what to take" is the
   outcome somebody staring at a shelf of tubs wants, rather than a statement
   about bodies.
6. **Honest trust cues.** Each is something the quiz actually does: about 90
   seconds, no account until checkout, and the "already using any of these?"
   step that leaves out what somebody has.
7. **The shop moved to where people look for a shop** — top right — and is
   still deliberately quiet.

## Both quizzes get the answer

The hero writes the track and goal to the shared quiz answers (`answers.track`,
`answers.goals`) and sends the visitor to the top of the quiz: the step counter
goes back to 0 and a saved v2 interview is dropped. Someone who taps a goal
rather than "Resume" gets the quiz they just asked for, not the middle of the
last one.

- **v1** reads the answers in place, as it always has.
- **v2** used to ignore the hero entirely and ask for the track a second time.
  It now opens a fresh interview from the hero's answer (`openedFromHero` in
  `src/lib/quiz-v2/interview.ts`), so it starts on the same lit goals screen.

The goals screen itself is unchanged in both, so the split test between them
still compares like with like from the second screen down.

## The look

Built on the token set (`src/app/tokens.css`) rather than the quiz's old
palette, so the front page reads as the same room as the hubs:

- **The ground** — the system's three drifting blooms, vignette and grain, plus
  a spotlight behind the bottle.
- **The stage** — the bottle hovering on a charge pad with a slow pulse ring,
  and the five branded capsules bursting out of its mouth into place, then
  drifting. Sized in container units, so the composition scales with the stage,
  which shrinks on short phones (`clamp(108px, 21svh, 200px)`).
- **The answers** — solid controls with the specular top edge, an accent icon
  tile, and the accent gradient poured across on pick.

Copy rises in on a short stagger. Every answer is tappable from the first frame
(the entrance animates opacity and transform only), and reduced motion — from
the media query or the `reducedMotion` prop — removes all of it.

Assets are the existing webp renders: bottle 15 KB, five capsules 2–4 KB each.

## Measuring it

Start rate is `quiz_start` over visits, both already recorded. `quiz_start`
carries the track, and `quiz_complete` carries `primaryGoal`, which for anybody
who came in through the hero is the goal they tapped.

## Retired (Git history)

- The two-card track chooser above, until this change.
- Before that, a 400%-scroll, pinned and scrubbed GSAP "deconstruction" (bottle
  opens, capsules rise, reassemble, CTA), with a bespoke touch-physics loop on
  mobile. Removed because pinned and scrubbed timelines are inherently janky on
  mobile and it gated the first action behind a long scroll. Its webp assets are
  what the stage is drawn from.

## Verification

`tsc`, unit tests (`src/components/scroll/__tests__/Act1Hero.test.tsx`, the
H11 rollout tests in `level3-d.test.tsx`, `openedFromHero` in
`interview.test.ts`) and the e2e journeys, which now enter through a hero goal
(`tapHeroGoal` in `e2e/support/quiz.ts`).
