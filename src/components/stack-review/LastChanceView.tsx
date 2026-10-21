'use client'

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components/system'
import { Icon, type IconName } from '@/components/ui/Icon'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { packLengthLabel } from '@/lib/product-facts'
import type { OfferQuote } from '@/lib/last-chance/economics'
import { ProductTile } from './ProductTile'

/**
 * The last-chance offer, drawn — a deal on their top pick.
 *
 * Somebody has scrolled past their whole stack, the price, the giveaway and the
 * small print without buying. This is the smaller yes: the one product from it
 * that fits them best, on a deal worked out for it — free delivery first, then
 * a percentage off as far as the margin allows — one tap from paying for it.
 *
 * ── Why it reveals rather than waits behind a button ────────────────────────
 * A "tap to reveal" asks for a tap at the exact point attention is lowest, and
 * a tap spent revealing is a tap not spent buying. So the card arrives on its
 * own as it scrolls in: the ring charges, the product lifts into its light,
 * the deal assembles line by line — postage struck through, the percentage
 * off — and the delivered price drops to what they will pay. About a second
 * and a half, once; then it is still. Reduced motion gets the finished card.
 *
 * ── The deal, in plain words ────────────────────────────────────────────────
 * What delivery costs instead of what it would, the percentage off, and the
 * delivered price. Nothing about scarcity: no "one-time", no "only on this
 * page", no countdown and no "ends tonight".
 *
 * ── What it may say about the product (docs/ORDER_CONFIRMATION_SPEC.md §5) ──
 * That it is one of their picks — not which of their goals it is for, which
 * would be a claim; one register claim verbatim, or no "what it does" row at
 * all (OC-C-001/002); and facts — servings, price per serving, how long a pack
 * lasts. Never a timeframe for results (OC-C-003), never an outcome.
 *
 * Purely presentational — `LastChance` owns choosing, pricing and buying — so
 * `/styleguide/last-chance` can show every state without a quiz or a network.
 */

/** The figures the card draws, straight off the quote. */
export type LastChanceDeal = Pick<
  OfferQuote,
  | 'listPrice' | 'basePrice' | 'offerPrice' | 'discountPct' | 'saving'
  | 'standardDelivery' | 'deliveryCharge' | 'deliveryDeal' | 'deliverySaving'
  | 'normalTotal' | 'total' | 'totalSaving'
>

export interface LastChanceViewProps {
  title: string
  /** e.g. "Pre-workout" — what kind of thing it is (`productTypeLabel`). */
  role: string
  imageUrl: string | null
  slotType: string
  /** The line under its name — "One of the 4 products we picked for you." */
  goalLine: string
  /** One GB-register claim, verbatim — or null, and the row is not shown. */
  claim: string | null
  /** Servings in the pack, when known. */
  servings: number | null
  packMonths: number | null
  deal: LastChanceDeal
  /** What Highlands, Islands and Isle of Man addresses pay on top (£). 0 hides the line. */
  remoteSurcharge: number
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
const GOOD = 'var(--tone-positive)'
const MONO = 'var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace'
const DISPLAY = 'var(--font-display)'

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")"

// The arrival, in ms from the moment it scrolls in. Short on purpose: the
// whole deal is on screen and settled in about a second and a half.
const T = { row1: 640, strike1: 820, row2: 900, strike2: 1080, total: 1150, count: 650 }

function mono(size: number, color: string, tracking = 0.18): CSSProperties {
  return { fontFamily: MONO, fontSize: size, letterSpacing: `${tracking}em`, textTransform: 'uppercase', color, lineHeight: 1.3 }
}

const d = (ms: number) => ({ ['--d' as string]: `${ms}ms` }) as CSSProperties

/** The delivered price falling from what it would have cost to what it costs. */
function useCountDown(from: number, to: number, animated: boolean, go: boolean, delay: number, ms: number): number {
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
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const k = Math.min(1, (t - start) / ms)
      // Ease out: quick at first, settling onto the number.
      setValue(from + (to - from) * (1 - Math.pow(1 - k, 3)))
      if (k < 1) frame = requestAnimationFrame(tick)
    }
    const timer = window.setTimeout(() => (frame = requestAnimationFrame(tick)), delay)
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [from, to, animated, go, delay, ms, reduced])
  return value
}

