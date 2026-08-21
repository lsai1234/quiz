'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Eyebrow } from './Eyebrow'
import { Button, Card, Disclosure, EmptyState, Note, Segmented } from '@/components/system'
import { gsap } from 'gsap'
import { Icon } from '@/components/ui/Icon'
import { ProductTile } from '@/components/stack-review/ProductTile'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { ordinalSuffix, tint } from '@/lib/ui/tokens'
import { selectShopAxes } from '@/lib/stack-stats'
import { useHubStore } from '@/lib/hub-store'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { buildDeliverySchedule, nextDelivery, oneOffUnitPrice, skipCredit } from '@/lib/recharge/schedule'
import { computeAddImpact, computeSkipImpact, computeUsageImpact, projectedEconomics, oneOffCharge, nextDispatchDate } from '@/lib/recharge/mock'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
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
import { EmailPreferences } from './EmailPreferences'
import { CancelSaveFlow } from './CancelSaveFlow'
import { ReconsentNotice } from './ReconsentNotice'
import { ChangeSummary, type PendingChange } from './ChangeSummary'
import { ChangePolicyChoice } from '@/components/subscription/ChangePolicyChoice'
import { constraintsFor, describeConstraints } from '@/lib/changes/safety'

const DAY_OPTIONS = [1, 5, 10, 15, 20, 25, 28]

/** A date as a change summary says it: "15 September". */
function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

function countdownLabel(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'ships today'
  if (days === 1) return 'ships tomorrow'
  return `ships in ${days} days`
}

