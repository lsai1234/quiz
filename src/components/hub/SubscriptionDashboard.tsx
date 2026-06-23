'use client'

import { useMemo, useState } from 'react'
import { useHubStore } from '@/lib/hub-store'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import {
  nextDispatchDate,
  formatDispatchDate,
  monthsRemainingOnTerm,
  canCancel,
  swappableForLine,
} from '@/lib/recharge/mock'
import type { MemberSubscriptionLine } from '@/lib/recharge/types'
import { ProductSwapModal } from '@/components/stack-review/ProductSwapModal'

const ACCENT = '#00D4FF'
const DAY_OPTIONS = [1, 5, 10, 15, 20, 25, 28]

function cadenceLabel(line: MemberSubscriptionLine): string {
  const qty = line.quantity > 1 ? `${line.quantity}× · ` : ''
  return line.deliveryIntervalMonths > 1
    ? `${qty}ships every ${line.deliveryIntervalMonths} months`
    : `${qty}ships every month`
}

export function SubscriptionDashboard() {
  const { subscription: sub, logout, setDispatchDay, pause, resume, cancel, swapLine } = useHubStore()
  const { products } = useCatalogueProducts()
  const [swapLineId, setSwapLineId] = useState<string | null>(null)

  const nextDispatch = useMemo(
    () => (sub ? formatDispatchDate(nextDispatchDate(sub.dispatchDayOfMonth)) : ''),
    [sub],
  )

  if (!sub) return null

  const remaining = monthsRemainingOnTerm(sub)
  const swapLineData = sub.lines.find((l) => l.id === swapLineId) ?? null
  const swapAlternatives = swapLineData ? swappableForLine(swapLineData, products) : []

  // Adapt a subscription line to the shared swap modal's slot shape.
  const swapSlot = swapLineData
    ? ({
        slotId: swapLineData.id,
        title: swapLineData.slotTitle,
        recommendedProductId: swapLineData.productId,
        selectedProductId: swapLineData.productId,
      } as StackSlotEntry)
    : null
  const swapCurrentProduct = swapLineData ? products.find((p) => p.id === swapLineData.productId) : undefined

  const statusColor = sub.status === 'active' ? ACCENT : sub.status === 'paused' ? '#fbbf24' : 'var(--color-muted)'

  return (
    <div className="max-w-lg mx-auto px-5 py-8 pb-16">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
            Your subscription
          </p>
          <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            Hi {sub.customerEmail.split('@')[0]}
          </h1>
        </div>
        <button onClick={logout} className="text-xs font-semibold text-[var(--color-muted)] underline mt-1">
          Sign out
        </button>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: statusColor }}>
            <span className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
            {sub.status}
          </span>
          <span className="text-base font-black" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}>
            {formatGBP(sub.flatMonthly)}/mo
          </span>
        </div>
        {sub.status !== 'cancelled' && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--color-text-2)]">Next dispatch</span>
            <span className="font-bold text-[var(--color-text)]">{nextDispatch}</span>
          </div>
        )}
        {remaining > 0 && (
          <p className="text-[11px] text-[var(--color-muted)] mt-2">
            {remaining} {remaining === 1 ? 'month' : 'months'} left on your minimum term.
          </p>
        )}
      </div>

      {sub.status !== 'cancelled' && (
        <>
          {/* Dispatch date */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 mb-4">
            <p className="text-sm font-bold text-[var(--color-text)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              Dispatch date
            </p>
            <p className="text-xs text-[var(--color-muted)] mb-3">Pick the day of the month your order ships.</p>
            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((day) => {
                const active = sub.dispatchDayOfMonth === day
                return (
                  <button
                    key={day}
                    onClick={() => setDispatchDay(day)}
                    className="w-10 h-10 rounded-xl text-sm font-bold transition-all active:scale-90"
                    style={{
                      background: active ? 'var(--color-accent)' : 'var(--color-surface)',
                      color: active ? 'var(--color-bg)' : 'var(--color-text-2)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Lines */}
          <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-3 mt-6" style={{ fontFamily: 'var(--font-display)' }}>
            Your stack — {sub.lines.length} products
          </p>
          <div className="space-y-3">
            {sub.lines.map((line) => (
              <div key={line.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full inline-block mb-1.5"
                      style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`, fontFamily: 'var(--font-display)' }}>
                      {line.slotTitle}
                    </span>
                    <p className="text-sm font-bold text-[var(--color-text)] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
                      {line.productTitle}
                    </p>
                    {line.variantTitle && <p className="text-xs text-[var(--color-muted)] mt-0.5">{line.variantTitle}</p>}
                    <p className="text-[11px] text-[var(--color-text-2)] mt-1">{cadenceLabel(line)}</p>
                  </div>
                  <span className="text-sm font-black flex-shrink-0" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
                    {formatGBP(line.pricePerDelivery)}
                  </span>
                </div>
                <button
                  onClick={() => setSwapLineId(line.id)}
                  className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
                  style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}
                >
                  Swap product
                </button>
              </div>
            ))}
          </div>

          {/* Billing */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 mt-6">
            <p className="text-sm font-bold text-[var(--color-text)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Billing & payment
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-2)]">
                {sub.paymentMethod ? `${sub.paymentMethod.brand} ending ${sub.paymentMethod.last4}` : 'No card on file'}
              </span>
              <span className="text-[11px] text-[var(--color-muted)]">Direct debit · monthly</span>
            </div>
            <button
              onClick={() => alert('Live, this opens your Recharge billing portal to update your card or direct debit.')}
              className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
              style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}
            >
              Manage billing
            </button>
          </div>

          {/* Pause / cancel */}
          <div className="flex gap-2 mt-6">
            {sub.status === 'paused' ? (
              <button onClick={resume} className="flex-1 py-3 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>
                Resume subscription
              </button>
            ) : (
              <button onClick={pause} className="flex-1 py-3 rounded-2xl text-sm font-semibold border border-[var(--color-border)] text-[var(--color-text-2)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>
                Pause
              </button>
            )}
            <button
              onClick={cancel}
              disabled={!canCancel(sub)}
              title={canCancel(sub) ? undefined : `${remaining} months left on your minimum term`}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold border border-[var(--color-border)] text-[var(--color-muted)] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {canCancel(sub) ? 'Cancel' : `Cancel (in ${remaining}mo)`}
            </button>
          </div>
        </>
      )}

      {sub.status === 'cancelled' && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 text-center">
          <p className="text-sm text-[var(--color-text-2)]">Your subscription has been cancelled. You won't be charged again.</p>
        </div>
      )}

      {swapSlot && (
        <ProductSwapModal
          slot={swapSlot}
          currentProduct={swapCurrentProduct}
          alternatives={swapAlternatives}
          onSelect={(lineId, productId) => {
            const product = products.find((p) => p.id === productId)
            if (product) swapLine(lineId, product)
            setSwapLineId(null)
          }}
          onClose={() => setSwapLineId(null)}
        />
      )}
    </div>
  )
}
