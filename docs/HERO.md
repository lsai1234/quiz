# Act 1 — Hero "Deconstruction" scroll: review & roadmap

`src/components/scroll/Act1Hero.tsx`. A pinned, scroll-scrubbed (desktop) /
touch-physics (mobile) GSAP timeline: a bottle arrives → lid lifts → five
ingredient capsules rise to a labelled shelf → reassemble → headline + "Start
your profile" CTA. A reduced-motion fallback renders a static composed layout.

## What's strong

- A genuinely distinctive, on-brand set-piece with thoughtful choreography
  (beats, breathing gaps), a progress rail with labelled beat ticks, and a
  proper reduced-motion path.
- Layout is resolution-aware (recomputed on resize) and assets preload.

## Issues found

| # | Area | Issue |
|---|---|---|
| 1 | **Performance (severe)** | Shipped seven PNGs at 1.0–2.0 MP each — **~11.4 MB total** — rendered at tiny sizes (bottle 240×360, capsules 100×40). All were preloaded *before the hero could paint*, so first paint sat behind a spinner. **FIXED this round** (see below). |
| 2 | **Entry / conversion** | The "Start your profile" CTA only fades in at the *end* of the timeline — on desktop you must scroll ~400% to begin; on mobile, swipe through the whole physics run. No always-available Start, no skip. |
| 3 | **Mobile scroll feel** | A custom touch-velocity friction loop drives the timeline and `preventDefault`s touch — it hijacks native scrolling, can feel unpredictable, and is fragile to maintain. |
| 4 | **Narrative / hook** | The value proposition ("Every body is different / Find your stack") appears only at the very end. The first thing a visitor sees is an unexplained bottle. |
| 5 | **Relevance** | The five ingredients are hard-coded and generic (creatine, whey…), the same for everyone. |
| 6 | **Pacing / length** | ~400% of scroll with deliberate gaps + a 7.5-unit capsule window is long; no way to fast-forward. |
| 7 | **Accessibility** | Good reduced-motion path, but the animated path traps mobile scroll and offers no keyboard route to the CTA until the end. |
| 8 | **Instrumentation** | No analytics on how far people get through the intro, so drop-off is invisible. |
| 9 | **Maintainability** | One large imperative GSAP timeline with absolute-pixel layout math; hard to tune safely. |

## Roadmap

### DONE — this round (#1: performance)
- Generated optimized **webp** at ~2× render size (bottle 480×720, lid 400×267,
  capsules 200×80) from the oversized PNGs: **11.4 MB → 31 KB** (~99.7% smaller),
  no visible quality loss. `Act1Hero` now references the webp.
- **First paint no longer waits on the capsules:** only the bottle + lid block
  `assetsReady`; capsules load in the background (they don't appear until Beat 3).
- Added `decoding="async"` (+ `fetchPriority="high"` on the bottle).
- Verified in-browser: 7 webp / 0 PNG / 31 KB total, hero renders crisply, zero
  console errors. (Source PNGs remain in `public/hero/` for reference; nothing
  fetches them now.)

### NEXT
- **Instant-start + skip** (#2): a persistent "Start your profile" / "Skip intro"
  control so anyone can enter the quiz immediately; keep the showcase for those
  who scroll. Highest-leverage conversion fix.
- **Earlier hook** (#4): bring a one-line value proposition (and logo) in at the
  very start, not just the end.

### LATER
- **Mobile scroll** (#3): replace the bespoke physics with native scroll-driven
  progress (e.g. an IntersectionObserver/scroll-linked timeline or the
  ScrollTimeline API with a JS fallback) so it never hijacks the page.
- **Pacing** (#6): tighten the timeline / shorten the scroll distance; add a
  "watch again" only if wanted.
- **Relevance tease** (#5): hint that the stack will be personalised ("we'll build
  yours next") rather than implying these five are the product.
- **Instrumentation** (#8): fire scroll-progress milestones for drop-off insight.
- **Maintainability** (#9): factor the timeline beats into small,
  individually-tunable builders.

## Verifying the performance work

`npx tsc --noEmit` + `npm run build` clean. Headless load of `/` asserts only
webp are fetched for `/hero/*` and the total is ~31 KB, with zero console errors;
screenshot confirms the bottle/lid render sharply.
