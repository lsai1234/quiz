'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A level, drawn as liquid.
 *
 * The house signature, and the reason this system reads as CHRGD rather than as
 * a competent dark theme. The quiz already does this — `LiquidRail`, `ChargeRail`
 * and `ChargeScale` all treat progress as something being poured or charged
 * rather than as a rectangle being filled — and the hubs currently express the
 * same idea as a grey bar. Anywhere a hub shows a proportion (a stack's
 * completeness, a payout threshold, stock cover, a partner's progress towards a
 * tier) this is the shape it should take.
 *
 * Three things separate it from a progress bar:
 *
 * 1. **A meniscus.** The leading edge is a drifting wave, not a straight cut.
 *    It is the single detail that reads as liquid.
 * 2. **A travelling highlight** inside the fill — charge moving through it.
 * 3. **A bloom** the colour of the fill, so the level emits light rather than
 *    just being coloured.
 *
 * The number rolls to its new value rather than snapping, because a figure that
 * jumps is a figure you have to re-read.
 *
 * Reduced motion stops the wave, the highlight and the roll; the fill still
 * animates its height, since that is the information rather than decoration.
 */

type Tone = 'accent' | 'positive' | 'attention' | 'critical' | 'info'
type Size = 'sm' | 'md'

export interface ChargeMeterProps {
  /** 0–100. Clamped. */
  value: number
  /** What is being measured. Required — it is the control's accessible name. */
  label: string
  /** Show the label and percentage above the track. */
  showValue?: boolean
  tone?: Tone
  size?: Size
  /** Replaces the percentage readout with your own text — "£240 of £500". */
  valueText?: string
  className?: string
}

const TONE_FILL: Record<Tone, string> = {
  accent: 'var(--fill-accent)',
  positive: 'var(--fill-positive)',
  attention: 'var(--fill-attention)',
  critical: 'var(--fill-critical)',
  info: 'var(--fill-info)',
}

const TONE_GLOW: Record<Tone, string> = {
  accent: 'var(--accent-glow)',
  positive: 'var(--positive-glow)',
  attention: 'var(--attention-glow)',
  critical: 'var(--critical-glow)',
  info: 'var(--info-glow)',
}

const TONE_INK: Record<Tone, string> = {
  accent: 'var(--accent)',
  positive: 'var(--tone-positive)',
  attention: 'var(--tone-attention)',
  critical: 'var(--tone-critical)',
  info: 'var(--tone-info)',
}

const HEIGHT: Record<Size, string> = { sm: 'var(--space-2)', md: 'var(--space-3)' }

/** Counts to the target over one settle, so a changed figure reads as a change. */
function useRollingNumber(target: number, instant: boolean): number {
  const [shown, setShown] = useState(target)
  const from = useRef(target)

  useEffect(() => {
    if (instant) {
      from.current = target
      setShown(target)
      return
    }
    const start = from.current
    if (start === target) return

    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / 640)
      // Cubic ease-out: fast off the mark, settles rather than stops.
      const eased = 1 - (1 - t) ** 3
      const v = Math.round(start + (target - start) * eased)
      from.current = v
      setShown(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, instant])

  return shown
}

export function ChargeMeter({
  value,
  label,
  showValue = true,
  tone = 'accent',
  size = 'md',
  valueText,
  className,
}: ChargeMeterProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  // Matches `useReducedMotion` without importing it, so the meter can render on
  // the server. The hook's first pass is always `false`; this is the same.
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const shown = useRollingNumber(pct, reduced)

  return (
    <div className={className}>
      {showValue && (
        <div
          className="flex items-baseline justify-between"
          style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}
        >
          <span
            style={{
              fontSize: 'var(--text-micro)',
              fontWeight: 'var(--weight-strong)',
              fontFamily: 'var(--font-display)',
              letterSpacing: 'var(--tracking-eyebrow)',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontSize: 'var(--text-body)',
              fontWeight: 'var(--weight-display)',
              fontFamily: 'var(--font-display)',
              letterSpacing: 'var(--tracking-title)',
              color: TONE_INK[tone],
              // Tabular figures, so a rolling number does not jitter its own
              // width on the way up.
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {valueText ?? `${shown}%`}
          </span>
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="relative w-full overflow-hidden"
        style={{
          height: HEIGHT[size],
          borderRadius: 'var(--radius-pill)',
          background: 'var(--surface-input)',
          boxShadow: 'var(--inset-well)',
        }}
      >
        <div
          className="system-charge-fill absolute inset-y-0 left-0 overflow-hidden"
          style={{
            width: `${pct}%`,
            borderRadius: 'var(--radius-pill)',
            background: TONE_FILL[tone],
            ['--tone-glow' as string]: TONE_GLOW[tone],
            transition: 'width var(--duration-slow) var(--ease-settle)',
          }}
        >
          {/* Charge travelling through the fill. */}
          <span
            aria-hidden
            className="system-charge-flow absolute inset-y-0"
            style={{ width: '40%' }}
          />
        </div>

        {/* The meniscus. Double-width with a periodic path, so half a period of
            travel loops seamlessly and the surface never visibly jumps. */}
        {pct > 0 && pct < 100 && (
          <span
            aria-hidden
            className="system-meniscus absolute inset-y-0"
            style={{
              left: `${pct}%`,
              width: 'var(--space-6)',
              marginLeft: 'calc(var(--space-3) * -1)',
              background: `radial-gradient(closest-side, ${TONE_GLOW[tone]}, transparent)`,
            }}
          />
        )}
      </div>
    </div>
  )
}
