'use client'

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components/system'
import { Icon, type IconName } from '@/components/ui/Icon'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { ProductTile } from './ProductTile'

/**
 * The last-chance offer, drawn — "The one".
 *
 * Somebody has scrolled past their whole stack, the price, the giveaway and the
 * small print without buying. This is the smaller yes: the single product that
 * will do the most for them, at a price the business can afford, one tap from
 * paying for it.
 *
 * ── Why it reveals rather than waits behind a button ────────────────────────
 * A "tap to reveal" asks for a tap at the exact point attention is lowest, and
 * a tap spent revealing is a tap not spent buying. So the card arrives on its
 * own as it scrolls in — the ring charges, the product lifts into its light,
 * the price drops from list to offer — and the one tap left is the one that
 * buys. Reduced motion gets the finished card.
 *
 * ── What it may say (docs/ORDER_CONFIRMATION_SPEC.md §5) ─────────────────────
 * Why it is theirs, in terms of the goal they gave us (OC-C-004); one register
 * claim verbatim, or no "what it does" row at all (OC-C-001/002); and facts —
 * servings, price per serving, how long a pack lasts. Never a timeframe for
 * results (OC-C-003), never a percentage of "match", never an outcome.
 *
 * Purely presentational — `LastChance` owns choosing, pricing and buying — so
 * `/styleguide/last-chance` can show every state without a quiz or a network.
 */

export interface LastChanceViewProps {
  title: string
  /** e.g. "Pre-workout" — what kind of thing it is. */
  role: string
  imageUrl: string | null
  slotType: string
  /** Why it is theirs, from the goals they gave us. */
  goalLine: string
  /** One GB-register claim, verbatim — or null, and the row is not shown. */
  claim: string | null
  /** Servings in the pack, when known. */
  servings: number | null
  packMonths: number | null
  listPrice: number
  offerPrice: number
  discountPct: number
  saving: number
  deliveryCharge: number
  total: number
  status: 'idle' | 'loading' | 'redirecting' | 'error' | 'changed'
  message?: string | null
  /** The stack's own checkout is under way — one checkout at a time. */
  blocked?: boolean
  /**
   * `wait` — laid out but not yet shown, until it scrolls into view;
   * `go` — arriving; `static` — the finished card with no motion (the lab).
   * Reduced motion skips straight to the finished card whatever this says.
   */
  phase?: 'wait' | 'go' | 'static'
  /** The section, so the container can watch for it scrolling into view. */
  sectionRef?: (el: HTMLElement | null) => void
  onBuy: () => void
  onBackToStack: () => void
  /** Handed the buy button as it mounts, so the page can retire its sticky bar. */
  onCtaRef?: (el: HTMLButtonElement | null) => void
}

const ACCENT = 'var(--color-accent)'
const INK = 'var(--color-text)'
const INK_2 = 'var(--color-text-2)'
const MONO = 'var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace'
const DISPLAY = 'var(--font-display)'

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")"

function mono(size: number, color: string, tracking = 0.18): CSSProperties {
  return { fontFamily: MONO, fontSize: size, letterSpacing: `${tracking}em`, textTransform: 'uppercase', color, lineHeight: 1.3 }
}

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** "about two months" — how a person would say a pack's length. */
function packLabel(months: number): string {
  if (months < 0.8) return `about ${Math.max(1, Math.round(months * 4.3))} weeks`
  if (months < 1.25) return 'about a month'
  if (months < 1.75) return 'about six weeks'
  const whole = Math.round(months)
  const word = ['', '', 'two', 'three', 'four', 'five', 'six'][whole] ?? String(whole)
  return `about ${word} months`
}

