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
}) {
  const headingId = useId()
  const [why, setWhy] = useState(false)
  const onCount = rows.filter((r) => r.on).length
  const { next } = ladder

  return (
    <section aria-labelledby={headingId} data-box className="relative mt-6">
      <div className="flex items-end justify-between gap-3">
        <h3 id={headingId} className="text-[26px] font-black leading-none tracking-tight" style={{ color: P.ink, fontFamily: DISPLAY }}>
          {BOX_COPY.heading}
        </h3>
        <span aria-live="polite" className="rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: P.page, color: P.ink2, fontFamily: DISPLAY }} data-box-count>
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
            className="flex items-center gap-3 rounded-2xl p-3"
            style={{
              background: r.on ? 'rgba(0,212,255,0.06)' : P.page,
              border: `1px solid ${r.on ? 'rgba(0,212,255,0.45)' : P.hairline}`,
              transition: `background-color 0.25s ${EASE}, border-color 0.25s ${EASE}`,
            }}
          >
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              aria-label={`${r.product.title}: ${BOX_COPY.details}`}
              style={{ opacity: r.on ? 1 : 0.55, transition: `opacity 0.25s ${EASE}` }}
            >
              <ProductTile imageUrl={r.product.imageUrl} formats={r.product.formats} title={r.product.title} size={52} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-snug" style={{ color: P.ink }}>
                  {shortNameOf(r.product)}
                </span>
                {r.reason && (
                  <span className="mt-0.5 block text-[13px] leading-snug" style={{ color: P.ink2 }}>
                    {r.reason}
                  </span>
                )}
                <span className="mt-0.5 block text-[12px]" style={{ color: P.ink3 }}>
                  {productTypeLabel(r.product)} · {formatGBP(r.price)}
                </span>
              </span>
            </button>
            <Switch on={r.on} label={BOX_COPY.switchLabel(r.product.title)} onToggle={() => onToggle(r.id)} />
          </li>
        ))}
      </ul>

      {/* Their day: what's switched on, and when to take it. */}
      {routine && onCount > 0 && <YourDay routine={routine} />}

      {/* Once or monthly: every price on the card follows it. */}
      <div role="radiogroup" aria-label={PLAN_COPY.heading} className="mt-5 grid grid-cols-2 gap-1 rounded-2xl p-1" style={{ background: P.page }}>
        <PlanOption on={!isSub} label={PLAN_COPY.once} sub={formatGBP(oneOff)} onClick={() => onPlanChange('oneoff')} />
        <PlanOption
          on={isSub}
          label={PLAN_COPY.monthly}
          sub={canSubscribe ? `${formatGBP(monthly)} ${PLAN_COPY.aMonth}` : monthlyMin ? BOX_COPY.monthlyFrom(monthlyMin.min) : PLAN_COPY.onceOnly}
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
          <button type="button" aria-expanded={why} onClick={() => setWhy((w) => !w)} className="mt-1 text-[13px] font-semibold underline underline-offset-2" style={{ color: P.ink }}>
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

      {/* What the box comes with: services, and the level that unlocks more. */}
      {charge && onCount > 0 && <BoxServices view={charge} />}

      {/* What the box has unlocked, the next line, and products to add to reach it. */}
      {ladder.rungs.length > 0 && (
        <div className="mt-5 rounded-2xl px-4 py-3.5" style={{ background: P.page }} data-ladder={next ? next.kind : 'all'}>
          <p className="text-[15px] font-bold leading-snug" style={{ color: P.ink, fontFamily: DISPLAY }}>
            {next ? OFFER_COPY.ladderNext(next.toGo, next.label) : OFFER_COPY.ladderAll}
          </p>
          {next && (
            <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: 'rgba(10,10,10,0.08)' }} aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${Math.round(ladder.progress * 100)}%`, background: P.accent, transition: `width 0.4s ${EASE}` }} />
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
                      <span aria-hidden style={{ color: P.accentInk }}>+</span>
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

      {/* One button, the price they pay. */}
      <button
        ref={onCtaRef}
        type="button"
        onClick={onCheckout}
        disabled={busy || onCount === 0}
        data-box-cta
        className="mt-5 w-full rounded-2xl py-4 text-[16px] font-bold transition-transform active:scale-[0.98] disabled:opacity-50"
        style={{ background: P.accent, color: P.ink, fontFamily: DISPLAY, boxShadow: '0 12px 28px -14px rgba(0,180,220,0.9)' }}
      >
        <span key={busy ? 'going' : isSub ? monthly : oneOff} className="inline-block" style={{ animation: 'box-pop 0.35s ease-out' }}>
          {busy ? BOX_COPY.going : isSub ? BOX_COPY.ctaMonthly(monthly) : BOX_COPY.ctaOnce(oneOff)}
        </span>
      </button>
      {delivery !== null && onCount > 0 && (
        <p className="mt-2 text-center text-[12.5px] font-semibold" style={{ color: P.ink2 }} data-box-delivery>
          {BOX_COPY.delivery(delivery)}
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
      <style>{'@keyframes box-pop{0%{transform:scale(0.96);opacity:.6}100%{transform:scale(1);opacity:1}}'}</style>
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
        style={{ top: 3, left: 3, width: 22, height: 22, background: P.card, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transform: on ? 'translateX(20px)' : 'none', transition: `transform 0.25s ${EASE}` }}
      />
    </button>
  )
}

function PlanOption({ on, label, sub, disabled, onClick }: { on: boolean; label: string; sub: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: on ? P.card : 'transparent', boxShadow: on ? '0 2px 8px -2px rgba(10,10,10,0.18)' : 'none' }}
    >
      <span className="text-[14px] font-bold" style={{ color: P.ink, fontFamily: DISPLAY }}>
        {label}
      </span>
      <span className="text-[12px]" style={{ color: P.ink2 }}>
        {sub}
      </span>
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
