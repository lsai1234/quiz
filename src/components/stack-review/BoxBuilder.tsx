'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { shortNameOf } from '@/lib/catalogue/short-name'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import { BOX_COPY } from '@/lib/offer/box-copy'
import { FREE_GIFT_TERMS_PATH, OFFER_COPY } from '@/lib/offer/copy'
import type { Ladder } from '@/lib/offer/ladder'
import { PLAN_COPY, whyPricesDiffer } from '@/lib/offer/plan-copy'
import { formatGBP, type PlanComparison } from '@/lib/stack-blueprint/pricing'
import type { PlanType } from '@/lib/store'
import { ProductTile } from './ProductTile'
import { YourDay } from './YourDay'
import { BoxServices } from './BoxServices'
import { HubPreview, MEMBER_HUB_TERMS_PATH, type HubPreviewInput } from './HubPreview'
import { DEALS_COPY, HUB_PREVIEW_COPY } from '@/lib/deals/copy'
import type { ChargeView } from '@/lib/offer/levels'
import type { Routine } from '@/lib/routine'
import { YOU_PALETTE as P } from './you-palette'

/**
 * Your box (the clarity pass, part 2): the whole offer as one selection.
 *
 * Every product Amp recommends, each with a switch and a reason from their
 * own answers; the plan (once or monthly); what the box has unlocked and the
 * next line, with products to add in one tap; one button with the price they
 * pay. Every change shows at once in the button, the count and the rewards,
 * so nobody has to scroll to a receipt to see what they did.
 *
 * Essentials / Standard / Complete are gone: the box is whatever is switched
 * on. The single product ("Just want one?") is a quiet line under the button.
 */

export interface BoxRow {
  id: string
  product: CatalogueProduct
  /** Why it's here: a claims-aware reason, or their own answer; null for none. */
  reason: string | null
  on: boolean
  price: number
}

const DISPLAY = 'var(--font-display)'
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