/** The price falling from list to offer as the card arrives. */
function useCountDown(from: number, to: number, animated: boolean, go: boolean, ms = 900): number {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(animated ? from : to)
  useEffect(() => {
    if (!animated || reduced || from === to) {
      setValue(to)
      return
    }
    if (!go) {
      setValue(from)
      return
    }
    let frame = 0
    const start = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms)
      // Ease out: quick at first, settling onto the number.
      const eased = 1 - Math.pow(1 - k, 3)
      setValue(from + (to - from) * eased)
      if (k < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [from, to, animated, go, ms, reduced])
  return value
}

function Impact({ icon, label, children, delay }: { icon: IconName; label: string; children: ReactNode; delay: number }) {
  return (
    <li className="lc-rise flex items-start gap-3" style={{ ['--d' as string]: `${delay}ms` }}>
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-xl"
        style={{
          width: 34,
          height: 34,
          color: ACCENT,
          background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 22%, transparent)',
        }}
      >
        <Icon name={icon} size={17} />
      </span>
      <span className="min-w-0">
        <span className="block" style={mono(10.5, INK_2, 0.16)}>{label}</span>
        <span className="mt-0.5 block" style={{ fontSize: 14, lineHeight: 1.4, color: INK }}>{children}</span>
      </span>
    </li>
  )
}