export function SubscriptionDashboard() {
  const {
    // Sign-out moved to the shell's header, where an account action belongs.
    subscription: sub, feedback,
    setDispatchDay, resume,
    swapLine, addLine, removeLine, setLineUsage, setLineChangePolicy, setDefaultChangePolicy, skipNext, submitFeedback, submitDimension,
    skipDelivery, unskipDelivery, rescheduleDelivery, addItemToDelivery, removeItemFromDelivery,
    snooze, applyDownsize, refresh,
  } = useHubStore()
  const { products } = useCatalogueProducts()
  const session = useHubStore((st) => st.session)
  const [changeLineId, setChangeLineId] = useState<string | null>(null)
  const [manageLineId, setManageLineId] = useState<string | null>(null)
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addFocusGroup, setAddFocusGroup] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingChange | null>(null)
  const [showJourney, setShowJourney] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  /** The catalogue entry behind each line, for photos and stat bars. */
  const productById = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products],
  )
  /**
   * One set of stat axes for the whole stack, derived from the products in it.
   * Shared axes are the point: four cards scored on the same four goals can be
   * compared at a glance, which four cards each picking their own cannot.
   */
  const axes = useMemo(() => {
    if (!sub) return []
    const owned = sub.lines.map((l) => productById[l.productId]).filter(Boolean)
    return owned.length > 0 ? selectShopAxes(owned, 4) : []
  }, [sub, productById])

  /**
   * Opens the real Stripe billing portal. This was an `alert()` — a browser
   * dialog, in production, on a paying member's billing panel — even though the
   * route it needed has existed all along.
   */
  async function openBillingPortal() {
    if (openingPortal) return
    setOpeningPortal(true)
    setPortalError(null)
    try {
      const res = await fetch('/api/hub/billing-portal', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      setPortalError(data.error ?? 'Could not open the billing portal.')
    } catch {
      setPortalError('Could not open the billing portal.')
    }
    setOpeningPortal(false)
  }

  const recommendations = useMemo(
    () => (sub ? recommendForSubscription(sub, feedback, products) : []),
    [sub, feedback, products],
  )
  const checkInPlan = useMemo(
    () => (sub ? buildCheckInQuestions(sub, products) : { questions: [], expectations: [] }),
    [sub, products],
  )
  const planConstraintsLabel = useMemo(
    () => (sub ? describeConstraints(constraintsFor(sub)) : null),
    [sub],
  )
  // Lines with a policy of their own, so the plan-wide control can say so rather
  // than implying it governs everything — changing the default deliberately
  // leaves these alone.
  const overriddenPolicyCount = useMemo(
    () => (sub ? sub.lines.filter((l) => l.changePolicy !== undefined).length : 0),
    [sub],
  )
  const deliveries = useMemo(
    () => (sub ? buildDeliverySchedule(sub, products, 6) : []),
    [sub, products],
  )
  const next = nextDelivery(deliveries)

  /**
   * Deep links from member emails.
   *
   *   /hub?change=<lineId>   → open the swap flow on that line
   *   /hub?add=<swapGroup>   → open the add sheet, that category first
   *
   * These are load-bearing, not a nicety: no product-change email asks the
   * member to do anything, so "you can change this in your hub" is the only way
   * they take control back — and it only works if the link lands on the thing
   * that can act, already pointed at the right product.
   *
   * Read from `window.location` rather than `useSearchParams` so the statically
   * rendered /hub route doesn't need a Suspense boundary, and cleared afterwards
   * so a refresh doesn't reopen a sheet the member already dismissed.
   */
  const deepLinkHandled = useRef(false)
  useEffect(() => {
    if (deepLinkHandled.current || !sub) return
    const params = new URLSearchParams(window.location.search)
    const changeLineId = params.get('change')
    const addGroup = params.get('add')
    if (!changeLineId && !addGroup) return
    deepLinkHandled.current = true

    if (changeLineId) {
      // The line may have gone since the email — a later removal, or a second
      // click. Landing on the add sheet beats landing on nothing.
      if (sub.lines.some((l) => l.id === changeLineId)) setChangeLineId(changeLineId)
      else setShowAdd(true)
    }
    if (addGroup) {
      setAddFocusGroup(addGroup)
      setShowAdd(true)
    }

    const url = new URL(window.location.href)
    url.searchParams.delete('change')
    url.searchParams.delete('add')
    window.history.replaceState({}, '', `${url.pathname}${url.search}`)
  }, [sub])

  // Subtle premium entrance — the one piece of hub motion that was already
  // right. It just never asked whether the visitor wanted any.
  useEffect(() => {
    if (!rootRef.current || reduced) return
    const els = rootRef.current.querySelectorAll('[data-reveal]')
    gsap.fromTo(els, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: 'power2.out' })
  }, [reduced])

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

  /**
   * A name, or nothing. The half of an email address before the `@` is not a
   * name — it is a login, and using it as one is the cheapest thing a paid
   * product can do.
   */
  const firstName = (session?.name ?? '').trim().split(/\s+/)[0]
  const greeting = firstName && !firstName.includes('@') ? `Hi ${firstName}` : 'Welcome back'

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
    <div ref={rootRef}>
      {/* Terms that have moved on since this member accepted them. Dismissible
          and non-blocking on purpose — see the component. */}
      <ReconsentNotice />

      {/* Greeting. `email.split('@')[0]` used to stand in for a name, which
          greeted paying members as "Hi lewissiara". A real first name if the
          account has one, and otherwise nothing pretending to be one. */}
      <div className="mb-6" data-reveal>
        <Eyebrow color="var(--accent)">Your subscription</Eyebrow>
        <h1 className="text-2xl font-black mt-1.5" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
          {greeting}
        </h1>
      </div>

      {sub.status === 'cancelled' ? (
        <Card className="text-center py-8" data-reveal>
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-full mb-3" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
            <Icon name="check" size={20} />
          </span>
          <p className="text-base font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
            Your subscription has ended
          </p>
          <p className="text-sm text-[var(--ink-2)] mt-1.5 leading-relaxed">
            You won&apos;t be charged again. Everything already sent is yours to keep, and you can start a new plan whenever you like.
          </p>
        </Card>
      ) : (
        <>
          {/* Hero — next box */}
          <div
            className="rounded-3xl p-5 mb-5 relative overflow-hidden"
            data-reveal
            style={{ background: 'var(--surface-1)', border: `1px solid ${tint('var(--accent)', 30)}` }}
          >
            <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full" style={{ background: `radial-gradient(circle, ${tint('var(--accent)', 22)}, transparent 70%)` }} />
            <div className="relative">
              {/* A scheduled free exit. Shown above everything else because it is
                  the most consequential thing about the plan right now — and
                  because the copy promised they could change their mind, which
                  is only true if there is somewhere to do it. */}
              {sub.scheduledExitMonth != null && (
                <div className="mb-4 rounded-xl px-3 py-2.5" style={{ background: tint('var(--tone-attention)', 10), border: `1px solid ${tint('var(--tone-attention)', 30)}` }}>
                  <p className="text-xs font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                    Your plan ends in {Math.max(0, sub.scheduledExitMonth - sub.monthsActive)} month
                    {Math.max(0, sub.scheduledExitMonth - sub.monthsActive) === 1 ? '' : 's'} — nothing to pay
                  </p>
                  <p className="text-[11px] text-[var(--ink-2)] mt-0.5 leading-relaxed">
                    Everything carries on as normal until then, which is what clears your balance.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    fullWidth={false}
                    className="mt-1 -ml-2 underline"
                    onClick={() => {
                      void fetch('/api/hub/subscription/cancel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mode: 'resume' }),
                      }).then(() => refresh())
                    }}
                  >
                    Actually, keep my plan
                  </Button>
                </div>
              )}
              {sub.status === 'paused' ? (
                <>
                  <div className="flex items-center gap-2 mb-1.5" style={{ color: 'var(--tone-attention)' }}>
                    <Icon name="pause" size={14} />
                    <Eyebrow color="var(--tone-attention)">{sub.snoozeUntil ? 'Snoozed' : 'Paused'}</Eyebrow>
                  </div>
                  <p className="text-lg font-black text-[var(--ink-1)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Your deliveries are on hold</p>
                  {sub.snoozeUntil && (
                    <p className="text-xs text-[var(--ink-2)] mb-3">Back on {new Date(sub.snoozeUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} — nothing billed until then.</p>
                  )}
                  <Button variant="primary" icon="play" onClick={resume} fullWidth={false} className="mt-1">Resume now</Button>
                </>
              ) : next ? (
                <>
                  <div className="flex items-center gap-2 mb-1.5" style={{ color: 'var(--accent)' }}>
                    <Icon name="truck" size={14} />
                    <Eyebrow color="var(--accent)">Your next box · {countdownLabel(next.date)}</Eyebrow>
                  </div>
                  <p className="text-2xl font-black text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                    {new Date(next.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>

                  {/* What is actually in it. The hub knew these products all
                      along and printed them as a comma-joined string; the same
                      data as tiles is the difference between a manifest and a
                      box you can picture arriving. */}
                  {next.items.length > 0 && (
                    <div className="flex items-center gap-2 mt-3.5">
                      {next.items.slice(0, 5).map((it, i) => (
                        <ProductTile
                          key={`${it.productId}-${i}`}
                          imageUrl={productById[it.productId]?.imageUrl}
                          slot={productById[it.productId]?.stackSlots[0]}
                          title={it.productTitle}
                          size={40}
                        />
                      ))}
                      {next.items.length > 5 && (
                        <span className="text-xs font-bold text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-display)' }}>
                          +{next.items.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-[var(--ink-2)] mt-2.5">
                    {next.items.map((it) => it.productTitle).slice(0, 3).join(', ')}{next.items.length > 3 ? ` +${next.items.length - 3} more` : ''}
                  </p>

                  <div className="flex gap-2 mt-4">
                    <Button variant="primary" icon="box" onClick={() => setSelectedDeliveryId(next.id)}>
                      Edit next box
                    </Button>
                    <Button variant="secondary" icon="plus" onClick={() => setShowAdd(true)} fullWidth={false} className="px-4">
                      Add
                    </Button>
                  </div>
                </>
              ) : (
                <EmptyState
                  icon="calendar"
                  title="No deliveries scheduled"
                  action={<Button variant="primary" size="sm" icon="plus" onClick={() => setShowAdd(true)}>Add a product</Button>}
                >
                  There&apos;s nothing due to ship. Add something to your plan and it&apos;ll appear here.
                </EmptyState>
              )}
            </div>
          </div>

          {/* What you're actually billed */}
          <div className="mb-5" data-reveal>
            <BillingSummary subscription={sub} deliveries={deliveries} />
          </div>

          {/* Delivery calendar */}
          <div className="mb-6" data-reveal>
            <DeliveryCalendar deliveries={deliveries} catalogue={products} onSelect={(d) => setSelectedDeliveryId(d.id)} />
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
          <div className="flex items-end justify-between gap-3 mt-8 mb-3" data-reveal>
            <div>
              <Eyebrow>Your stack</Eyebrow>
              <p className="text-xs font-semibold text-[var(--ink-2)] mt-1">
                {summary || `${sub.lines.length} products`}
              </p>
            </div>
            <Button variant="secondary" size="sm" icon="plus" onClick={() => setShowAdd(true)}>
              Add product
            </Button>
          </div>
          <div className="space-y-3" data-reveal>
            {sub.lines.map((line) => (
              <StackItemCard
                key={line.id}
                line={line}
                recommendation={recById[line.id]}
                product={productById[line.productId]}
                axes={axes}
                onChange={openChange}
                onManage={(id) => { setChangeLineId(null); setManageLineId(id) }}
                onMicroFeedback={submitDimension}
              />
            ))}
          </div>

          {/* Settings (collapsed) */}
          <div className="mt-8" data-reveal>
            <Disclosure
              summary="Plan & billing settings"
              open={showSettings}
              onOpenChange={setShowSettings}
            >
              <div className="space-y-4 pt-1">
                {/* Regular ship day */}
                <Card>
                  <p className="text-sm font-bold text-[var(--ink-1)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>Regular ship day</p>
                  <p className="text-xs text-[var(--ink-3)] mb-3">Boxes default to the {sub.dispatchDayOfMonth}th. Move any single box from the calendar.</p>
                  {/* `ariaLabel` per option: the visible label is a bare number,
                      and "17" on its own is not something anyone can act on. */}
                  <Segmented
                    label="Regular ship day"
                    value={sub.dispatchDayOfMonth}
                    onChange={(day) => {
                      if (day === sub.dispatchDayOfMonth) return
                      setPending({
                        title: 'Change your regular ship day',
                        subtitle: `The ${sub.dispatchDayOfMonth}${ordinalSuffix(sub.dispatchDayOfMonth)} → the ${day}${ordinalSuffix(day)} of the month`,
                        monthlyBefore: sub.flatMonthly,
                        monthlyAfter: sub.flatMonthly,
                        effectiveFrom: nextDispatchDate(day).toISOString(),
                        note: 'This moves every future box, not just the next one. Your payment date follows your ship day, and the amount is unchanged.',
                        confirmLabel: 'Change ship day',
                        onConfirm: () => setDispatchDay(day),
                      })
                    }}
                    options={DAY_OPTIONS.map((day) => ({
                      value: day,
                      label: day,
                      ariaLabel: `${day}${ordinalSuffix(day)} of the month`,
                    }))}
                  />
                </Card>

                {/* Marketing email, where a member can actually find it.
                    Withdrawal has to be as easy as giving (Art. 7(3)), and "as
                    easy" cannot mean hunting for a link in an old email. */}
                <EmailPreferences />

                {/* If a product becomes unavailable — the plan-wide default.
                    Per-product overrides live in each line's manage sheet. */}
                <Card>
                  <p className="text-sm font-bold text-[var(--ink-1)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>If something goes out of stock</p>
                  <p className="text-xs text-[var(--ink-3)] mb-3">
                    What we do by default. {overriddenPolicyCount > 0
                      ? `${overriddenPolicyCount} product${overriddenPolicyCount === 1 ? ' has' : 's have'} their own setting — change those on the product itself.`
                      : 'Set it per product from any product’s manage sheet.'}
                  </p>
                  <ChangePolicyChoice
                    policy={sub.defaultChangePolicy ?? 'auto-swap'}
                    onChange={setDefaultChangePolicy}
                    monthly={sub.flatMonthly}
                    constraintsLabel={planConstraintsLabel}
                  />
                </Card>

                {/* Billing */}
                <Card>
                  <p className="text-sm font-bold text-[var(--ink-1)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>Billing &amp; payment</p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-xs text-[var(--ink-2)]">
                      <Icon name="credit-card" size={14} className="text-[var(--ink-3)]" />
                      {sub.paymentMethod ? `${sub.paymentMethod.brand} ending ${sub.paymentMethod.last4}` : 'No card on file'}
                    </span>
                    <span className="text-[11px] text-[var(--ink-3)]">Direct debit · monthly</span>
                  </div>
                  {/* This was `alert()` — a browser dialog, in production, on a
                      paying member's billing panel — while the route it needed
                      sat unused. */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={openBillingPortal}
                    disabled={openingPortal}
                    className="mt-3"
                  >
                    {openingPortal ? 'Opening…' : 'Manage billing'}
                  </Button>
                  {portalError && <Note icon="alert-triangle" tone="attention" live="assertive" className="mt-3">{portalError}</Note>}
                </Card>

                {/* Pause / cancel — routed through the save flow */}
                <Button variant="ghost" icon="pause" onClick={() => setShowSave(true)}>
                  Pause or cancel
                </Button>
              </div>
            </Disclosure>
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
          onSetUsage={(level) => {
            const p = products.find((p) => p.id === manageLine.productId)
            if (!p) return
            const imp = computeUsageImpact(sub, manageLine.id, p, level)
            setPending({
              title: 'Change how much you get through',
              subtitle: manageLine.productTitle,
              monthlyBefore: imp.currentMonthly,
              monthlyAfter: imp.newMonthly,
              effectiveFrom: imp.effectiveFrom,
              confirmLabel: 'Confirm change',
              onConfirm: () => { setLineUsage(manageLine.id, p, level); setManageLineId(null) },
            })
          }}
          onSkip={() => {
            const imp = computeSkipImpact(sub, manageLine.id)
            setPending({
              title: 'Skip next delivery',
              subtitle: manageLine.productTitle,
              monthlyBefore: sub.flatMonthly,
              monthlyAfter: sub.flatMonthly,
              credit: imp.credit,
              effectiveFrom: imp.effectiveFrom,
              note: 'No box, no charge — its value is credited to your next payment. Your monthly plan is unchanged.',
              confirmLabel: 'Skip & credit',
              onConfirm: () => { skipNext(manageLine.id); setManageLineId(null) },
            })
          }}
          onExpedite={(qty) => {
            setPending({
              title: 'Get one now',
              subtitle: manageLine.productTitle,
              monthlyBefore: sub.flatMonthly,
              monthlyAfter: sub.flatMonthly,
              oneOffNow: oneOffCharge(manageLine, qty),
              effectiveFrom: new Date().toISOString(),
              note: 'A one-off charge now; it ships with your next box. Your monthly plan is unchanged.',
              confirmLabel: 'Confirm one-off',
              onConfirm: () => setManageLineId(null),
            })
          }}
          onRemove={() => { removeLine(manageLine.id); setManageLineId(null) }}
          onSetChangePolicy={(policy) => setLineChangePolicy(manageLine.id, policy)}
          onClose={() => setManageLineId(null)}
        />
      )}

      {selectedDelivery && (
        <DeliveryDetailSheet
          subscription={sub}
          delivery={selectedDelivery}
          catalogue={products}
          onSkip={() => {
            const credit = skipCredit(selectedDelivery)
            setPending({
              title: 'Skip this box',
              subtitle: new Date(selectedDelivery.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }),
              monthlyBefore: sub.flatMonthly,
              monthlyAfter: sub.flatMonthly,
              credit,
              effectiveFrom: selectedDelivery.date,
              note: credit > 0.01
                ? 'Nothing ships and nothing extra is charged — the value of the box is credited against your next payment. Your monthly plan is unchanged.'
                : 'Nothing was due to ship in this box, so there is nothing to credit. Your monthly plan is unchanged.',
              confirmLabel: 'Skip this box',
              onConfirm: () => skipDelivery(selectedDelivery.id),
            })
          }}
          onUnskip={() => {
            // The credit banked when it was skipped goes back. Worth confirming
            // for exactly that reason — "restore" sounds free and isn't.
            const credit = skipCredit(selectedDelivery)
            setPending({
              title: 'Restore this delivery',
              subtitle: new Date(selectedDelivery.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }),
              monthlyBefore: sub.flatMonthly,
              monthlyAfter: sub.flatMonthly,
              effectiveFrom: selectedDelivery.date,
              note: credit > 0.01
                ? `This box ships again, so the ${formatGBP(credit)} credited for skipping it no longer applies. Your monthly plan is unchanged.`
                : 'This box ships again. Your monthly plan is unchanged.',
              confirmLabel: 'Restore it',
              onConfirm: () => unskipDelivery(selectedDelivery.id),
            })
          }}
          onReschedule={(date) => {
            setPending({
              title: 'Move this delivery',
              subtitle: `${fmtDay(selectedDelivery.date)} → ${fmtDay(date.toISOString())}`,
              monthlyBefore: sub.flatMonthly,
              monthlyAfter: sub.flatMonthly,
              effectiveFrom: date.toISOString(),
              note: 'Moving a box changes when it ships, not what you pay — your payment date and monthly amount stay as they are.',
              confirmLabel: 'Move it',
              onConfirm: () => rescheduleDelivery(selectedDelivery.id, date),
            })
          }}
          onAddItem={(product) => {
            setPending({
              title: 'Add to this box', subtitle: product.title,
              monthlyBefore: sub.flatMonthly, monthlyAfter: sub.flatMonthly,
              oneOffNow: oneOffUnitPrice(product), effectiveFrom: selectedDelivery.date,
              note: 'A one-off added to this box only. Your monthly plan is unchanged.',
              confirmLabel: 'Add to box',
              onConfirm: () => addItemToDelivery(selectedDelivery.id, product),
            })
          }}
          onAddRecurring={(product) => {
            const imp = computeAddImpact(sub, product, products)
            setPending({
              title: 'Add to every delivery', subtitle: product.title,
              monthlyBefore: imp.currentMonthly, monthlyAfter: imp.newMonthly,
              effectiveFrom: imp.effectiveFrom, economics: projectedEconomics(product),
              confirmLabel: 'Add to plan',
              onConfirm: () => addLine(product, products),
            })
          }}
          onRemoveItem={(item) => {
            // A one-off never joined the plan, so undoing it just drops the
            // extra charge. A recurring line is the member giving up something
            // they have already paid for in the flat monthly — hence the credit.
            setPending({
              title: item.oneOff ? 'Remove this extra' : 'Leave this out of the box',
              subtitle: item.productTitle,
              monthlyBefore: sub.flatMonthly,
              monthlyAfter: sub.flatMonthly,
              credit: item.oneOff ? 0 : item.price,
              effectiveFrom: selectedDelivery.date,
              note: item.oneOff
                ? `A one-off you added to this box. Removing it takes the ${formatGBP(item.price)} back off this month’s bill; your plan is untouched.`
                : 'It stays on your plan and comes back next time — this box just won’t include it, and its value is credited against your next payment.',
              confirmLabel: item.oneOff ? 'Remove it' : 'Leave it out',
              onConfirm: () => removeItemFromDelivery(selectedDelivery.id, item),
            })
          }}
          onClose={() => setSelectedDeliveryId(null)}
        />
      )}

      {showAdd && (
        <AddProductSheet
          subscription={sub}
          catalogue={products}
          onAdd={(product) => {
            setShowAdd(false)
            const imp = computeAddImpact(sub, product, products)
            setPending({
              title: 'Add to your plan', subtitle: product.title,
              monthlyBefore: imp.currentMonthly, monthlyAfter: imp.newMonthly,
              effectiveFrom: imp.effectiveFrom, economics: projectedEconomics(product),
              confirmLabel: 'Add to plan',
              onConfirm: () => addLine(product, products),
            })
          }}
          focusSwapGroup={addFocusGroup}
          onClose={() => { setShowAdd(false); setAddFocusGroup(null) }}
        />
      )}

      {pending && <ChangeSummary change={pending} onClose={() => setPending(null)} />}

      {showSave && (
        <CancelSaveFlow
          subscription={sub}
          catalogue={products}
          recommendations={recommendations}
          onSnooze={(m) => { snooze(m); setShowSave(false) }}
          onDownsize={(ids) => { applyDownsize(ids); setShowSave(false) }}
          onSkipNext={() => { if (next) skipDelivery(next.id); setShowSave(false) }}
          onSwap={(lineId) => { setShowSave(false); openChange(lineId) }}
          // The flow drives the exit itself against the server, because the
          // settlement is a charge and a charge is not something the browser
          // gets to compute. All that is left here is reloading what changed.
          onExited={() => { void refresh(); setShowSave(false) }}
          onClose={() => setShowSave(false)}
        />
      )}
    </div>
  )
}