function Fact({ icon, label, children, delay }: { icon: IconName; label: string; children: ReactNode; delay: number }) {
  return (
    <li className="lc-rise flex items-start gap-3" style={d(delay)}>
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

/** A figure that is no longer the price: struck through as the deal lands on it. */
function Was({ children, delay }: { children: ReactNode; delay: number }) {
  return (
    <span aria-hidden className="lc-strike relative inline-block tabular-nums" style={{ ...d(delay), color: INK_2, fontSize: 13 }}>
      {children}
    </span>
  )
}

/** One line of the deal: what it is on the left, before → after on the right. */
function DealLine({ icon, label, sub, was, now, srText, delay, strikeAt }: {
  icon: IconName
  label: string
  sub?: string
  was?: string | null
  now: string
  srText: string
  delay: number
  strikeAt: number
}) {
  return (
    <li className="lc-rise flex items-center gap-3" style={d(delay)}>
      <span aria-hidden className="flex shrink-0 items-center justify-center" style={{ width: 22, color: GOOD }}>
        <Icon name={icon} size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold" style={{ fontSize: 14, color: INK, lineHeight: 1.3 }}>{label}</span>
        {sub && <span className="block" style={{ fontSize: 12, color: INK_2, lineHeight: 1.35 }}>{sub}</span>}
      </span>
      <span className="flex shrink-0 items-baseline gap-2">
        {was && <Was delay={strikeAt}>{was}</Was>}
        <span aria-hidden className="lc-pop font-bold tabular-nums" style={{ ...d(strikeAt + 140), fontSize: 15, color: was ? GOOD : INK }}>
          {now}
        </span>
        <span className="sr-only">{srText}</span>
      </span>
    </li>
  )
}

export function LastChanceView(p: LastChanceViewProps) {
  const phase = p.phase ?? 'static'
  const { deal } = p
  const titleId = useId()
  // Counts from the undiscounted delivered price once it arrives; holds it while it waits.
  const total = useCountDown(deal.normalTotal, deal.total, phase !== 'static', phase === 'go', T.total, T.count)
  const busy = p.status === 'loading' || p.status === 'redirecting'

  const freeDelivery = deal.deliveryDeal === 'free' || deal.deliveryDeal === 'included'
  const pct = deal.discountPct > 0 ? deal.discountPct : 0
  // Short enough to sit over the product on a 360px phone; the delivery row
  // below gives both figures.
  const ribbon = freeDelivery
    ? 'Free delivery'
    : deal.deliveryDeal === 'reduced'
      ? `Delivery ${formatGBP(deal.deliveryCharge)}`
      : null

  // The ring's circumference, for the stroke that charges round it.
  const R = 92
  const C = 2 * Math.PI * R

  const deliveryLine = (() => {
    if (deal.deliveryDeal === 'included') {
      return { label: 'Free delivery', sub: 'UK mainland — always free at this price', was: null, now: 'Free', sr: 'Free delivery to the UK mainland.' }
    }
    if (deal.deliveryDeal === 'free') {
      return {
        label: 'Free delivery',
        sub: 'UK mainland, on us',
        was: formatGBP(deal.standardDelivery),
        now: 'Free',
        sr: `Free delivery to the UK mainland, instead of ${formatGBP(deal.standardDelivery)}.`,
      }
    }
    // The words say what it was, so the figure is not struck through as well.
    return {
      label: `Delivery ${formatGBP(deal.deliveryCharge)} instead of ${formatGBP(deal.standardDelivery)}`,
      sub: 'UK mainland',
      was: null,
      now: formatGBP(deal.deliveryCharge),
      sr: `Delivery to the UK mainland ${formatGBP(deal.deliveryCharge)}, instead of ${formatGBP(deal.standardDelivery)}.`,
    }
  })()

  return (
    <section
      ref={p.sectionRef}
      aria-labelledby={titleId}
      className={`lc relative mx-auto max-w-lg ${phase === 'go' ? 'lc-anim' : phase === 'wait' ? 'lc-wait' : ''}`}
      style={{ marginTop: 'var(--space-8, 3rem)' }}
    >
      <style>{`
        .lc-strike::after { content: ''; position: absolute; left: -2px; right: -2px; top: 52%; height: 1.5px;
          background: currentColor; transform-origin: left center; }
        @media (prefers-reduced-motion: no-preference) {
          /* Laid out but unseen until it scrolls in, so nothing shifts when it does. */
          .lc-wait .lc-rise, .lc-wait .lc-card, .lc-wait .lc-stamp, .lc-wait .lc-ribbon, .lc-wait .lc-pop { opacity: 0; }
          .lc-wait .lc-ring { stroke-dashoffset: ${C.toFixed(1)}; }
          .lc-wait .lc-strike::after { transform: scaleX(0); }
          .lc-anim .lc-rise { animation: lc-rise 560ms cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0ms); }
          .lc-anim .lc-card { animation: lc-card 760ms cubic-bezier(.22,1,.36,1) both; }
          .lc-anim .lc-ring { animation: lc-ring 1200ms cubic-bezier(.65,0,.35,1) 150ms both; }
          .lc-anim .lc-float { animation: lc-float 1000ms cubic-bezier(.22,1,.36,1) 120ms both; }
          .lc-anim .lc-beam { animation: lc-beam 1600ms cubic-bezier(.22,1,.36,1) both; }
          .lc-anim .lc-stamp { animation: lc-stamp 480ms cubic-bezier(.22,1,.36,1) 760ms both; }
          .lc-anim .lc-ribbon { animation: lc-ribbon 520ms cubic-bezier(.22,1,.36,1) 560ms both; }
          .lc-anim .lc-strike::after { animation: lc-strike 300ms ease-out both; animation-delay: var(--d, 0ms); }
          .lc-anim .lc-pop { animation: lc-pop 380ms cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0ms); }
        }
        @keyframes lc-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes lc-card { from { opacity: 0; transform: translateY(26px) scale(.97); } to { opacity: 1; transform: none; } }
        @keyframes lc-ring { from { stroke-dashoffset: ${C.toFixed(1)}; } to { stroke-dashoffset: ${(C * 0.08).toFixed(1)}; } }
        @keyframes lc-float { from { opacity: 0; transform: translateY(18px) rotate(-4deg) scale(.92); } to { opacity: 1; transform: none; } }
        @keyframes lc-beam { from { opacity: 0; transform: rotate(-120deg); } to { opacity: 1; transform: none; } }
        @keyframes lc-stamp { from { opacity: 0; transform: rotate(12deg) scale(1.6); } to { opacity: 1; transform: rotate(12deg) scale(1); } }
        @keyframes lc-ribbon { from { opacity: 0; transform: translate(-50%, 8px) scale(.9); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes lc-strike { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes lc-pop { from { opacity: 0; transform: scale(1.35); } to { opacity: 1; transform: none; } }
      `}</style>

      {/* ── The lead-in: one heading, its question set small above it ─────── */}
      <div className="lc-rise px-1 text-center" style={d(0)}>
        <h2 id={titleId} className="mx-auto" style={{ maxWidth: 360 }}>
          <span className="block" style={mono(11, INK_2, 0.22)}>Not ready for the whole stack?</span>{' '}
          <span
            className="mt-2 block"
            style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.02em', color: INK }}
          >
            Start with your top pick.
          </span>
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

        {/* Header row: what kind of product it is */}
        <div className="relative flex items-center justify-end">
          <span style={mono(10.5, INK_2, 0.16)}>{p.role}</span>
        </div>

        {/* Hero: the product in its light, the ring charging round it */}
        <div className="relative mx-auto mt-3 flex items-center justify-center" style={{ width: 220, height: 236 }}>
          <span
            aria-hidden
            className="lc-beam pointer-events-none absolute"
            style={{
              top: -40,
              left: -40,
              width: 300,
              height: 300,
              borderRadius: '50%',
              background:
                'conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, var(--color-accent) 18%, transparent) 40deg, transparent 90deg, transparent 180deg, color-mix(in srgb, var(--color-accent) 12%, transparent) 220deg, transparent 270deg)',
              filter: 'blur(14px)',
            }}
          />
          <svg aria-hidden className="absolute left-0 top-0" viewBox="0 0 220 220" width={220} height={220}>
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
              top: 168,
              width: 120,
              height: 18,
              borderRadius: '50%',
              background: 'radial-gradient(closest-side, color-mix(in srgb, var(--color-accent) 45%, transparent), transparent)',
              filter: 'blur(4px)',
            }}
          />
          <span className="lc-float absolute block" style={{ top: 44, width: 132, height: 132 }}>
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

          {pct > 0 && (
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
              <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20, lineHeight: 1 }}>−{pct}%</span>
              <span style={{ ...mono(10, 'currentColor', 0.14), marginTop: 2 }}>Off</span>
            </span>
          )}

          {/* Free delivery leads the deal, so it is said over the product itself. */}
          {ribbon && (
            <span
              aria-hidden
              className="lc-ribbon absolute inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5"
              style={{
                bottom: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--fill-accent, var(--color-accent))',
                boxShadow: '0 10px 24px -10px color-mix(in srgb, var(--color-accent) 80%, transparent)',
                ...mono(11.5, 'var(--ink-on-accent, var(--color-bg))', 0.14),
                fontWeight: 700,
              }}
            >
              <Icon name="truck" size={14} />
              {ribbon}
            </span>
          )}
        </div>

        {/* Name, and why it is theirs */}
        <div className="relative mt-4 text-center">
          <h3
            className="lc-rise"
            style={{ ...d(220), fontFamily: DISPLAY, fontSize: 24, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.02em', color: INK }}
          >
            {p.title}
          </h3>
          <p className="lc-rise mx-auto mt-2" style={{ ...d(300), fontSize: 14, lineHeight: 1.5, color: INK_2, maxWidth: 380 }}>
            {p.goalLine}
          </p>
        </div>

        {/* What it does — register wording or nothing — and what you get. */}
        {(p.claim || p.servings || p.packMonths !== null) && (
          <ul className="relative mt-5 grid gap-3.5">
            {p.claim && <Fact icon="bolt" label="What it does" delay={380}>{p.claim}.</Fact>}
            {(p.servings || p.packMonths !== null) && (
              <Fact icon="box" label="What you get" delay={460}>
                {[
                  p.servings ? `${p.servings} servings — ${formatGBP(Math.round((deal.offerPrice / p.servings) * 100) / 100)} each` : null,
                  p.packMonths !== null ? `lasts ${packLengthLabel(p.packMonths)} at your usage` : null,
                ].filter(Boolean).join(', ')}.
              </Fact>
            )}
          </ul>
        )}

        {/* The deal, assembling — then the one tap */}
        <div
          className="lc-rise relative mt-6 rounded-2xl p-4"
          style={{ ...d(560), background: 'color-mix(in srgb, var(--color-bg) 55%, transparent)', border: '1px solid var(--color-border)' }}
        >
          <div style={mono(10.5, INK_2, 0.18)}>Your deal</div>

          <ul className="mt-3 grid gap-3">
            <DealLine
              icon="truck"
              label={deliveryLine.label}
              sub={deliveryLine.sub}
              was={deliveryLine.was}
              now={deliveryLine.now}
              srText={deliveryLine.sr}
              delay={T.row1}
              strikeAt={T.strike1}
            />
            <DealLine
              icon={pct > 0 ? 'sparkle' : 'box'}
              label={pct > 0 ? `${pct}% off` : 'The product'}
              // Off what it would cost on its own — which, for a £50+ product,
              // already has the bundle deal in it. Said, so the struck-through
              // figure is never mistaken for a price the shop invented.
              sub={pct > 0 && deal.basePrice < deal.listPrice ? `Off the ${formatGBP(deal.basePrice)} it’d cost on its own` : undefined}
              was={pct > 0 ? formatGBP(deal.basePrice) : null}
              now={formatGBP(deal.offerPrice)}
              srText={pct > 0 ? `${pct}% off: ${formatGBP(deal.offerPrice)} instead of ${formatGBP(deal.basePrice)}.` : `${formatGBP(deal.offerPrice)}.`}
              delay={T.row2}
              strikeAt={T.strike2}
            />
          </ul>

          <div className="lc-rise mt-4 flex items-end justify-between gap-3 border-t pt-3.5" style={{ ...d(T.total - 100), borderColor: 'var(--color-border)' }}>
            {/* Read top to bottom: "£X delivered". */}
            <div className="min-w-0">
              <span
                aria-hidden
                className="block tabular-nums"
                style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', color: INK }}
              >
                {formatGBP(Math.round(total * 100) / 100)}
              </span>
              <span aria-hidden className="mt-1 block" style={mono(10.5, INK_2, 0.16)}>Delivered</span>
              <span className="sr-only">
                {deal.totalSaving > 0
                  ? `${formatGBP(deal.total)} delivered, down from ${formatGBP(deal.normalTotal)}`
                  : `${formatGBP(deal.total)} delivered`}
              </span>
            </div>
            {deal.totalSaving > 0 && (
              <span className="mb-1 flex shrink-0 flex-col items-end gap-1">
                <Was delay={T.total}>{formatGBP(deal.normalTotal)}</Was>
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-bold tabular-nums"
                  style={{ color: GOOD, background: 'color-mix(in srgb, var(--tone-positive) 14%, transparent)' }}
                >
                  You save {formatGBP(deal.totalSaving)}
                </span>
              </span>
            )}
          </div>

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
            {p.status === 'redirecting' ? 'Taking you to checkout…' : busy ? 'One moment…' : `Get it for ${formatGBP(deal.total)}`}
          </Button>

          {(p.status === 'error' || p.status === 'changed') && p.message && (
            <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-xs" style={{ color: p.status === 'error' ? 'var(--color-red)' : INK }}>
              <span className="mt-px shrink-0"><Icon name="alert-triangle" size={13} /></span>
              {p.message}
            </p>
          )}

          <p className="mt-3 text-center text-[11.5px] leading-snug" style={{ color: INK_2 }}>
            Just this product — no subscription. Pay on the next screen.
            {p.remoteSurcharge > 0 && (
              <>
                <br />
                Highlands, Islands &amp; Isle of Man add {formatGBP(p.remoteSurcharge)}.
              </>
            )}
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
