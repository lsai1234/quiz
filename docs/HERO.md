# Act 1 — the hero (`src/components/scroll/Act1Hero.tsx`)

## Current design: question-first instant start

The hero **is step 1 of the quiz**. A single, above-the-fold screen (no scroll
engine): logo → a gently floating bottle → headline + value line → the quiz's
first decision inline as two tappable cards (**Performance & training** /
**Everyday wellbeing**) → an "Not sure? Start anyway →" escape → honest trust cues.

Tapping a track sets it in the quiz store (`useQuizStore`) and calls `onEnterQuiz`,
landing straight on the goal grid (the `goals` step renders the grid directly when
a track is set, so there's no duplicate chooser). "Start anyway" enters with no
track and shows the in-quiz chooser.

**Why this design** (how to get people in *and* engaged):
1. Zero friction to the first action — the first question is on the first screen,
   no scroll. One tap = visible progress = commitment.
2. Value in one glance — what it is, what you get, how long (~90s).
3. An easy, meaningful first choice that self-segments and routes the flow.
4. Honest trust cues (no fabricated stats; a real social-proof slot can drop in).
5. Fast + robust + reduced-motion safe; ambient motion only (a floating bottle),
   never a performance the user must sit through.

## Performance

Hero imagery is optimised **webp at ~2× render size** (bottle/lid/capsules),
generated from the original oversized PNGs: **~11.4 MB → 31 KB**. The bottle is
`fetchPriority="high"`, `decoding="async"`.

## Retired (Git history)

The previous Act 1 was a 400%-scroll, pinned + scrubbed GSAP "deconstruction"
(bottle opens → capsules rise → reassemble → CTA), with a bespoke touch-physics
loop on mobile. It was removed because pinned+scrubbed timelines are inherently
janky on mobile (dynamic-viewport refreshes, pin-spacer jumps, scrub lag) and,
critically, it gated the first action behind a long scroll. The optimised webp
assets it introduced are reused by the new hero.

## Future (optional)

Real social proof (reviews / counts) in the trust row; A/B the headline; a subtle
ambient capsule accent. None are required — the hero is intentionally lean.

## Verification

`tsc` + `build` + tests clean. Headless `/` (desktop + mobile): hero paints
immediately, page is ~1× viewport (no pin spacer / scroll-jack), tapping a track →
the matching goal grid, "Start anyway" → the chooser, reduced-motion renders
static — zero console errors.
