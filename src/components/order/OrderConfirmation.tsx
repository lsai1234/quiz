'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/analytics/events'
import type { ConfirmationResponse } from '@/lib/orders/confirmation'
import { ReceiptPrinter } from '@/components/receipt/ReceiptPrinter'
import { receiptFromConfirmation } from '@/lib/receipt/build'

const ACCENT = '#00D4FF'
const AMBER = '#fbbf24'

/**
 * The order confirmation screen.
 *
 * The rule that shapes this component: **confirmation is earned, never
 * assumed.** It initialises in `unresolved` and renders NOTHING that implies
 * success — no heading, no tick, no skeleton shaped like a receipt — until the
 * server has said `confirmed` or `processing` for a real session (OC-F-002,
 * OC-F-003). There is deliberately no default success copy anywhere in this
 * file, not even as a fallback, because a fallback is exactly what renders on
 * the unhappy path.
 *
 * It is also a pure presentation layer. It triggers no fulfilment and changes no
 * state; the webhooks did that before this ever loaded. Refreshing it a hundred
 * times costs nothing (OC-F-014).
 */

type Resolved = { status: 'unresolved' } | { status: 'ready'; data: ConfirmationResponse }

const POLL_INTERVAL_MS = 3_000
const POLL_CEILING_MS = 60_000

export function OrderConfirmation({ sessionId, mockOrderId }: { sessionId: string | null; mockOrderId: string | null }) {
  const [resolved, setResolved] = useState<Resolved>({ status: 'unresolved' })
  const startedAt = useRef(Date.now())
  const reported = useRef(false)

  const load = useCallback(async (): Promise<ConfirmationResponse | null> => {
    const params = new URLSearchParams()
    if (sessionId) params.set('session_id', sessionId)
    if (mockOrderId) params.set('order', mockOrderId)
    try {
      const res = await fetch(`/api/orders/confirmation?${params}`, { cache: 'no-store' })
      if (!res.ok) return null
      return (await res.json()) as ConfirmationResponse
    } catch {
      return null
    }
  }, [sessionId, mockOrderId])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function tick() {
      const data = await load()
      if (cancelled) return

      // A failed fetch must not flip a confirmed screen into recovery — leave
      // what's there and try again.
      if (!data) {
        timer = setTimeout(tick, POLL_INTERVAL_MS)
        return
      }

      setResolved({ status: 'ready', data })

      // Fire the purchase event exactly once, and only for a genuinely confirmed
      // order the server has not already reported (OC-F-090). Async payments
      // report here, when they clear — not on first render (OC-F-094).
      if (data.state === 'confirmed' && data.analytics && !data.analytics.alreadyReported && !reported.current) {
        reported.current = true
        track('purchase', {
          transaction_id: data.analytics.transactionId,
          journey_variant: data.analytics.journeyVariant,
          value: data.order ? data.order.totals.total / 100 : undefined,
          currency: data.order?.currency,
        })
      }

      // Keep polling only while a payment is genuinely still clearing.
      if (data.state === 'processing' && Date.now() - startedAt.current < POLL_CEILING_MS) {
        timer = setTimeout(tick, POLL_INTERVAL_MS)
      }
    }

    void tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [load])

  // ── Unresolved: the only honest thing to show is that we're checking ──
  if (resolved.status === 'unresolved') {
    return (
      <Shell>
        <div role="status" aria-live="polite" className="text-center py-16">
          <div
            className="w-10 h-10 mx-auto mb-4 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: `${ACCENT} transparent ${ACCENT} ${ACCENT}` }}
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--color-text-2)]">Checking your order…</p>
        </div>
      </Shell>
    )
  }

  const { data } = resolved
  if (data.state === 'recovery') return <Recovery />
  if (data.state === 'processing') return <Processing data={data} timedOut={Date.now() - startedAt.current >= POLL_CEILING_MS} />
  return <Confirmed data={data} />
}