export function BoxBuilder({
  rows,
  onToggle,
  onOpen,
  isSub,
  canSubscribe,
  onPlanChange,
  monthlyPct,
  comparison,
  oneOff,
  monthly,
  ladder,
  charge = null,
  hub = null,
  addOns,
  onAdd,
  giftConditions,
  core,
  onCheckout,
  busy,
  messages = [],
  onCtaRef,
  delivery = null,
  monthlyMin = null,
  routine = null,
}: {
  rows: readonly BoxRow[]
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  isSub: boolean
  canSubscribe: boolean
  onPlanChange: (plan: PlanType) => void
  monthlyPct: number
  comparison: PlanComparison | null
  oneOff: number
  monthly: number
  ladder: Ladder
  /** What the box comes with, and its charge level (Option 1). */
  charge?: ChargeView | null
  addOns: readonly CatalogueProduct[]
  onAdd: (product: CatalogueProduct) => void
  giftConditions: string | null
  core: { title: string; total: number; onStart: () => void; disabled: boolean; message: string | null } | null
  onCheckout: () => void
  busy: boolean
  /** What the checkout said when it stopped, shown under the button. */
  messages?: readonly string[]
  /** The button, so the sticky bar can step aside while it is on screen. */
  onCtaRef?: (el: HTMLButtonElement | null) => void
  /** Delivery on top of the button's price (£, 0 for free); null to say nothing (a free order). */
  delivery?: number | null
  /** Monthly is off only because the box is under the subscription minimum: that minimum, and the box's month now. */
  monthlyMin?: { min: number; now: number } | null
  /** The products switched on, on their day (Option 3). */
  routine?: Routine | null
  /** What the hub preview needs (`HubPreview`); null for none. */
  hub?: HubPreviewInput | null
}) {
  const headingId = useId()
  const planId = useId()
  const [why, setWhy] = useState(false)
  const onCount = rows.filter((r) => r.on).length
  const { next } = ladder

  return (
    <section aria-labelledby={headingId} data-box className="relative mt-6 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
      {/* On a phone one column, in reading order (each part's `order`); on a wide screen the
          box and what comes with it on the left, and the plan, the rewards and
          the button on the right, staying in view. */}
      <div className="contents lg:block">
        <div style={{ order: 1 }}>
          <div className="flex items-end justify-between gap-3">
            <h3 id={headingId} className="text-[26px] font-black leading-none tracking-tight" style={{ color: P.ink, fontFamily: DISPLAY }}>
              {BOX_COPY.heading}
            </h3>
            <span
              aria-live="polite"
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold"
              style={{ background: P.page, color: P.ink2, fontFamily: DISPLAY, border: `1px solid ${P.hairline}` }}
              data-box-count
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: onCount > 0 ? P.accent : P.ink3, boxShadow: onCount > 0 ? '0 0 6px rgba(0,212,255,0.8)' : 'none' }}
              />
              {BOX_COPY.countOn(onCount, rows.length)}
            </span>
          </div>
          <p className="mt-1.5 text-[14px] leading-snug" style={{ color: P.ink2 }}>
            {BOX_COPY.sub}
          </p>

          {/* The products: tap for details, switch to take out or put back. */}
          <ul className="mt-4 space-y-2.5" aria-label={BOX_COPY.heading}>
            {rows.map((r) => (
              <li
                key={r.id}
                data-box-row={r.product.id}
                data-on={r.on}
                className="flex items-center gap-3 rounded-[20px] p-3"
                style={{
                  background: r.on ? P.card : P.page,
                  boxShadow: r.on ? '0 0 0 1.5px rgba(0,212,255,0.6), 0 14px 28px -20px rgba(0,140,180,0.7)' : `inset 0 0 0 1px ${P.hairline}`,
                  transition: `background-color 0.25s ${EASE}, box-shadow 0.25s ${EASE}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-label={`${r.product.title}: ${BOX_COPY.details}`}
                  style={{ opacity: r.on ? 1 : 0.6, filter: r.on ? 'none' : 'grayscale(0.6)', transition: `opacity 0.25s ${EASE}, filter 0.25s ${EASE}` }}
                >
                  <ProductTile imageUrl={r.product.imageUrl} formats={r.product.formats} title={r.product.title} size={r.on ? 56 : 44} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15.5px] font-semibold leading-snug tracking-[-0.01em]" style={{ color: P.ink, fontFamily: DISPLAY }}>
                      {shortNameOf(r.product)}
                    </span>
                    {r.reason && (r.on || r.reason !== BOX_COPY.picked) && (
                      <span className="mt-0.5 block text-[13px] leading-snug" style={{ color: P.ink2 }}>
                        {r.reason}
                      </span>
                    )}
                    <span className="mt-1 block text-[12px]" style={{ color: P.ink3 }}>
                      {productTypeLabel(r.product)} ·{' '}
                      <span className="font-bold tabular-nums" style={{ color: P.ink }}>
                        {formatGBP(r.price)}
                      </span>
                    </span>
                  </span>
                </button>
                <Switch on={r.on} label={BOX_COPY.switchLabel(r.product.title)} onToggle={() => onToggle(r.id)} />
              </li>
            ))}
          </ul>
        </div>
        <div style={{ order: 2 }}>
          {/* Their day: what's switched on, and when to take it. */}
          {routine && onCount > 0 && <YourDay routine={routine} />}
        </div>
        <div style={{ order: 4 }}>
          {/* What the box comes with: services, and the level that unlocks more. */}
          {charge && onCount > 0 && <BoxServices view={charge} />}
        </div>
        <div style={{ order: 5 }}>
          {/* The hub the order opens, shown: a first training week and member prices. */}
          {hub && onCount > 0 && <HubPreview input={hub} />}
        </div>
      </div>

      <div className="contents lg:sticky lg:top-24 lg:block">
        <div style={{ order: 3 }}>
          {/* Once or monthly: every price on the card follows it. */}
          <p id={planId} className="mt-6 text-[11px] lg:mt-0 font-bold uppercase tracking-[0.14em]" style={{ color: P.ink3, fontFamily: DISPLAY }}>
            {PLAN_COPY.heading}
          </p>
          <div
            role="radiogroup"
            aria-labelledby={planId}
            className="mt-2 grid grid-cols-2 gap-1 rounded-[20px] p-1"
            style={{ background: P.page, border: `1px solid ${P.hairline}` }}
          >
            <PlanOption on={!isSub} label={PLAN_COPY.once} sub={formatGBP(oneOff)} onClick={() => onPlanChange('oneoff')} />
            <PlanOption
              on={isSub}
              label={PLAN_COPY.monthly}
              sub={canSubscribe ? `${formatGBP(monthly)} ${PLAN_COPY.aMonth}` : monthlyMin ? BOX_COPY.monthlyFrom(monthlyMin.min) : PLAN_COPY.onceOnly}
              badge={canSubscribe && monthlyPct > 0 ? BOX_COPY.monthlyBadge(monthlyPct) : null}
              disabled={!canSubscribe}
              onClick={() => onPlanChange('subscription')}
            />
          </div>
          <p className="mt-2 text-[13px] leading-snug" style={{ color: P.ink2 }}>
            {isSub ? PLAN_COPY.monthlyLine(monthlyPct) : PLAN_COPY.onceLine}
          </p>
          {!canSubscribe && monthlyMin && onCount > 0 && (
            <p className="mt-1 text-[13px] leading-snug" style={{ color: P.ink2 }} data-monthly-min>
              {BOX_COPY.monthlyMin(monthlyMin.min, monthlyMin.now)}
            </p>
          )}
          {canSubscribe && comparison && (
            <>
              <button
                type="button"
                aria-expanded={why}
                onClick={() => setWhy((w) => !w)}
                className="mt-1 text-[13px] font-semibold underline underline-offset-2"
                style={{ color: P.ink }}
              >
                {PLAN_COPY.why}
              </button>
              {why && (
                <div className="mt-2 space-y-1.5 rounded-xl px-3.5 py-3" style={{ background: P.page }} data-plan-why>
                  {whyPricesDiffer(comparison, monthlyPct).map((line) => (
                    <p key={line} className="text-[12.5px] leading-relaxed" style={{ color: P.ink2 }}>
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ order: 6 }}>
          {/* What the box has unlocked, the next line, and products to add to reach it. */}
          {ladder.rungs.length > 0 && (
            <div className="mt-5 rounded-[22px] px-4 py-4" style={{ background: P.page, border: `1px solid ${P.hairline}` }} data-ladder={next ? next.kind : 'all'}>
              <p className="text-[15px] font-bold leading-snug" style={{ color: P.ink, fontFamily: DISPLAY }}>
                {next ? OFFER_COPY.ladderNext(next.toGo, next.label) : OFFER_COPY.ladderAll}
              </p>
              {next && (
                <div className="mt-2.5 h-2 overflow-hidden rounded-full" style={{ background: 'rgba(10,10,10,0.08)' }} aria-hidden>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round(ladder.progress * 100)}%`,
                      background: `linear-gradient(90deg, ${P.accentDeep}, ${P.accent} 60%, ${P.accentBright})`,
                      boxShadow: '0 0 10px rgba(0,212,255,0.55)',
                      transition: `width 0.4s ${EASE}`,
                    }}
                  />
                </div>
              )}
              <ul className="mt-3 space-y-1.5">
                {ladder.rungs.map((r) => (
                  <li key={`${r.kind}-${r.at}`} className="flex items-start gap-2" data-rung={r.kind} data-reached={r.reached}>
                    <Tick on={r.reached} />
                    <span className="min-w-0 flex-1 text-[13px] leading-snug" style={{ color: r.reached ? P.ink : P.ink2 }}>
                      <span className="font-semibold">{r.label}</span> <span style={{ color: P.ink3 }}>{r.condition}</span>
                      {r.kind === 'gift' && giftConditions && (
                        <span className="mt-0.5 block text-[11.5px]" style={{ color: P.ink3 }}>
                          {giftConditions}{' '}
                          <Link href={FREE_GIFT_TERMS_PATH} className="font-semibold underline underline-offset-2" style={{ color: P.ink2 }}>
                            {OFFER_COPY.terms}
                          </Link>
                        </span>
                      )}
                    </span>
                    {!r.reached && (
                      <span className="flex-shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: P.ink2 }}>
                        {OFFER_COPY.ladderToGo(r.toGo)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {next && addOns.length > 0 && (
                <>
                  <p className="mt-3 text-[12.5px] font-semibold" style={{ color: P.ink2 }}>
                    {OFFER_COPY.ladderAdd}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {addOns.slice(0, 3).map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => onAdd(p)}
                          aria-label={`Add ${p.title}, ${formatGBP(p.basePrice)}`}
                          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[12.5px] font-semibold transition-transform active:scale-95"
                          style={{ background: P.card, border: `1px solid ${P.hairline}`, color: P.ink }}
                        >
                          <span aria-hidden style={{ color: P.accentInk }}>
                            +
                          </span>
                          {shortNameOf(p)}
                          <span style={{ color: P.ink3 }}>· {formatGBP(p.basePrice)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
        <div style={{ order: 7 }}>
          {/* One button, the price they pay. */}
          <button
            ref={onCtaRef}
            type="button"
            onClick={onCheckout}
            disabled={busy || onCount === 0}
            data-box-cta
            className="group relative mt-6 flex w-full items-center justify-center gap-2 overflow-hidden rounded-[20px] py-4 text-[16.5px] font-bold transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{
              background: `linear-gradient(180deg, ${P.accentBright}, ${P.accent} 52%, ${P.accentDeep})`,
              color: P.ink,
              fontFamily: DISPLAY,
              boxShadow: '0 16px 32px -14px rgba(0,180,220,0.95), inset 0 1px 0 rgba(255,255,255,0.55)',
            }}
          >
            <span key={busy ? 'going' : isSub ? monthly : oneOff} className="relative inline-block" style={{ animation: 'box-pop 0.35s ease-out' }}>
              {busy ? BOX_COPY.going : isSub ? BOX_COPY.ctaMonthly(monthly) : BOX_COPY.ctaOnce(oneOff)}
            </span>
            {!busy && (
              <svg
                aria-hidden
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="relative transition-transform group-hover:translate-x-0.5"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            )}
            {/* A sheen that crosses the button once it is there to press. */}
            <span aria-hidden className="box-cta-sheen pointer-events-none absolute inset-y-0 -left-1/3 w-1/3" />
          </button>
          {delivery !== null && onCount > 0 && (
            <p className="mt-2.5 text-center text-[12.5px] font-semibold" style={{ color: P.ink2 }} data-box-delivery>
              {BOX_COPY.delivery(delivery)}
            </p>
          )}
          {hub && onCount > 0 && (
            <p className="mt-1.5 text-balance text-center text-[12.5px] leading-snug" style={{ color: P.ink2 }} data-box-hub-line>
              <span aria-hidden className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full align-[-3px]" style={{ background: P.accent, color: P.ink }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2 4 14h7l-1 8 10-12h-7l1-8z" />
                </svg>
              </span>
              {HUB_PREVIEW_COPY.underCta}{' '}
              <Link href={MEMBER_HUB_TERMS_PATH} className="whitespace-nowrap font-semibold underline underline-offset-2" style={{ color: P.ink2 }}>
                {DEALS_COPY.termsLink}
              </Link>
            </p>
          )}
          {messages.length > 0 && (
            <div role="alert" className="mt-2 space-y-1" data-box-error>
              {messages.map((m) => (
                <p key={m} className="text-[13px] leading-snug" style={{ color: P.danger }}>
                  {m}
                </p>
              ))}
            </div>
          )}
          {onCount === 0 && (
            <p className="mt-2 text-center text-[13px]" style={{ color: P.ink2 }}>
              {BOX_COPY.empty}
            </p>
          )}
          {core && (
            <>
              <button
                type="button"
                onClick={core.onStart}
                disabled={core.disabled}
                className="mt-3 block w-full text-center text-[13px] underline underline-offset-2 disabled:opacity-50"
                style={{ color: P.ink2 }}
                data-just-one
              >
                {BOX_COPY.justOne(core.title, core.total)}
              </button>
              {core.message && (
                <p role="status" className="mt-1.5 text-center text-[12.5px] leading-snug" style={{ color: P.ink2 }}>
                  {core.message}
                </p>
              )}
            </>
          )}
        </div>
      </div>
      <style>
        {'@keyframes box-pop{0%{transform:scale(0.96);opacity:.6}100%{transform:scale(1);opacity:1}}' +
          '@keyframes box-sheen{0%{transform:translateX(0) skewX(-18deg)}100%{transform:translateX(420%) skewX(-18deg)}}' +
          '.box-cta-sheen{background:linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent);animation:box-sheen 1.1s ease-out 1.2s 1 both}' +
          '@media (prefers-reduced-motion: reduce){.box-cta-sheen{display:none}}'}
      </style>
    </section>
  )
}

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className="relative flex-shrink-0 rounded-full"
      style={{ width: 48, height: 28, background: on ? P.accent : '#D4D4D8', transition: `background-color 0.25s ${EASE}` }}
    >
      <span
        aria-hidden
        className="absolute rounded-full"
        style={{
          top: 3,
          left: 3,
          width: 22,
          height: 22,
          background: P.card,
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          transform: on ? 'translateX(20px)' : 'none',
          transition: `transform 0.25s ${EASE}`,
        }}
      />
    </button>
  )
}

function PlanOption({
  on,
  label,
  sub,
  badge = null,
  disabled,
  onClick,
}: {
  on: boolean
  label: string
  sub: string
  badge?: string | null
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className="relative flex flex-col items-center gap-0.5 rounded-2xl px-2 py-3 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        background: on ? P.card : 'transparent',
        boxShadow: on ? '0 0 0 1.5px rgba(0,212,255,0.6), 0 6px 16px -8px rgba(10,10,10,0.25)' : 'none',
        transition: `background-color 0.25s ${EASE}, box-shadow 0.25s ${EASE}`,
      }}
    >
      <span className="text-[14px] font-bold" style={{ color: P.ink, fontFamily: DISPLAY }}>
        {label}
      </span>
      <span className="text-[12.5px] tabular-nums" style={{ color: P.ink2 }}>
        {sub}
      </span>
      {badge && (
        <span
          className="absolute -top-2.5 right-2 rounded-full px-2 py-0.5 text-[10.5px] font-black"
          style={{ background: P.ink, color: P.card, fontFamily: DISPLAY, boxShadow: '0 4px 10px -4px rgba(10,10,10,0.5)' }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="mt-0.5 inline-flex flex-shrink-0 items-center justify-center rounded-full"
      style={{ width: 16, height: 16, background: on ? P.accent : 'transparent', border: on ? 'none' : `1.5px solid rgba(10,10,10,0.25)`, color: P.ink }}
    >
      {on && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
        </svg>
      )}
    </span>
  )
}
