'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { validUntil } from '@/lib/store-codes/deadline'

/**
 * The advertised code, above the receipt — "LAUNCH25, 25% off your whole order".
 *
 * ── Revealed on arrival ──────────────────────────────────────────────────────
 * It sits sealed until it scrolls into view, then the foil wipes off and the
 * code decodes into place. The reveal is the point: somebody who has scrolled
 * past their whole stack to reach the price has earned something, and seeing it
 * arrive is what makes it read as a reward rather than a banner. Reduced motion
 * gets the open card straight away.
 *
 * ── The numbers are this basket's ───────────────────────────────────────────
 * "25% off" is a headline; "£97.56 → £77.97" is a decision. `before` and `after`
 * come from the same pricing the receipt uses, so the saving promised here is the
 * saving the receipt shows once it is applied — the code replaces the bundle
 * deal rather than stacking on it, and the margin floor still applies, so the
 * honest figure is rarely the headline percentage of the subtotal.
 *
 * ── A date, never a countdown ───────────────────────────────────────────────
 * A code with an end says the day it is valid until, and that is all: no clock,
 * no time left, no "limited-time". A founder can move a store code's end in the
 * hub, and today's code is followed by another 25% tomorrow, so neither end is
 * real and final — and a timer is only honest counting to one that is. The end
 * is still the moment checkout starts refusing the code (`liveCheckoutPromo`),
 * so when it passes with the page open the card says so, and an applied code is
 * taken off before the checkout can refuse it.
 */

export interface Promo {
  code: string
  /** Whole percent, e.g. 25. */
  percent: number
  endsAt: string | null
  /**
   * `daily`: today's code, replaced by a new one at midnight. What ends is the
   * CODE, so the card says when the code is valid until and never that the
   * discount ends — the 25% comes back tomorrow under another name.
   */
  kind?: 'daily' | 'store'
}

interface Props {
  promo: Promo
  /** What this basket costs now, and with the code — today's total, or the first month. */
  before: number
  after: number
  /** What the code comes off: a one-off order, or a subscription's first month. */
  scope: 'order' | 'first month'
  applied: boolean
  /** Resolves to the reason it did not apply, or null when it did. */
  onApply: () => Promise<string | null>
  onRemove: () => void
  /** The deadline passed while the page was open. */
  onEnded: () => void
}

const ACCENT = 'var(--color-accent)'
const POSITIVE = 'var(--tone-positive)'
const MONO = 'var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace'
/** Unambiguous at a glance: no 0/O or 1/I to mistake mid-scramble. */
const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** When each letter settles: a short hold, then left to right. */
const SETTLE_START = 220
const SETTLE_STEP = 75
/** The longest the card waits before looking at the clock again: a sleeping laptop's timers fall behind it. */
const RECHECK_MS = 60_000

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])
  return reduced
}

/** True once the card has been at least half on screen. Never goes back. */
function useRevealOnScroll(ref: React.RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, seen])
  return seen
}

/** The code as shown: sealed dots, a scramble settling letter by letter, then the code. */
function useDecode(code: string, revealed: boolean, reduced: boolean): { text: string; settled: boolean } {
  const [frame, setFrame] = useState<{ text: string; settled: boolean }>({
    text: '•'.repeat(code.length),
    settled: false,
  })
  useEffect(() => {
    if (!revealed) return
    if (reduced) {
      setFrame({ text: code, settled: true })
      return
    }
    const start = performance.now()
    const id = window.setInterval(() => {
      const t = performance.now() - start
      let text = ''
      let done = true
      for (let i = 0; i < code.length; i++) {
        if (t >= SETTLE_START + i * SETTLE_STEP || code[i] === '-') text += code[i]
        else {
          done = false
          text += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        }
      }
      setFrame({ text, settled: done })
      if (done) window.clearInterval(id)
    }, 45)
    return () => window.clearInterval(id)
  }, [code, revealed, reduced])
  return frame
}

/**
 * True once `endsAt` has passed. Nothing on the card counts down to it: this
 * only notices the moment, so the card can stop offering the code.
 */
function useEnded(endsAt: string | null): boolean {
  const end = endsAt ? new Date(endsAt).getTime() : NaN
  const [ended, setEnded] = useState(() => Date.now() >= end)
  useEffect(() => {
    if (!Number.isFinite(end)) return
    let id = 0
    const check = () => {
      const ms = end - Date.now()
      if (ms <= 0) setEnded(true)
      else id = window.setTimeout(check, Math.min(ms, RECHECK_MS))
    }
    check()
    return () => window.clearTimeout(id)
  }, [end])
  return ended
}