// ─── Layout ──────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-5 py-10" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-lg mx-auto">{children}</div>
    </main>
  )
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 mt-4">
      {title && (
        <h2
          className="text-[10px] font-bold tracking-widest uppercase mb-3"
          style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
        >
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}

/** Never a dead end: every state gets a way back into the shop (OC-F-072). */
function BackToShop({ label = 'Back to shop' }: { label?: string }) {
  return (
    <Link
      href="/shop"
      className="block w-full text-center py-3.5 rounded-2xl text-sm font-bold border border-[var(--color-border)] text-[var(--color-text)] mt-3"
      style={{ fontFamily: 'var(--font-display)' }}
      onClick={() => track('confirmation_cta', { cta: 'back_to_shop' })}
    >
      {label}
    </Link>
  )
}

function PrimaryCta({ href, label, cta }: { href: string; label: string; cta: string }) {
  return (
    <Link
      href={href}
      className="block w-full text-center py-3.5 rounded-2xl text-sm font-bold mt-5"
      style={{ background: ACCENT, color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
      onClick={() => track('confirmation_cta', { cta })}
    >
      {label}
    </Link>
  )
}

// ─── V7 Recovery ─────────────────────────────────────────────────────────────

/**
 * No blame, and — critically — no suggestion that they have been charged. We
 * genuinely don't know that they have, and telling someone their payment failed
 * when it is merely unverifiable is the worse of the two errors (OC-F-016).
 */
function Recovery() {
  return (
    <Shell>
      <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        We can&apos;t find that order
      </h1>
      <p className="text-sm text-[var(--color-text-2)] mt-2 leading-relaxed">
        This link may have expired, or the checkout wasn&apos;t completed. Nothing here means
        anything has gone wrong with a payment — if you were charged, the confirmation email
        has your order details.
      </p>
      <Card>
        <p className="text-xs text-[var(--color-text-2)] leading-relaxed">
          Still stuck? Email us and we&apos;ll find it — include the email address you used at
          checkout.
        </p>
      </Card>
      <PrimaryCta href="/shop" label="Back to shop" cta="recovery_shop" />
    </Shell>
  )
}

// ─── V6 Processing ───────────────────────────────────────────────────────────

/**
 * Placed, not paid. The distinction is the whole point: some payment methods
 * (Bacs, bank transfer) take days to clear, and telling someone their order is
 * confirmed before the money lands is a claim we can't stand behind.
 */
function Processing({ data, timedOut }: { data: ConfirmationResponse; timedOut: boolean }) {
  return (
    <Shell>
      <div aria-live="polite">
        <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Your order is placed
        </h1>
        <p className="text-sm text-[var(--color-text-2)] mt-2 leading-relaxed">
          We&apos;re just confirming your payment. This can take a little while with some payment
          methods — you don&apos;t need to do anything, and you don&apos;t need to stay on this page.
        </p>
      </div>
      {data.order && (
        <Card title="Order reference">
          <p className="text-lg font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {data.order.reference}
          </p>
        </Card>
      )}
      {timedOut && (
        <Card>
          <p className="text-xs text-[var(--color-text-2)] leading-relaxed">
            Still confirming. We&apos;ll email you the moment it clears — no need to wait here.
          </p>
        </Card>
      )}
      <BackToShop />
    </Shell>
  )
}

// ─── V1–V5 Confirmed ─────────────────────────────────────────────────────────

/**
 * The confirmed screen prints its own receipt.
 *
 * Everything the old cards carried — reference, line items, totals, delivery
 * window, address, plan — is on the paper, because that is what a receipt is
 * for and repeating it underneath in a second layout only invites the two to
 * disagree. The cards that remain are the ones a receipt has no business
 * printing: why this stack was chosen, and where to go next.
 */
function Confirmed({ data }: { data: ConfirmationResponse }) {
  const { order, subscription, personalisation, variant } = data
  const isSub = variant === 'personalised_subscription' || variant === 'standard_subscription'
  const name = personalisation?.firstName
  const receipt = receiptFromConfirmation(data)

  return (
    <Shell>
      <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        {isSub ? "You're subscribed" : 'Your order is confirmed'}
        {name ? `, ${name}` : ''}
      </h1>
      {personalisation?.goalPathLabel && (
        <p className="text-sm mt-1" style={{ color: ACCENT }}>
          Your {personalisation.goalPathLabel} stack
        </p>
      )}

      {order?.emailMasked && (
        <p className="text-sm text-[var(--color-text-2)] mt-2 leading-relaxed">
          We&apos;ve emailed your confirmation to <strong>{order.emailMasked}</strong>.
        </p>
      )}

      {receipt && <ReceiptPrinter receipt={receipt} className="mt-6 mb-2" />}

      {order?.refunded && (
        <Card>
          <p className="text-xs" style={{ color: AMBER }}>
            A refund has been issued on this order.
          </p>
        </Card>
      )}

      {subscription && (
        <Card>
          <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
            No minimum term. Cancel any time from your account before your next payment — you&apos;ll
            only settle the balance on anything already sent to you.
          </p>
        </Card>
      )}

      {personalisation && personalisation.rationale.length > 0 && (
        <Card title="Why this stack">
          <ul className="space-y-3">
            {personalisation.rationale.map((r, i) => (
              <li key={i}>
                <p className="text-sm font-semibold text-[var(--color-text)]">{r.name}</p>
                <p className="text-xs text-[var(--color-text-2)] leading-relaxed">{r.copy}</p>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-[var(--color-muted)] mt-3 leading-relaxed">
            Chosen from what you told us about your goals and preferences. This is a product
            recommendation, not health advice.
          </p>
        </Card>
      )}

      {isSub ? (
        <PrimaryCta href="/myhub" label="Manage your subscription" cta="manage_subscription" />
      ) : (
        <PrimaryCta href="/shop" label="Continue shopping" cta="continue_shopping" />
      )}
      {isSub && <BackToShop label="Keep exploring" />}
      {!isSub && !personalisation && (
        <Link
          href="/"
          className="block w-full text-center py-3 rounded-2xl text-sm font-bold border border-[var(--color-border)] text-[var(--color-text-2)] mt-3"
          style={{ fontFamily: 'var(--font-display)' }}
          onClick={() => track('confirmation_cta', { cta: 'take_quiz' })}
        >
          Take the quiz — get a stack matched to your goals
        </Link>
      )}
    </Shell>
  )
}
