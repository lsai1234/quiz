'use client'

import { useMemo, useState } from 'react'
import { useHubStore } from '@/lib/hub-store'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { nextDispatchDate, formatDispatchDate, monthsRemainingOnTerm, canCancel } from '@/lib/recharge/mock'
import { recommendForSubscription } from '@/lib/feedback'
import { FeedbackPanel } from './FeedbackPanel'
import { StackItemCard } from './StackItemCard'
import { ChangeProductFlow } from './ChangeProductFlow'

const ACCENT = '#00D4FF'
const DAY_OPTIONS = [1, 5, 10, 15, 20, 25, 28]

export function SubscriptionDashboard() {
  const { subscription: sub, feedback, logout, setDispatchDay, pause, resume, cancel, swapLine, submitFeedback } = useHubStore()
  const { products } = useCatalogueProducts()
  const [changeLineId, setChangeLineId] = useState<string | null>(null)
  const [showCheckInResult, setShowCheckInResult] = useState(false)

  const nextDispatch = useMemo(
    () => (sub ? formatDispatchDate(nextDispatchDate(sub.dispatchDayOfMonth)) : ''),
    [sub],
  )
  const recommendations = useMemo(
    () => (sub ? recommendForSubscription(sub, feedback, products) : []),
    [sub, feedback, products],
  )

  if (!sub) return null

  const remaining = monthsRemainingOnTerm(sub)
  const statusColor = sub.status === 'active' ? ACCENT : sub.status === 'paused' ? '#fbbf24' : 'var(--color-muted)'
  const recById = Object.fromEntries(recommendations.map((r) => [r.lineId, r]))
  const flagged = recommendations.filter((r) => r.action === 'consider-change')
  const reviewCount = flagged.length
  const changeLine = sub.lines.find((l) => l.id === changeLineId) ?? null

  function openChange(lineId: string) {
    setShowCheckInResult(false)
    setChangeLineId(lineId)
  }

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
          {/* Monthly pulse */}
          <FeedbackPanel
            lastCheckIn={feedback[feedback.length - 1]?.date}
            onSubmit={(ratings, improvements, notes) => {
              submitFeedback(ratings, improvements, notes)
              setShowCheckInResult(true)
            }}
          />

          {/* Immediate result of a check-in */}
          {showCheckInResult && (
            <div className="rounded-2xl border p-5 mb-4"
              style={{ background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)', borderColor: 'color-mix(in srgb, var(--color-accent) 25%, transparent)' }}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                  Thanks for checking in
                </p>
                <button onClick={() => setShowCheckInResult(false)} className="text-xs text-[var(--color-muted)]" aria-label="Dismiss">✕</button>
              </div>
              {reviewCount > 0 ? (
                <>
                  <p className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed">
                    Based on how you're feeling, {reviewCount === 1 ? 'this could be' : 'these could be'} worth changing:
                  </p>
                  <div className="mt-3 space-y-2">
                    {flagged.map((rec) => (
                      <button
                        key={rec.lineId}
                        onClick={() => openChange(rec.lineId)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-left active:scale-[0.98] transition-all"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                      >
                        <span className="text-sm font-semibold text-[var(--color-text)] truncate">{rec.productTitle}</span>
                        <span className="text-xs font-bold flex-shrink-0" style={{ color: '#fbbf24' }}>Find a better fit →</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed">
                  Everything's working — your stack is dialled in. Nothing to change right now. 💪
                </p>
              )}
            </div>
          )}

          {/* Your stack — integrated cards (status + advice + change) */}
          <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-1 mt-6" style={{ fontFamily: 'var(--font-display)' }}>
            Your stack
          </p>
          <p className="text-xs text-[var(--color-muted)] mb-3 leading-relaxed">
            {reviewCount > 0
              ? `${reviewCount} ${reviewCount === 1 ? 'product is' : 'products are'} worth reviewing. Tap any product to change it.`
              : feedback.length > 0
                ? 'Everything’s working — your stack is dialled in. Tap any product to change it.'
                : 'Tap any product to change it, or log a check-in to get tailored advice.'}
          </p>
          <div className="space-y-3">
            {sub.lines.map((line) => (
              <StackItemCard
                key={line.id}
                line={line}
                recommendation={recById[line.id]}
                onChange={openChange}
              />
            ))}
          </div>

          {/* Dispatch date */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 mt-6">
            <p className="text-sm font-bold text-[var(--color-text)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              Dispatch date
            </p>
            <p className="text-xs text-[var(--color-muted)] mb-3">
              Ships on the {sub.dispatchDayOfMonth}{ordinal(sub.dispatchDayOfMonth)} — next on {nextDispatch}.
            </p>
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

          {/* Billing */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 mt-4">
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
              <button
                onClick={pause}
                disabled={!canCancel(sub)}
                title={canCancel(sub) ? undefined : `${remaining} months left on your minimum term`}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold border border-[var(--color-border)] text-[var(--color-text-2)] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {canCancel(sub) ? 'Pause' : `Pause (in ${remaining}mo)`}
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

      {changeLine && (
        <ChangeProductFlow
          subscription={sub}
          line={changeLine}
          catalogue={products}
          onConfirm={(newProduct) => {
            swapLine(changeLine.id, newProduct)
            setChangeLineId(null)
          }}
          onClose={() => setChangeLineId(null)}
        />
      )}
    </div>
  )
}

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}
