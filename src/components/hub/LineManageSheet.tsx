'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatGBP, USAGE_LEVELS, type UsageLevel } from '@/lib/stack-blueprint/pricing'
import {
  computeRemoveImpact,
  oneOffCharge,
  setLineUsage,
  formatDispatchDate,
  effectiveNextDispatch,
} from '@/lib/recharge/mock'
import { BillingImpact } from './BillingImpact'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

const ACCENT = '#00D4FF'
const AMBER = '#fbbf24'

interface Props {
  subscription: MemberSubscription
  line: MemberSubscriptionLine
  product?: CatalogueProduct
  onSetUsage: (usageLevel: UsageLevel) => void
  onSkip: () => void
  onExpedite: (qty: number) => void
  onRemove: () => void
  onClose: () => void
}

const USAGE_LABEL: Record<UsageLevel, string> = { light: 'A little', standard: 'As recommended', heavy: 'A lot' }

function shipSummary(units: number, months: number, noun: string): string {
  if (months > 1) return `1 ${noun} every ${months} months`
  if (units > 1) return `${units} ${noun}s a month`
  return `1 ${noun} a month`
}

export function LineManageSheet({ subscription, line, product, onSetUsage, onSkip, onExpedite, onRemove, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const [usage, setUsage] = useState<UsageLevel>(line.usageLevel ?? 'standard')
  const [confirmRemove, setConfirmRemove] = useState(false)

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

  if (!mounted) return null

  const usageChanged = usage !== (line.usageLevel ?? 'standard')
  // Pure projection of the pending slider choice (not applied until confirmed).
  const previewLine = product
    ? setLineUsage(subscription, line.id, product, usage).lines.find((l) => l.id === line.id) ?? line
    : line
  const removeImpact = computeRemoveImpact(subscription, line.id)
  const oneOff = oneOffCharge(line, 1)
  const nextBox = formatDispatchDate(effectiveNextDispatch(subscription))
  const noun = (product?.formats[0] ?? '').toLowerCase().includes('powder') ? 'tub' : 'pack'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ background: 'rgba(0,0,0,0.72)' }}
    >
      <div className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col" style={{ background: 'var(--color-surface)', maxHeight: '92dvh' }}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border-2)]" />
        </div>

        <div className="px-5 pt-2 pb-4 flex items-start justify-between gap-3 flex-shrink-0 border-b border-[var(--color-border)]">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase mb-0.5" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>{line.slotTitle}</p>
            <h3 className="text-lg font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Manage {line.productTitle}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-muted)] bg-[var(--color-surface-2)] active:scale-90 flex-shrink-0 mt-0.5" aria-label="Close">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
          {/* How much you get through — one slider, we do the maths */}
          <div>
            <p className="text-sm font-bold text-[var(--color-text)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>How much do you get through?</p>
            <p className="text-xs text-[var(--color-muted)] mb-3">Slide it — we&apos;ll sort how much ships and how often. You only ever pay for what ships.</p>
            <input
              type="range" min={0} max={2} step={1} value={USAGE_LEVELS.indexOf(usage)}
              onChange={(e) => setUsage(USAGE_LEVELS[Number(e.target.value)])}
              className="w-full" style={{ accentColor: ACCENT }}
            />
            <div className="flex justify-between mt-1 mb-3">
              {USAGE_LEVELS.map((lvl) => (
                <button key={lvl} onClick={() => setUsage(lvl)} className="text-[10px] font-semibold" style={{ color: usage === lvl ? ACCENT : 'var(--color-muted)' }}>
                  {USAGE_LABEL[lvl]}
                </button>
              ))}
            </div>
            {/* Live preview of the pending choice — text only, so nothing reflows. */}
            <p className="text-xs text-[var(--color-muted)]">
              {shipSummary(previewLine.quantity, previewLine.deliveryIntervalMonths, noun)} · {formatGBP(previewLine.pricePerDelivery)}/box
            </p>
            {/* Always rendered (disabled when unchanged) so it never shifts the layout. */}
            <button
              onClick={() => onSetUsage(usage)}
              disabled={!usageChanged}
              className="w-full mt-3 py-3 rounded-xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all disabled:opacity-40"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Review change →
            </button>
          </div>

          {/* Quick moves */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onExpedite(1)} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5 text-left active:scale-[0.98] transition-all">
              <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Get one now</p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">One-off {formatGBP(oneOff)} · ships ASAP</p>
            </button>
            <button onClick={onSkip} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5 text-left active:scale-[0.98] transition-all">
              <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Skip next</p>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">Credit {formatGBP(line.pricePerDelivery)} to next payment</p>
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] -mt-3">Next box: {nextBox}.</p>

          {/* Remove */}
          <div>
            {!confirmRemove ? (
              <button onClick={() => setConfirmRemove(true)} className="w-full py-3 rounded-2xl text-sm font-semibold border border-[var(--color-border)] text-[var(--color-muted)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>
                Remove from stack
              </button>
            ) : (
              <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: `color-mix(in srgb, ${AMBER} 40%, transparent)`, background: `color-mix(in srgb, ${AMBER} 6%, transparent)` }}>
                <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Remove {line.productTitle}?</p>
                <BillingImpact
                  monthlyBefore={removeImpact.currentMonthly}
                  monthlyAfter={removeImpact.newMonthly}
                  settlement={removeImpact.settlement}
                  note={removeImpact.settlement > 0.01
                    ? `A one-off settlement covers the box already sent that you haven’t finished paying for. Your monthly then drops to ${formatGBP(removeImpact.newMonthly)}.`
                    : `Nothing’s shipped yet, so there’s no charge. Your monthly drops to ${formatGBP(removeImpact.newMonthly)}.`}
                />
                <div className="flex gap-2">
                  <button onClick={() => setConfirmRemove(false)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-[var(--color-border)] text-[var(--color-text-2)] active:scale-95" style={{ fontFamily: 'var(--font-display)' }}>Keep it</button>
                  <button onClick={onRemove} className="flex-1 py-2.5 rounded-xl text-xs font-bold active:scale-95" style={{ background: AMBER, color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}>Remove</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
