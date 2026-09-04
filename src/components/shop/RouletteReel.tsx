'use client'

import { useEffect, useRef, useState } from 'react'
import type { RouletteEntry } from '@/lib/shop/roulette'
import { entryLabel } from '@/lib/shop/roulette'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { ProductTile } from '@/components/stack-review/ProductTile'

/**
 * The reel.
 *
 * ── What this replaces, and why it was not good enough ──────────────────────
 * A `setTimeout` every 70ms swapping the product name for a random other one,
 * for 900ms. It read as text flickering, because that is what it was: nothing
 * moved, nothing had weight, and the "stop" was a state change rather than an
 * arrival. A lever you pull should feel like it has a mass on the end of it.
 *
 * ── What makes this feel physical ───────────────────────────────────────────
 * Four things, none of which are the animation library nobody wants to ship:
 *
 * 1. **One continuous position, not frames of content.** The strip is real: a
 *    column of the actual products the wheel could land on, translated on Y by
 *    a number that comes from a clock. Nothing swaps; a thing moves.
 * 2. **Deceleration with an overshoot.** Velocity decays on a quintic ease-out
 *    and then a small damped spring settles it back onto the detent, so the
 *    reel arrives, bounces once against the stop and rests. A pure ease-out
 *    lands too politely and reads as a fade.
 * 3. **Motion blur tied to the actual velocity.** Blur is computed per frame
 *    from how fast the strip is moving, so it smears when it is quick and is
 *    perfectly sharp the instant it stops. A fixed blur that switches off is
 *    the thing that makes cheap slot machines look cheap.
 * 4. **A detent every row.** The strip is snapped to a row pitch, so the
 *    slowing feels like it is passing over stops rather than sliding on ice.
 *
 * The whole thing is one `requestAnimationFrame` loop over a closed-form
 * position function — no per-frame state updates, no React re-render per frame.
 * The DOM node's transform is written directly.
 *
 * ── The outcome is decided before the first frame ───────────────────────────
 * `spin()` in `lib/shop/roulette` picks the landed entry under the guardrails
 * (in stock, inside the shopper's filters, priced as we will charge). This
 * component is told what it landed on and is only responsible for arriving
 * there convincingly. It cannot land anywhere else, and `roulette.test.ts`
 * holds the guardrails independently of anything here.
 */

/** Height of one row in the strip, in px. The detent pitch. */
export const ROW_H = 84

/** How many rows fly past before the landed one. More rows, longer pull. */
const RUN_ROWS = 18

/** The pull. Long enough to feel like weight, short enough not to be a wait. */
const SPIN_MS = 2200

/** The settle after the overshoot. */
const SETTLE_MS = 620

/** How far past the detent the reel carries before it is pulled back, in px. */
const OVERSHOOT = 26

interface Props {
  /** Every row on the drum, in order. */
  strip: RouletteEntry[]
  /**
   * Which row the window lands on.
   *
   * Not simply the last one: the strip carries a couple of rows PAST the
   * landed entry so the bottom slot still has something in it when the drum
   * stops. Without them the window's last row is empty and the whole thing
   * reads as a list that has been scrolled to its end rather than as a drum
   * that happens to have stopped here.
   */
  landedIndex: number
  /** Bumped to start a new spin. */
  spinKey: number
  /** No motion: the reel is placed on the result and never moves. */
  reduced: boolean
  onSettled: () => void
}

export function RouletteReel({ strip, landedIndex, spinKey, reduced, onSettled }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const frame = useRef<number | null>(null)
  const [resting, setResting] = useState(true)

  useEffect(() => {
    const track = trackRef.current
    if (!track || strip.length === 0) return

    const target = landedIndex * ROW_H

    if (reduced) {
      track.style.transform = `translate3d(0, ${-target}px, 0)`
      track.style.filter = 'none'
      setResting(true)
      onSettled()
      return
    }

    setResting(false)
    const from = Math.max(0, target - RUN_ROWS * ROW_H)
    const started = performance.now()
    let settledAt: number | null = null

    /** Quintic ease-out: fast off the mark, long tail. */
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 5)

    /** A damped bounce back onto the detent. */
    const settle = (t: number) => Math.cos(t * Math.PI * 1.5) * Math.pow(1 - t, 2.2)

    let last = from
    const tick = (now: number) => {
      let y: number
      if (settledAt === null) {
        const t = Math.min(1, (now - started) / SPIN_MS)
        y = from + (target + OVERSHOOT - from) * easeOut(t)
        if (t >= 1) settledAt = now
      } else {
        const t = Math.min(1, (now - settledAt) / SETTLE_MS)
        y = target + OVERSHOOT * settle(t)
        if (t >= 1) {
          track.style.transform = `translate3d(0, ${-target}px, 0)`
          track.style.filter = 'none'
          setResting(true)
          onSettled()
          return
        }
      }

      // Velocity in px/frame, turned into a smear. Capped so a fast start does
      // not dissolve the strip entirely.
      const v = Math.abs(y - last)
      last = y
      track.style.transform = `translate3d(0, ${-y}px, 0)`
      track.style.filter = v > 1.5 ? `blur(${Math.min(7, v * 0.22).toFixed(2)}px)` : 'none'

      frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)
    return () => { if (frame.current) cancelAnimationFrame(frame.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey, landedIndex, reduced])

  return (
    <div className="relative w-full" style={{ height: ROW_H * 3 }}>
      {/*
        The window. Masked top and bottom so rows fade out rather than being
        clipped by a hard edge — a hard edge makes the strip read as a list that
        is scrolling, and a fade makes it read as a drum turning behind a pane.
      */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          maskImage: 'linear-gradient(180deg, transparent 0%, #000 26%, #000 74%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 26%, #000 74%, transparent 100%)' }}
      >
        <div ref={trackRef} className="absolute inset-x-0" style={{ top: ROW_H, willChange: 'transform, filter' }}>
          {strip.map((e, i) => (
            <div
              key={`${e.variant.id}-${i}`}
              className="flex items-center gap-3 px-4"
              style={{ height: ROW_H }}
            >
              <ProductTile
                imageUrl={e.product.imageUrl}
                slot={e.product.stackSlots[0]}
                title={e.product.title}
                size={56}
              />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[13px] font-medium leading-tight truncate" style={{ color: 'var(--text)' }}>
                  {e.product.title}
                </p>
                <p className="text-sm font-medium leading-tight truncate mt-0.5" style={{ color: 'var(--accent)' }}>
                  {entryLabel(e)}
                </p>
              </div>
              <span className="text-sm font-medium tabular-nums flex-shrink-0" style={{ color: 'var(--text-dim)' }}>
                {formatGBP(e.variant.price)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/*
        The detent: the pane the drum turns behind. Two hairlines and a faint
        accent wash marking the row that counts, plus a sheen that sweeps across
        once at the moment of landing — the visual equivalent of the click.
      */}
      <div
        aria-hidden
        className={`absolute inset-x-2 pointer-events-none rounded-xl overflow-hidden ${resting ? 'roulette-landed' : ''}`}
        style={{
          top: ROW_H,
          height: ROW_H,
          border: '1px solid color-mix(in srgb, var(--accent) 34%, transparent)',
          background: 'color-mix(in srgb, var(--accent) 7%, transparent)',
          boxShadow: resting
            ? '0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent), 0 10px 34px -14px color-mix(in srgb, var(--accent) 60%, transparent)'
            : 'none',
          transition: 'box-shadow 260ms var(--ease-spring, ease-out)' }}
      />
    </div>
  )
}