export function CheckoutPromo({ promo, before, after, scope, applied, onApply, onRemove, onEnded }: Props) {
  const ref = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const seen = useRevealOnScroll(ref)
  // Tabbing into the card reveals it too: the reveal is for the eye, and a
  // keyboard user reaching the Apply button should not land on an invisible one.
  const [focused, setFocused] = useState(false)
  const revealed = seen || applied || focused
  const { text, settled } = useDecode(promo.code, revealed, reduced)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
   * Applying or removing swaps the card's whole layout, so the button that was
   * pressed is gone by the time it has worked. Focus goes to the control that
   * undoes it, and a live region that outlives both layouts says what happened —
   * otherwise a keyboard or screen-reader user is dropped on <body> in silence.
   */
  const [announcement, setAnnouncement] = useState('')
  const applyRef = useRef<HTMLButtonElement>(null)
  const removeRef = useRef<HTMLButtonElement>(null)
  const focusNext = useRef<'apply' | 'remove' | null>(null)
  const prevApplied = useRef(applied)
  const endedRef = useRef(false)
  useEffect(() => {
    if (prevApplied.current === applied) return
    prevApplied.current = applied
    // Taken off because the deadline passed: the ended message says so already.
    if (endedRef.current) return
    setAnnouncement(
      applied
        ? `${promo.code} applied. ${scope === 'first month' ? 'Your first month is' : 'Your total is'} now ${formatGBP(after)}.`
        : `${promo.code} removed.`,
    )
    const target = focusNext.current === 'remove' ? removeRef.current : focusNext.current === 'apply' ? applyRef.current : null
    focusNext.current = null
    target?.focus()
  }, [applied, promo.code, scope, after])

  const ended = useEnded(promo.endsAt)

  // Told once, the moment it happens, so the page can take an applied code off.
  // Whether it was on is kept, because taking it off changes `applied`.
  const [wasApplied, setWasApplied] = useState(false)
  useEffect(() => {
    if (ended && !endedRef.current) {
      endedRef.current = true
      setWasApplied(applied)
      setAnnouncement(`${promo.code} has ended${applied ? ', so it’s been taken off your order' : ''}.`)
      onEnded()
    }
  }, [ended, applied, onEnded, promo.code])

  const saving = Math.round((before - after) * 100) / 100

  const live = (
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
  )

  if (ended) {
    return (
      <>
        {live}
        <p className="mb-3 flex items-center gap-2 text-[11px] leading-snug" style={{ color: 'var(--color-muted)' }}>
          <Icon name="clock" size={14} className="shrink-0" />
          {promo.code} has ended{wasApplied ? ', so it’s been taken off your order' : ''}.
        </p>
      </>
    )
  }

  async function apply() {
    if (applying) return
    setApplying(true)
    setError(null)
    // Set before the call: the page applies the code inside it, and the swap to
    // the applied layout can render before this function resumes.
    focusNext.current = 'remove'
    const reason = await onApply()
    setApplying(false)
    if (reason) {
      focusNext.current = null
      setError(reason)
    }
  }

  function remove() {
    focusNext.current = 'apply'
    onRemove()
  }

  /** "Launch offer" for a launch code; otherwise only what is true of any code. */
  const daily = promo.kind === 'daily'
  const eyebrow = daily ? 'Today’s code' : /launch/i.test(promo.code) ? 'Launch offer' : 'Offer'
  /** The day it is valid until, said the same wherever the card shows it. */
  const until = promo.endsAt
    ? `${daily ? 'This code is valid' : 'Valid'} until ${validUntil(promo.endsAt)}.`
    : null

  if (applied) {
    return (
      <>
      {live}
      <section
        ref={ref}
        aria-label={`${promo.code} offer`}
        className="mb-3 rounded-2xl px-4 py-3.5"
        style={{
          background: 'color-mix(in srgb, var(--tone-positive) 8%, var(--color-surface))',
          border: '1px solid color-mix(in srgb, var(--tone-positive) 28%, transparent)',
        }}
      >
        <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          <span style={{ color: POSITIVE }}><Icon name="check" size={16} /></span>
          {promo.code} applied
        </p>
        {/* The new total, not a saving. The receipt below already says "You
            save" against the subtotal, and a second, different "saving" here —
            against the bundle price — is two true numbers that read as one wrong one. */}
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-2)' }}>
          {promo.percent}% off — {scope === 'first month' ? 'your first month is' : 'your total is'} now{' '}
          <strong style={{ color: 'var(--color-text)' }}>{formatGBP(after)}</strong>.
        </p>
        {until && (
          <p className="text-[11px] leading-snug mt-2" style={{ color: 'var(--color-text-2)' }}>
            {until}
          </p>
        )}
        <button
          ref={removeRef}
          onClick={remove}
          className="text-[11px] font-semibold underline mt-2"
          style={{ color: 'var(--color-text-2)' }}
        >
          Remove code
        </button>
      </section>
      </>
    )
  }

  return (
    <>
    {live}
    <section
      ref={ref}
      onFocus={() => setFocused(true)}
      aria-label={`${promo.code}: ${promo.percent}% off`}
      data-revealed={revealed || undefined}
      className="promo-card relative mb-3 overflow-hidden rounded-2xl p-4"
      style={{
        background:
          'radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--color-accent) 16%, transparent) 0%, transparent 60%), var(--color-surface-2)',
        border: '1px solid color-mix(in srgb, var(--color-accent) 35%, var(--color-border))',
      }}
    >
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .promo-card { transition: box-shadow 600ms ease, transform 600ms cubic-bezier(.22,1,.36,1); }
          .promo-card[data-revealed] { box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 22%, transparent), 0 18px 40px -22px color-mix(in srgb, var(--color-accent) 60%, transparent); }
          .promo-foil { transition: clip-path 720ms cubic-bezier(.65,0,.35,1) 80ms; }
          .promo-on .promo-rise { animation: promo-rise 520ms cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0ms); }
        }
        @keyframes promo-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      `}</style>

      <div className="flex items-center">
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
        >
          <Icon name="bolt" size={13} />
          {eyebrow}
        </span>
      </div>

      {/* Wraps, so a long code (they can be 24 characters) pushes the headline
          under it on a narrow phone rather than off the edge. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-2">
        {/* The code, on a dashed coupon edge, under a foil that wipes away. */}
        <span
          className="relative inline-flex max-w-full items-center rounded-xl px-3.5 py-2.5"
          style={{
            border: '1.5px dashed color-mix(in srgb, var(--color-accent) 70%, transparent)',
            background: 'color-mix(in srgb, var(--color-accent) 7%, var(--color-bg))',
          }}
        >
          <span
            className="text-xl font-black tabular-nums break-all"
            style={{
              fontFamily: MONO,
              letterSpacing: '0.12em',
              color: settled ? 'var(--color-text)' : ACCENT,
              textShadow: settled ? '0 0 18px color-mix(in srgb, var(--color-accent) 45%, transparent)' : undefined,
            }}
            aria-hidden
          >
            {text}
          </span>
          <span className="sr-only">{promo.code}</span>
          <span
            aria-hidden
            className="promo-foil pointer-events-none absolute inset-0 rounded-xl"
            style={{
              background:
                'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-text) 16%, var(--color-surface-2)) 0 6px, color-mix(in srgb, var(--color-text) 9%, var(--color-surface-2)) 6px 12px)',
              clipPath: revealed ? 'inset(0 0 0 100%)' : 'inset(0 0 0 0)',
            }}
          />
        </span>
        <span className="min-w-0">
          <span className="block text-2xl font-black leading-none" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {promo.percent}% off
          </span>
          <span className="mt-1 block text-[11px]" style={{ color: 'var(--color-text-2)' }}>
            {scope === 'first month' ? 'your first month' : 'your whole order'}
          </span>
        </span>
      </div>

      {/* Laid out from the start and only shown on reveal, so the card does not
          grow under somebody's thumb and push the receipt down mid-scroll.
          Transparent rather than hidden, so the button stays in the tab order
          and the accessibility tree; taps wait for the reveal. */}
      <div
        style={{ opacity: revealed ? 1 : 0, pointerEvents: revealed ? undefined : 'none' }}
        className={revealed ? 'promo-on' : undefined}
      >
        {saving > 0.005 && (
          <p className="promo-rise mt-3.5 flex flex-wrap items-baseline gap-x-2 gap-y-1" style={{ ['--d' as string]: '520ms' }}>
            <span className="text-xs line-through tabular-nums" style={{ color: 'var(--color-text-2)' }}>{formatGBP(before)}</span>
            <span className="text-lg font-black tabular-nums leading-none" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              {formatGBP(after)}
            </span>
            <span className="text-xs font-semibold" style={{ color: POSITIVE }}>
              {formatGBP(saving)} less{scope === 'first month' ? ' on month one' : ''}
            </span>
          </p>
        )}

        <div className="promo-rise mt-3.5" style={{ ['--d' as string]: '640ms' }}>
          <Button ref={applyRef} variant="primary" size="md" fullWidth loading={applying} onClick={() => void apply()} iconRight="arrow-right">
            {applying ? 'Applying…' : `Apply ${promo.code} now`}
          </Button>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-[11px]" style={{ color: 'var(--color-red)' }}>{error}</p>
        )}

        {until && (
          <p className="promo-rise mt-2.5 text-center text-[11px] leading-snug" style={{ color: 'var(--color-text-2)', ['--d' as string]: '760ms' }}>
            {until}
          </p>
        )}
      </div>
    </section>
    </>
  )
}
