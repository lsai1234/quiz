# The day ring: how it sits with the reticle and the battery

Amp Consult and offer plan, Phase 7.3 asks to propose this. The
recommendation is marked in each case.

**Decided 2026-10-29:** reticle **B**, built: the ring stays on Pinpoint's
screens and the reticle's arcs close in round it (`pinpoint/Reticle.tsx`).
Rather than growing the slot to 56px, the slot stays 48px and the arcs draw
4px out into the space round it: at 56px a hunch with three reasons scrolled
on a 390×664 phone. Battery **A**: kept in the top bar.

## What was built first

- On every core scene and the review, Amp sits inside his day ring, a
  24-hour dial in the reticle's footprint (48px), so no screen moved. It
  plots only what they've told us, and each mark is where that answer's
  flight lands.
- Scene one shows an empty track (nothing to plot yet); the ring's code
  arrives after the first answer.
- The circuit check keeps Amp on his own, still, in calm mode.
- The larger ring, with hour labels and the day in words beside it, is built
  for the read (Phase 8) and shown in the workshop.

## 1. The Pinpoint reticle

| | What happens on Pinpoint's screens | For | Against |
| --- | --- | --- | --- |
| **A (built)** | The reticle takes Amp's spot, as before; the ring steps aside for the round and is back after it. | Nothing new to learn; Pinpoint's screens are unchanged and still fit a phone without scrolling. | The ring is hidden exactly when Pinpoint learns times: the last cup moving from the tally to 16:00 happens off screen. |
| **B (recommended)** | The ring stays, and the reticle's four arcs close in round the outside of it. | Their day keeps filling in as Pinpoint learns it, and the reticle still says how sure Amp is. The two read as one object. | The slot grows from 48px to 56px on Pinpoint's screens (8px taller); the fit-a-phone check has to pass again. |
| C | The reticle becomes the ring: the dial's own track tightens as Amp gets surer. | One element. | Two meanings in one ring; harder to read at 48px, and the lock-on moment loses its snap. |

## 2. The battery progress meter

| | | For | Against |
| --- | --- | --- | --- |
| **A (built, recommended)** | Keep the battery in the top bar. | It's progress and navigation (tap a section to jump to it); the ring is their day, not how far through they are. | Two small graphics at the top of the screen. |
| B | Retire the battery; the ring's rim fills as progress. | One graphic. | Loses jump-to-section, and mixes "how far through" with "what your day looks like". |

## Decided

Reticle: B, built 2026-10-29; Pinpoint's questions still fit both phone sizes
without scrolling (`19-consult-a11y.spec.ts`). Battery: kept (A).
