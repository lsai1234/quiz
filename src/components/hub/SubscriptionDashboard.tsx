'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useHubStore } from '@/lib/hub-store'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { buildDeliverySchedule, nextDelivery } from '@/lib/recharge/schedule'
import { recommendForSubscription, buildCheckInQuestions } from '@/lib/feedback'
import { CheckIn } from './CheckIn'
import { CheckInJourney } from './CheckInJourney'
import { StackItemCard } from './StackItemCard'
import { ChangeProductFlow } from './ChangeProductFlow'
import { AddProductSheet } from './AddProductSheet'
import { LineManageSheet } from './LineManageSheet'
import { DeliveryCalendar } from './DeliveryCalendar'
import { DeliveryDetailSheet } from './DeliveryDetailSheet'
import { BillingSummary } from './BillingSummary'
import { CancelSaveFlow } from './CancelSaveFlow'

const ACCENT = '#00D4FF'
const DAY_OPTIONS = [1, 5, 10, 15, 20, 25, 28]

function countdownLabel(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'ships today'
  if (days === 1) return 'ships tomorrow'
  return `ships in ${days} days`
}

export function SubscriptionDashboard() {
  const {
    subscription: sub, feedback, logout,
    setDispatchDay, resume,
    swapLine, addLine, removeLine, setLineCadence, setLineQuantity, skipNext, submitFeedback, submitDimension,
    skipDelivery, unskipDelivery, rescheduleDelivery, addItemToDelivery, removeItemFromDelivery,
    snooze, applyDownsize, cancelWithReason,
  } = useHubStore()
  const { products } = useCatalogueProducts()
  const [changeLineId, setChangeLineId] = useState<string | null>(null)
  const [manageLineId, setManageLineId] = useState<string | null>(null)
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showJourney, setShowJourney] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const recommendations = useMemo(
    () => (sub ? recommendForSubscription(sub, feedback, products) : []),
    [sub, feedback, products],
  )
  const checkInPlan = useMemo(
    () => (sub ? buildCheckInQuestions(sub, products) : { questions: [], expectations: [] }),
    [sub, products],
  )
  const deliveries = useMemo(
    () => (sub ? buildDeliverySchedule(sub, products, 6) : []),
    [sub, products],
  )
  const next = nextDelivery(deliveries)

  // Subtle premium entrance.
  useEffect(() => {
    if (!rootRef.current) return
    const els = rootRef.current.querySelectorAll('[data-reveal]')
    gsap.fromTo(els, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: 'power2.out' })
  }, [])

  if (!sub) return null

  const recById = Object.fromEntries(recommendations.map((r) => [r.lineId, r]))
  const counts = {
    building: recommendations.filter((r) => r.statusTone === 'building').length,
    onTrack: recommendations.filter((r) => r.statusTone === 'good' || r.statusTone === 'essential').length,
    review: recommendations.filter((r) => r.statusTone === 'review').length,
  }
  const summary = [
    counts.building > 0 ? `${counts.building} building` : null,
    counts.onTrack > 0 ? `${counts.onTrack} on track` : null,
    counts.review > 0 ? `${counts.review} to review` : null,
  ].filter(Boolean).join(' · ')

  const changeLine = sub.lines.find((l) => l.id === changeLineId) ?? null
  const manageLine = sub.lines.find((l) => l.id === manageLineId) ?? null
  const selectedDelivery = deliveries.find((d) => d.id === selectedDeliveryId) ?? null

  function openChange(lineId: string) {
    setShowJourney(false)
    setManageLineId(null)
    setSelectedDeliveryId(null)
    setChangeLineId(lineId)
  }

  return (
    <div ref={rootRef} className="max-w-lg mx-auto px-5 py-8 pb-16">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5" data-reveal>
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

      {sub.status === 'cancelled' ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 text-center" data-reveal>
          <p className="text-sm text-[var(--color-text-2)]">Your subscription has been cancelled. You won&apos;t be charged again.</p>
        </div>
      ) : (
        <>
          {/* Hero — next box */}
          <div
            className="rounded-3xl p-5 mb-5 relative overflow-hidden"
            data-reveal
            style={{ background: 'var(--color-surface-2)', border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)` }}
          >
            <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full" style={{ background: `radial-gradient(circle, color-mix(in srgb, ${ACCENT} 22%, transparent), transparent 70%)` }} />
            <div className="relative">
              {sub.status === 'paused' ? (
                <>
                  <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: '#fbbf24', fontFamily: 'var(--font-display)' }}>
                    {sub.snoozeUntil ? 'Snoozed' : 'Paused'}
                  </p>
                  <p className="text-lg font-black text-[var(--color-text)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Your deliveries are on hold</p>
                  {sub.snoozeUntil && (
                    <p className="text-xs text-[var(--color-text-2)] mb-3">Back on {new Date(sub.snoozeUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} — nothing billed until then.</p>
                  )}
                  <button onClick={resume} className="py-2.5 px-5 rounded-xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>Resume now</button>
                </>
              ) : next ? (
                <>
                  <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>
                    Your next box · {countdownLabel(next.date)}
                  </p>
                  <p className="text-2xl font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                    {new Date(next.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <p className="text-xs text-[var(--color-text-2)] mt-1.5">
                    {next.items.map((it) => it.productTitle).slice(0, 3).join(', ')}{next.items.length > 3 ? ` +${next.items.length - 3} more` : ''}
                  </p>
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => setSelectedDeliveryId(next.id)} className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>
                      Edit next box
                    </button>
                    <button onClick={() => setShowAdd(true)} className="py-2.5 px-4 rounded-xl text-sm font-bold active:scale-95 transition-all" style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}>
                      + Add
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-[var(--color-text-2)]">No upcoming deliveries scheduled.</p>
              )}
            </div>
          </div>

          {/* What you're actually billed */}
          <div className="mb-5" data-reveal>
            <BillingSummary subscription={sub} deliveries={deliveries} />
          </div>

          {/* Stack status one-liner */}
          <div className="flex items-center gap-2 mb-6 px-1" data-reveal>
            <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-display)' }}>Stack</span>
            <span className="text-xs font-semibold text-[var(--color-text-2)]">{summary || `${sub.lines.length} products`}</span>
          </div>

          {/* Delivery calendar */}
          <div className="mb-6" data-reveal>
            <DeliveryCalendar deliveries={deliveries} onSelect={(d) => setSelectedDeliveryId(d.id)} />
          </div>

          {/* Check-in */}
          <div data-reveal>
            <CheckIn
              lastCheckIn={feedback[feedback.length - 1]?.date}
              plan={checkInPlan}
              onComplete={(ratings) => {
                const values = Object.values(ratings).filter((v): v is number => typeof v === 'number')
                if (values.length > 0) submitFeedback(ratings, values.some((v) => v >= 4))
                setShowJourney(true)
              }}
            />
          </div>

          {showJourney && (
            <CheckInJourney recommendations={recommendations} onChange={openChange} onDismiss={() => setShowJourney(false)} />
          )}

          {/* Your stack */}
          <div className="flex items-center justify-between mt-6 mb-3" data-reveal>
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
          <div className="space-y-3" data-reveal>
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

          {/* Settings (collapsed) */}
          <div className="mt-8" data-reveal>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="w-full flex items-center justify-between py-3 text-sm font-bold text-[var(--color-text-2)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              <span>Plan & billing settings</span>
              <span className="text-[var(--color-muted)]">{showSettings ? '▲' : '▼'}</span>
            </button>

            {showSettings && (
              <div className="space-y-4 pt-1">
                {/* Regular ship day */}
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5">
                  <p className="text-sm font-bold text-[var(--color-text)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Regular ship day</p>
                  <p className="text-xs text-[var(--color-muted)] mb-3">Boxes default to the {sub.dispatchDayOfMonth}th. Move any single box from the calendar.</p>
                  <div className="flex flex-wrap gap-2">
                    {DAY_OPTIONS.map((day) => {
                      const active = sub.dispatchDayOfMonth === day
                      return (
                        <button key={day} onClick={() => setDispatchDay(day)}
                          className="w-10 h-10 rounded-xl text-sm font-bold transition-all active:scale-90"
                          style={{ background: active ? 'var(--color-accent)' : 'var(--color-surface)', color: active ? 'var(--color-bg)' : 'var(--color-text-2)', border: '1px solid var(--color-border)' }}>
                          {day}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Billing */}
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5">
                  <p className="text-sm font-bold text-[var(--color-text)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>Billing & payment</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--color-text-2)]">{sub.paymentMethod ? `${sub.paymentMethod.brand} ending ${sub.paymentMethod.last4}` : 'No card on file'}</span>
                    <span className="text-[11px] text-[var(--color-muted)]">Direct debit · monthly</span>
                  </div>
                  <button onClick={() => alert('Live, this opens your Recharge billing portal.')} className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95" style={{ border: '1px solid var(--color-border-2)', color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}>
                    Manage billing
                  </button>
                </div>

                {/* Pause / cancel — routed through the save flow */}
                <button onClick={() => setShowSave(true)}
                  className="w-full py-3 rounded-2xl text-sm font-semibold border border-[var(--color-border)] text-[var(--color-muted)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>
                  Pause or cancel
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Sheets */}
      {changeLine && (
        <ChangeProductFlow
          subscription={sub}
          line={changeLine}
          catalogue={products}
          onConfirm={(newProduct) => { swapLine(changeLine.id, newProduct); setChangeLineId(null) }}
          onClose={() => setChangeLineId(null)}
        />
      )}

      {manageLine && (
        <LineManageSheet
          subscription={sub}
          line={manageLine}
          product={products.find((p) => p.id === manageLine.productId)}
          onSetCadence={(months) => { setLineCadence(manageLine.id, months); setManageLineId(null) }}
          onSetQuantity={(quantity) => { setLineQuantity(manageLine.id, quantity); setManageLineId(null) }}
          onSkip={() => { skipNext(manageLine.id); setManageLineId(null) }}
          onExpedite={() => { alert('Live, this charges a one-off and ships it with your next box.'); setManageLineId(null) }}
          onRemove={() => { removeLine(manageLine.id); setManageLineId(null) }}
          onClose={() => setManageLineId(null)}
        />
      )}

      {selectedDelivery && (
        <DeliveryDetailSheet
          subscription={sub}
          delivery={selectedDelivery}
          catalogue={products}
          onSkip={() => skipDelivery(selectedDelivery.id)}
          onUnskip={() => unskipDelivery(selectedDelivery.id)}
          onReschedule={(date) => rescheduleDelivery(selectedDelivery.id, date)}
          onAddItem={(product) => addItemToDelivery(selectedDelivery.id, product)}
          onAddRecurring={(product) => addLine(product, products)}
          onRemoveItem={(item) => removeItemFromDelivery(selectedDelivery.id, item)}
          onClose={() => setSelectedDeliveryId(null)}
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

      {showSave && (
        <CancelSaveFlow
          subscription={sub}
          catalogue={products}
          recommendations={recommendations}
          onSnooze={(m) => { snooze(m); setShowSave(false) }}
          onDownsize={(ids) => { applyDownsize(ids); setShowSave(false) }}
          onSkipNext={() => { if (next) skipDelivery(next.id); setShowSave(false) }}
          onSwap={(lineId) => { setShowSave(false); openChange(lineId) }}
          onCancel={(reason) => { cancelWithReason(reason); setShowSave(false) }}
          onClose={() => setShowSave(false)}
        />
      )}
    </div>
  )
}
