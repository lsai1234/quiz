'use client'

import { useMemo, useState } from 'react'
import { useHubStore } from '@/lib/hub-store'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { effectiveNextDispatch, formatDispatchDate, monthsRemainingOnTerm, canCancel } from '@/lib/recharge/mock'
import { recommendForSubscription, buildCheckInQuestions } from '@/lib/feedback'
import { CheckIn } from './CheckIn'
import { CheckInJourney } from './CheckInJourney'
import { StackItemCard } from './StackItemCard'
import { ChangeProductFlow } from './ChangeProductFlow'
import { AddProductSheet } from './AddProductSheet'
import { LineManageSheet } from './LineManageSheet'

const ACCENT = '#00D4FF'
const DAY_OPTIONS = [1, 5, 10, 15, 20, 25, 28]

export function SubscriptionDashboard() {
  const {
    subscription: sub, feedback, logout,
    setDispatchDay, sendNow, delayDispatch, pause, resume, cancel,
    swapLine, addLine, removeLine, setLineCadence, skipNext, submitFeedback, submitDimension,
  } = useHubStore()
  const { products } = useCatalogueProducts()
  const [changeLineId, setChangeLineId] = useState<string | null>(null)
  const [manageLineId, setManageLineId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showJourney, setShowJourney] = useState(false)

  const nextDispatch = useMemo(
    () => (sub ? formatDispatchDate(effectiveNextDispatch(sub)) : ''),
    [sub],
  )
  const recommendations = useMemo(
    () => (sub ? recommendForSubscription(sub, feedback, products) : []),
    [sub, feedback, products],
  )
  const checkInPlan = useMemo(
    () => (sub ? buildCheckInQuestions(sub, products) : { questions: [], expectations: [] }),
    [sub, products],
  )

  if (!sub) return null

  const remaining = monthsRemainingOnTerm(sub)
  const statusColor = sub.status === 'active' ? ACCENT : sub.status === 'paused' ? '#fbbf24' : 'var(--color-muted)'
  const recById = Object.fromEntries(recommendations.map((r) => [r.lineId, r]))
  const reviewCount = recommendations.filter((r) => r.phase === 'review').length

  const changeLine = sub.lines.find((l) => l.id === changeLineId) ?? null
  const manageLine = sub.lines.find((l) => l.id === manageLineId) ?? null

  function openChange(lineId: string) {
    setShowJourney(false)
    setManageLineId(null)
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
          {/* Adaptive check-in */}
          <CheckIn
            lastCheckIn={feedback[feedback.length - 1]?.date}
            plan={checkInPlan}
            onComplete={(ratings) => {
              const values = Object.values(ratings).filter((v): v is number => typeof v === 'number')
              if (values.length > 0) submitFeedback(ratings, values.some((v) => v >= 4))
              setShowJourney(true)
            }}
          />

          {/* Journey result */}
          {showJourney && (
            <CheckInJourney
              recommendations={recommendations}
              onChange={openChange}
              onDismiss={() => setShowJourney(false)}
            />
          )}

          {/* Your stack */}
          <div className="flex items-center justify-between mt-6 mb-1">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-display)' }}>
              Your stack
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-all"
              style={{ background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT, fontFamily: 'var(--font-display)' }}
            >
              + Add product
            </button>
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-3 leading-relaxed">
            {reviewCount > 0
              ? `${reviewCount} ${reviewCount === 1 ? 'product is' : 'products are'} worth reviewing. Tap Manage to change cadence, skip, or remove anything.`
              : 'Tap a quick face to log how it’s landing, or Manage to change cadence, skip, or remove.'}
          </p>
          <div className="space-y-3">
            {sub.lines.map((line) => (
              <StackItemCard
                key={line.id}
                line={line}
                recommendation={recById[line.id]}
                onChange={openChange}
                onManage={(id) => { setChangeLineId(null); setManageLineId(id) }}
                onMicroFeedback={submitDimension}
              />
            ))}
          </div>

          {/* Next box / dispatch date */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 mt-6">
            <p className="text-sm font-bold text-[var(--color-text)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              Your next box
            </p>
            <p className="text-xs text-[var(--color-muted)] mb-3">
              Arriving {nextDispatch}. Need it sooner or later?
            </p>
            <div className="flex gap-2 mb-4">
              <button
                onClick={sendNow}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all"
                style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
              >
                Send it now
              </button>
              <button
                onClick={() => delayDispatch(7)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all"
                style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}
              >
                Delay a week
              </button>
            </div>
            <p className="text-[11px] text-[var(--color-muted)] mb-2">Regular ship day of the month</p>
            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((day) => {
                const active = sub.dispatchDayOfMonth === day && !sub.nextDispatchOverride
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
          <p className="text-sm text-[var(--color-text-2)]">Your subscription has been cancelled. You won&apos;t be charged again.</p>
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

      {manageLine && (
        <LineManageSheet
          subscription={sub}
          line={manageLine}
          onSetCadence={(months) => { setLineCadence(manageLine.id, months); setManageLineId(null) }}
          onSkip={() => { skipNext(manageLine.id); setManageLineId(null) }}
          onExpedite={() => { alert('Live, this charges a one-off and ships it with your next box.'); setManageLineId(null) }}
          onRemove={() => { removeLine(manageLine.id); setManageLineId(null) }}
          onClose={() => setManageLineId(null)}
        />
      )}

      {showAdd && (
        <AddProductSheet
          subscription={sub}
          catalogue={products}
          onAdd={(product) => { addLine(product, products); setShowAdd(false) }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