export function LastChanceView(p: LastChanceViewProps) {
  const phase = p.phase ?? 'static'
  // Counts from the list price once it arrives; holds the list price while it waits.
  const price = useCountDown(p.listPrice, p.offerPrice, phase !== 'static', phase === 'go')
  const discounted = p.discountPct > 0 && p.saving > 0
  const busy = p.status === 'loading' || p.status === 'redirecting'
  const titleId = useId()

  // The ring's circumference, for the stroke that charges round it.
  const R = 92
  const C = 2 * Math.PI * R

  return (
    <section
      ref={p.sectionRef}
      aria-labelledby={titleId}
      className={`lc relative mx-auto max-w-lg ${phase === 'go' ? 'lc-anim' : phase === 'wait' ? 'lc-wait' : ''}`}
      style={{ marginTop: 'var(--space-8, 3rem)' }}
    >
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          /* Laid out but unseen until it scrolls in, so nothing shifts when it does. */
          .lc-wait .lc-rise, .lc-wait .lc-card, .lc-wait .lc-stamp { opacity: 0; }
          .lc-wait .lc-ring { stroke-dashoffset: ${C.toFixed(1)}; }
          .lc-anim .lc-rise { animation: lc-rise 640ms cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0ms); }
          .lc-anim .lc-card { animation: lc-card 820ms cubic-bezier(.22,1,.36,1) both; }
          .lc-anim .lc-ring { animation: lc-ring 1300ms cubic-bezier(.65,0,.35,1) 200ms both; }
          .lc-anim .lc-float { animation: lc-float 1100ms cubic-bezier(.22,1,.36,1) 150ms both; }
          .lc-anim .lc-beam { animation: lc-beam 1800ms cubic-bezier(.22,1,.36,1) both; }
          .lc-anim .lc-stamp { animation: lc-stamp 520ms cubic-bezier(.22,1,.36,1) 900ms both; }
        }
        @keyframes lc-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes lc-card { from { opacity: 0; transform: translateY(26px) scale(.97); } to { opacity: 1; transform: none; } }
        @keyframes lc-ring { from { stroke-dashoffset: ${C.toFixed(1)}; } to { stroke-dashoffset: ${(C * 0.08).toFixed(1)}; } }
        @keyframes lc-float { from { opacity: 0; transform: translateY(18px) rotate(-4deg) scale(.92); } to { opacity: 1; transform: none; } }
        @keyframes lc-beam { from { opacity: 0; transform: rotate(-120deg); } to { opacity: 1; transform: none; } }
        @keyframes lc-stamp { from { opacity: 0; transform: rotate(12deg) scale(1.6); } to { opacity: 1; transform: rotate(12deg) scale(1); } }
      `}</style>

      {/* ── The lead-in: a beat of copy that reframes the scroll ─────────── */}
      <div className="lc-rise px-1 text-center" style={{ ['--d' as string]: '0ms' }}>
        <p style={mono(11, INK_2, 0.22)}>Not ready for the whole stack?</p>
        <h2
          id={titleId}
          className="mx-auto mt-2"
          style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.02em', color: INK, maxWidth: 360 }}
        >
          If you only get one thing, make it this.
        </h2>
      </div>

      {/* ── The card ─────────────────────────────────────────────────────── */}
      <div
        className="lc-card relative mt-6 overflow-hidden"
        style={{
          borderRadius: 'var(--radius-sheet)',
          padding: 'var(--space-5)',
          background:
            'radial-gradient(90% 55% at 50% 0%, color-mix(in srgb, var(--color-accent) 12%, transparent) 0%, transparent 70%), linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 6%, var(--color-surface-2)) 0%, var(--color-surface-2) 55%)',
          border: '1px solid color-mix(in srgb, var(--color-accent) 30%, var(--color-border))',
          boxShadow: '0 30px 60px -30px color-mix(in srgb, var(--color-accent) 55%, transparent), inset 0 1px 0 color-mix(in srgb, white 10%, transparent)',
        }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: GRAIN, opacity: 0.06, mixBlendMode: 'overlay' }} />

        {/* Header row */}
        <div className="relative flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5" style={mono(11, ACCENT, 0.22)}>
            <Icon name="bolt" size={13} />
            Your top pick
          </span>
          <span style={mono(10.5, INK_2, 0.16)}>{p.role}</span>
        </div>

        {/* Hero: the product in its light, the ring charging round it */}
        <div className="relative mx-auto mt-3 flex items-center justify-center" style={{ width: 220, height: 220 }}>
          <span
            aria-hidden
            className="lc-beam pointer-events-none absolute"
            style={{
              inset: -40,
              borderRadius: '50%',
              background:
                'conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, var(--color-accent) 18%, transparent) 40deg, transparent 90deg, transparent 180deg, color-mix(in srgb, var(--color-accent) 12%, transparent) 220deg, transparent 270deg)',
              filter: 'blur(14px)',
            }}
          />
          <svg aria-hidden className="absolute inset-0" viewBox="0 0 220 220" width={220} height={220}>
            <circle cx="110" cy="110" r={R} fill="none" stroke="color-mix(in srgb, var(--color-text) 10%, transparent)" strokeWidth="2" />
            <circle
              className="lc-ring"
              cx="110"
              cy="110"
              r={R}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={C.toFixed(1)}
              strokeDashoffset={(C * 0.08).toFixed(1)}
              transform="rotate(-90 110 110)"
              style={{ filter: 'drop-shadow(0 0 6px var(--color-accent))' }}
            />
          </svg>
          <span
            aria-hidden
            className="absolute"
            style={{
              bottom: 26,
              width: 120,
              height: 18,
              borderRadius: '50%',
              background: 'radial-gradient(closest-side, color-mix(in srgb, var(--color-accent) 45%, transparent), transparent)',
              filter: 'blur(4px)',
            }}
          />
          <span className="lc-float relative block" style={{ width: 132, height: 132 }}>
            <ProductTile
              imageUrl={p.imageUrl}
              slot={p.slotType}
              title={p.title}
              size={264}
              fill
              inset
              style={{ borderRadius: 26, boxShadow: '0 18px 40px -16px black' }}
            />
          </span>

          {discounted && (
            <span
              aria-hidden
              className="lc-stamp absolute flex flex-col items-center justify-center"
              style={{
                top: 6,
                right: 0,
                width: 66,
                height: 66,
                borderRadius: '50%',
                background: 'var(--fill-accent, var(--color-accent))',
                color: 'var(--ink-on-accent, var(--color-bg))',
                boxShadow: '0 10px 24px -8px color-mix(in srgb, var(--color-accent) 80%, transparent)',
                transform: 'rotate(12deg)',
              }}
            >
              <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20, lineHeight: 1 }}>−{p.discountPct}%</span>
              <span style={{ ...mono(10, 'currentColor', 0.14), marginTop: 2 }}>Off</span>
            </span>
          )}
        </div>

        {/* Name, and why it is theirs */}
        <div className="relative text-center">
          <h3
            className="lc-rise"
            style={{ ['--d' as string]: '260ms', fontFamily: DISPLAY, fontSize: 24, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.02em', color: INK }}
          >
            {p.title}
          </h3>
          <p
            className="lc-rise mx-auto mt-2"
            style={{ ['--d' as string]: '340ms', fontSize: 14, lineHeight: 1.5, color: INK_2, maxWidth: 380 }}
          >
            {p.goalLine}
          </p>
        </div>

        {/* What it does — register wording or nothing — and what you get. */}
        <ul className="relative mt-5 grid gap-3.5">
          {p.claim && (
            <Impact icon="bolt" label="What it does" delay={420}>{p.claim}.</Impact>
          )}
          {(p.servings || p.packMonths !== null) && (
            <Impact icon="box" label="What you get" delay={500}>
              {[
                p.servings ? `${p.servings} servings — ${formatGBP(Math.round((p.offerPrice / p.servings) * 100) / 100)} each` : null,
                p.packMonths !== null ? `lasts ${packLabel(p.packMonths)} at your usage` : null,
              ].filter(Boolean).join(', ')}.
            </Impact>
          )}
        </ul>

        {/* Price, and the one tap */}
        <div
          className="lc-rise relative mt-6 rounded-2xl p-4"
          style={{
            ['--d' as string]: '660ms',
            background: 'color-mix(in srgb, var(--color-bg) 55%, transparent)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              {discounted && (
                <span className="block text-sm line-through tabular-nums" style={{ color: INK_2 }}>{formatGBP(p.listPrice)}</span>
              )}
              <span
                aria-hidden
                className="block tabular-nums"
                style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', color: INK }}
              >
                {formatGBP(Math.round(price * 100) / 100)}
              </span>
              <span className="sr-only">
                {discounted ? `${formatGBP(p.offerPrice)}, down from ${formatGBP(p.listPrice)}` : formatGBP(p.offerPrice)}
              </span>
            </div>
            {discounted && (
              <span
                className="mb-1 shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums"
                style={{ color: 'var(--tone-positive)', background: 'color-mix(in srgb, var(--tone-positive) 14%, transparent)' }}
              >
                You save {formatGBP(p.saving)}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs" style={{ color: INK_2 }}>
            {p.deliveryCharge > 0 ? `+ ${formatGBP(p.deliveryCharge)} delivery · ${formatGBP(p.total)} in total` : 'Free delivery'}
          </p>

          <Button
            ref={p.onCtaRef}
            className="mt-4"
            variant="primary"
            size="lg"
            fullWidth
            loading={busy}
            disabled={p.blocked}
            iconRight={busy ? undefined : 'arrow-right'}
            onClick={p.onBuy}
          >
            {p.status === 'redirecting' ? 'Taking you to checkout…' : busy ? 'One moment…' : `Get it for ${formatGBP(p.offerPrice)}`}
          </Button>

          {(p.status === 'error' || p.status === 'changed') && p.message && (
            <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-xs" style={{ color: p.status === 'error' ? 'var(--color-red)' : INK }}>
              <span className="mt-px shrink-0"><Icon name="alert-triangle" size={13} /></span>
              {p.message}
            </p>
          )}

          <p className="mt-3 text-center text-[11.5px]" style={{ color: INK_2 }}>
            Just this, once — no subscription. Pay on the next screen.
          </p>
        </div>

        <button
          type="button"
          onClick={p.onBackToStack}
          className="system-focus relative mx-auto mt-4 flex items-center gap-1 rounded-lg px-2 text-xs font-semibold underline underline-offset-4"
          style={{ color: INK_2, minHeight: 44 }}
        >
          <Icon name="chevron-up" size={14} />
          Or get your full stack
        </button>
      </div>
    </section>
  )
}
