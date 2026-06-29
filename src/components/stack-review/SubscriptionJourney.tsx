'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StackBlueprint } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers, StackLevel } from '@/lib/types'
import {
  buildSubscriptionPlan,
  calculatePricing,
  allowedUsageLevels,
  formatGBP,
  USAGE_LEVELS,
  type UsageLevel,
  type SubscriptionLine,
} from '@/lib/stack-blueprint/pricing'

const ACCENT = '#00D4FF'

const USAGE_LABEL: Record<UsageLevel, string> = { light: 'A little', standard: 'As recommended', heavy: 'A lot' }
const FREQ_OPTIONS: { id: NonNullable<QuizAnswers['trainingFrequency']>; label: string }[] = [
  { id: '1-2x', label: '1–2× a week' },
  { id: '3-4x', label: '3–4× a week' },
  { id: '5-6x', label: '5–6× a week' },
  { id: 'daily', label: 'Every day' },
]

const LEVEL_LABEL: Record<StackLevel, string> = { essentials: 'Essentials', performance: 'Performance', complete: 'Complete' }

function unitNoun(formats: string[]): string {
  return (formats[0] ?? '').toLowerCase().includes('powder') ? 'tub' : 'pack'
}

function cadenceLine(line: SubscriptionLine): string {
  const noun = unitNoun(line.product.formats)
  const ship =
    line.shipEveryMonths > 1
      ? `1 ${noun} every ${line.shipEveryMonths} months`
      : line.unitsPerShipment > 1
        ? `${line.unitsPerShipment} ${noun}s a month`
        : `1 ${noun} a month`
  const taken = line.cadence === 'daily' ? 'every day' : `on training days (~${line.occasionsPerMonth}/mo)`
  return `Taken ${taken} · ${ship}`
}

interface Props {
  blueprint: StackBlueprint
  products: CatalogueProduct[]
  answers: QuizAnswers | null
  level: StackLevel
  usage: Record<string, UsageLevel>
  onUsageChange: (usage: Record<string, UsageLevel>) => void
  onTrainingFrequencyChange: (freq: NonNullable<QuizAnswers['trainingFrequency']>) => void
  onConfirm: () => void
  onClose: () => void
}

export function SubscriptionJourney({
  blueprint, products, answers, level, usage, onUsageChange, onTrainingFrequencyChange, onConfirm, onClose,
}: Props) {
  // Render through a portal to document.body: StackReviewPage sits inside an
  // animated (transformed) wrapper, which would otherwise make `position: fixed`
  // positioned relative to that wrapper instead of the viewport.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const planOpts = useMemo(() => ({ usageByProductId: usage, level }), [usage, level])
  const plan = useMemo(
    () => buildSubscriptionPlan(blueprint, products, answers, undefined, planOpts),
    [blueprint, products, answers, planOpts],
  )
  const pricing = useMemo(
    () => calculatePricing(blueprint, products, answers, undefined, planOpts),
    [blueprint, products, answers, planOpts],
  )

  const hasPerWorkout = plan.some((l) => l.cadence === 'per-workout')

  function setUsage(productId: string, levelChoice: UsageLevel) {
    onUsageChange({ ...usage, [productId]: levelChoice })
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
            {LEVEL_LABEL[level]} bundle · Subscribe & save {pricing.subscriptionDiscountPct}%
          </p>
          <h2 className="text-lg font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            Tune your monthly plan
          </h2>
        </div>
        <button onClick={onClose} className="text-[var(--color-muted)] text-sm font-semibold px-2 py-1">Close</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 max-w-lg mx-auto w-full space-y-5">
        <p className="text-sm text-[var(--color-muted)] leading-relaxed">
          We&apos;ve already sized everything to how you train — you don&apos;t need to do any maths.
          Just nudge anything you get through faster or slower, and we&apos;ll sort how often it ships.
        </p>

        {/* Lifestyle: training frequency (only relevant when something is taken per workout) */}
        {hasPerWorkout && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
            <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              How often do you train?
            </p>
            <p className="text-[11px] text-[var(--color-muted)] mb-3">This sizes your pre-workout, hydration and other training-day items.</p>
            <div className="grid grid-cols-2 gap-2">
              {FREQ_OPTIONS.map((f) => {
                const active = answers?.trainingFrequency === f.id
                return (
                  <button key={f.id} onClick={() => onTrainingFrequencyChange(f.id)}
                    className="py-2.5 px-2 rounded-xl text-xs font-bold transition-all active:scale-[0.98]"
                    style={{ background: active ? ACCENT : 'var(--color-surface)', color: active ? 'var(--color-bg)' : 'var(--color-text-2)', border: '1px solid var(--color-border)' }}>
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Per-product usage sliders */}
        <div className="space-y-3">
          {plan.map((line) => {
            const allowed = allowedUsageLevels(blueprint, products, answers, line.product.id, usage)
            const current = usage[line.product.id] ?? 'standard'
            const idx = USAGE_LEVELS.indexOf(current)
            return (
              <div key={line.product.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{line.product.title}</p>
                    <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{cadenceLine(line)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-black" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>{formatGBP(line.monthlyPrice)}/mo</p>
                  </div>
                </div>
                {/* 3-stop usage slider */}
                <input
                  type="range" min={0} max={2} step={1} value={idx}
                  onChange={(e) => {
                    const choice = USAGE_LEVELS[Number(e.target.value)]
                    if (allowed.includes(choice)) setUsage(line.product.id, choice)
                  }}
                  className="w-full accent-[var(--color-accent)]"
                  style={{ accentColor: ACCENT }}
                />
                <div className="flex justify-between mt-1">
                  {USAGE_LEVELS.map((lvl) => {
                    const disabled = !allowed.includes(lvl)
                    const active = current === lvl
                    return (
                      <button key={lvl} disabled={disabled} onClick={() => setUsage(line.product.id, lvl)}
                        className="text-[10px] font-semibold transition-colors disabled:opacity-30"
                        style={{ color: active ? ACCENT : 'var(--color-muted)' }}>
                        {USAGE_LABEL[lvl]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer: live flat monthly + confirm */}
      <div className="border-t border-[var(--color-border)] px-5 py-4 max-w-lg mx-auto w-full" style={{ background: 'var(--color-surface)' }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-[var(--color-text-2)]">Your flat monthly</span>
          <span className="text-lg font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{formatGBP(pricing.subscriptionTotal)}/mo</span>
        </div>
        <p className="text-[11px] text-[var(--color-muted)] mb-3">
          One predictable payment — items arrive on their own schedule. {pricing.subscriptionMinMonths > 1 ? `${pricing.subscriptionMinMonths}-month minimum.` : 'Cancel anytime.'}
        </p>
        <button onClick={onConfirm}
          className="w-full py-3.5 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all"
          style={{ fontFamily: 'var(--font-display)' }}>
          Looks good →
        </button>
      </div>
    </div>,
    document.body,
  )
}
