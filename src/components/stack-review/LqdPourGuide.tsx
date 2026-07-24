'use client'

/**
 * CHRGD LQD — the Pour Plan reveal (drinks mode only).
 *
 * Driven by the rhythm-sizing engine (`buildPourPlan`): shows the whole month as
 * a pool, then the drinks grouped by WHEN — Every day / Around training / When
 * you need it — each sized to how it's actually consumed, with a protocol note
 * and its default flavour. The plan-type framing (monthly right-sized vs one-off
 * packs) reflects the shared chooser. Product swaps reuse the review's existing
 * swap modal; flavour selection lands with the checkout wiring (P4).
 */
import { useMemo } from 'react'
import type { SubscriptionLine } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'
import type { PlanType } from '@/lib/store'
import { buildPourPlan, type PourLine, type PourWhen } from '@/lib/pour-plan'

const ACCENT = '#00D4FF'
const WHEN_COLOR: Record<PourWhen, string> = { everyday: ACCENT, training: '#8b93ff', asNeeded: '#4fb3e6' }

interface Props {
  plan: SubscriptionLine[]
  answers: QuizAnswers
  catalogue: CatalogueProduct[]
  planType: PlanType
  onPlanChange: (p: PlanType) => void
  /** Opens the existing swap flow for a product (maps back to its stack slot). */
  onSwapProduct?: (productId: string) => void
}

export function LqdPourGuide({ plan, answers, catalogue, planType, onPlanChange, onSwapProduct }: Props) {
  const products = useMemo(() => {
    const byId = new Map<string, CatalogueProduct>()
    for (const l of plan) if (!byId.has(l.product.id)) byId.set(l.product.id, l.product)
    return [...byId.values()]
  }, [plan])

  const pour = useMemo(() => buildPourPlan(products, answers), [products, answers])

  const productById = useMemo(() => {
    const m = new Map<string, CatalogueProduct>()
    for (const p of [...products, ...catalogue]) if (!m.has(p.id)) m.set(p.id, p)
    return m
  }, [products, catalogue])

  const swapCount = (line: PourLine) =>
    catalogue.filter((c) => c.swapGroup === line.swapGroup && c.id !== line.productId).length

  const flavourLabel = (line: PourLine): string | null => {
    const v = productById.get(line.productId)?.variants.find((x) => x.id === line.variantId)
    return v?.flavour || v?.size || null
  }

  if (pour.buckets.length === 0) return null

  // Build the pool: one dot per drink, coloured by when. Capped so the panel
  // stays tidy on very large boxes.
  const dots: string[] = []
  for (const b of pour.buckets) for (const l of b.lines) for (let i = 0; i < l.monthlyCount; i++) dots.push(b.when)
  const shownDots = dots.slice(0, 72)

  const isSub = planType === 'subscription'

  return (
    <div
      className="relative rounded-2xl p-5 mb-4 overflow-hidden"
      style={{
        border: `1px solid color-mix(in srgb, ${ACCENT} 22%, transparent)`,
        background: `linear-gradient(135deg, color-mix(in srgb, ${ACCENT} 8%, transparent), transparent 62%)`,
      }}
    >
      {/* Header */}
      <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
        CHRGD LQD · Your Pour Plan
      </p>
      <div className="flex items-baseline justify-between gap-3 mt-1 mb-1">
        <h3 className="text-lg font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Your drinks for the month
        </h3>
        <p className="text-sm font-black whitespace-nowrap" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          ~{pour.totalDrinks} <span className="font-semibold text-[var(--color-muted)] text-xs">drinks</span>
        </p>
      </div>
      <p className="text-xs text-[var(--color-muted)] leading-relaxed mb-4">
        No timetable — about {pour.dailyPace} a day, and you pick what you feel like. Over the month it all adds up to keep you covered.
      </p>

      {/* The pool */}
      <div className="rounded-xl p-3.5 mb-4" style={{ background: 'color-mix(in srgb, var(--color-text) 4%, transparent)', border: '1px solid var(--color-border)' }}>
        <div className="flex flex-wrap gap-[6px] justify-center">
          {shownDots.map((w, i) => (
            <span key={i} className="w-[13px] h-[13px] rounded-full" style={{ background: WHEN_COLOR[w as PourWhen], boxShadow: `0 0 6px -1px ${WHEN_COLOR[w as PourWhen]}` }} aria-hidden="true" />
          ))}
        </div>
        <p className="text-[11px] text-[var(--color-muted)] text-center mt-3">One box, {isSub ? 'delivered monthly' : 'yours to keep'} — dip in whenever you fancy one.</p>
      </div>

      {/* Plan-type framing */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {(['subscription', 'oneoff'] as PlanType[]).map((pt) => {
          const active = planType === pt
          return (
            <button
              key={pt}
              onClick={() => onPlanChange(pt)}
              aria-pressed={active}
              className="rounded-xl px-3 py-2.5 text-left transition-all active:scale-[0.99]"
              style={{
                background: active ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'var(--color-surface)',
                border: `1px solid ${active ? `color-mix(in srgb, ${ACCENT} 45%, transparent)` : 'var(--color-border)'}`,
              }}
            >
              <span className="text-xs font-bold" style={{ color: active ? ACCENT : 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                {pt === 'subscription' ? 'Monthly box' : 'Buy once'}
              </span>
              <span className="block text-[10px] text-[var(--color-muted)] mt-0.5 leading-snug">
                {pt === 'subscription' ? 'Right-sized & restocked' : 'One pack of each to try'}
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-[var(--color-muted)] leading-relaxed mb-4 px-0.5">
        {isSub
          ? 'Sized to your pick and restocked monthly — add drinks or variety and it stays a flat rate.'
          : 'One pack of each — they last different lengths at your pace, so you top up bits as you go.'}
      </p>

      {/* Buckets (the protocol) */}
      <div className="space-y-4">
        {pour.buckets.map((bucket) => (
          <div key={bucket.when}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: WHEN_COLOR[bucket.when] }} aria-hidden="true" />
              <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>
                {bucket.label} · {bucket.total} {bucket.total === 1 ? 'drink' : 'drinks'}
              </p>
            </div>
            <div className="space-y-2">
              {bucket.lines.map((line) => {
                const flavour = flavourLabel(line)
                const canSwap = !!onSwapProduct && swapCount(line) > 0
                const lasts = !isSub ? `1 pack · ~${line.oneOffLastsWeeks} wk${line.oneOffLastsWeeks === 1 ? '' : 's'}` : `×${line.monthlyCount}`
                return (
                  <div key={line.productId} className="flex items-center gap-3 rounded-xl p-2.5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: WHEN_COLOR[bucket.when], minHeight: 34 }} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold leading-snug" style={{ color: 'var(--color-text)' }}>
                        {line.title}
                        {flavour && <span className="text-[var(--color-muted)] font-medium"> · {flavour}</span>}
                        {line.isPrimary && <span className="ml-1.5 text-[9px] font-bold uppercase align-middle" style={{ color: ACCENT }}>your focus</span>}
                      </p>
                      <p className="text-[11px] text-[var(--color-muted)] leading-snug mt-0.5">{line.protocolNote}</p>
                      {canSwap && (
                        <button onClick={() => onSwapProduct!(line.productId)} className="text-[11px] font-semibold mt-1 underline" style={{ color: ACCENT }}>
                          Swap
                        </button>
                      )}
                    </div>
                    <span className="text-sm font-black tnum whitespace-nowrap" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
                      {lasts}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
