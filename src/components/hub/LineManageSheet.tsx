'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import {
  cadenceOptions,
  computeCadenceImpact,
  computeQuantityImpact,
  computeRemoveImpact,
  oneOffCharge,
  lineEconomics,
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
  onSetCadence: (months: number) => void
  onSetQuantity: (quantity: number) => void
  onSkip: () => void
  onExpedite: (qty: number) => void
  onRemove: () => void
  onClose: () => void
}

function cadenceLabel(months: number): string {
  return months === 1 ? 'Every month' : `Every ${months} months`
}

export function LineManageSheet({ subscription, line, product, onSetCadence, onSetQuantity, onSkip, onExpedite, onRemove, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const [months, setMonths] = useState(line.deliveryIntervalMonths)
  const [qty, setQty] = useState(line.quantity)
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

  const econ = lineEconomics(line, product)
  const cadenceChanged = months !== line.deliveryIntervalMonths
  const qtyChanged = qty !== line.quantity
  const cadenceImpact = computeCadenceImpact(subscription, line.id, months)
  const qtyImpact = computeQuantityImpact(subscription, line.id, qty)
  const removeImpact = computeRemoveImpact(subscription, line.id)
  const oneOff = oneOffCharge(line, 1)
  const nextBox = formatDispatchDate(effectiveNextDispatch(subscription))

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
          {/* How much each delivery (recurring extra) */}
          <div>
            <p className="text-sm font-bold text-[var(--color-text)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>How many each delivery?</p>
            <p className="text-xs text-[var(--color-muted)] mb-3">Need an extra one every time? Bump it up — it ships with every box at your plan price.</p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] px-2 py-1.5">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-9 h-9 rounded-lg text-lg font-black text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border)] active:scale-90" aria-label="Fewer">−</button>
                <span className="w-6 text-center text-base font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>{qty}</span>
                <button onClick={() => setQty((q) => Math.min(6, q + 1))} className="w-9 h-9 rounded-lg text-lg font-black text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border)] active:scale-90" aria-label="More">+</button>
              </div>
              <span className="text-xs text-[var(--color-muted)]">{qty} × {formatGBP(econ.discountedUnit)} = {formatGBP(qty * econ.discountedUnit)}/box</span>
            </div>
            {qtyChanged && (
              <div className="mt-3 space-y-2">
                <BillingImpact monthlyBefore={qtyImpact.currentMonthly} monthlyAfter={qtyImpact.newMonthly} effectiveFrom={effectiveNextDispatch(subscription).toISOString()} economics={{ ...econ, units: qty, perDelivery: Math.round(qty * econ.discountedUnit * 100) / 100, perMonth: Math.round((qty * econ.discountedUnit / Math.max(1, line.deliveryIntervalMonths)) * 100) / 100 }} />
                <button onClick={() => onSetQuantity(qty)} className="w-full py-3 rounded-xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>Save quantity</button>
              </div>
            )}
          </div>

          {/* How often it ships */}
          <div>
            <p className="text-sm font-bold text-[var(--color-text)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>How often should it ship?</p>
            <p className="text-xs text-[var(--color-muted)] mb-3">Going through it faster or stockpiling? You only ever pay for what ships.</p>
            <div className="flex flex-wrap gap-2">
              {cadenceOptions().map((m) => {
                const active = months === m
                return (
                  <button key={m} onClick={() => setMonths(m)} className="px-3.5 h-10 rounded-xl text-xs font-bold transition-all active:scale-95"
                    style={{ background: active ? 'var(--color-accent)' : 'var(--color-surface-2)', color: active ? 'var(--color-bg)' : 'var(--color-text-2)', border: '1px solid var(--color-border)' }}>
                    {cadenceLabel(m)}
                  </button>
                )
              })}
            </div>
            {cadenceChanged && (
              <div className="mt-3 space-y-2">
                <BillingImpact monthlyBefore={cadenceImpact.currentMonthly} monthlyAfter={cadenceImpact.newMonthly} effectiveFrom={effectiveNextDispatch(subscription).toISOString()} />
                <button onClick={() => onSetCadence(months)} className="w-full py-3 rounded-xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>Save cadence</button>
              </div>
            )}
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
