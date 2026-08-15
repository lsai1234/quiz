'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, ChargeMeter } from '@/components/system'
import type { DashboardSummary, MoneyWindow } from '@/lib/portal/dashboard'
import type { QuizFunnel } from '@/lib/analytics/funnel'

const money = (n: number) => `£${n.toFixed(2)}`
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`

interface Payload {
  windowDays: number
  summary: DashboardSummary
  funnel: QuizFunnel
}

/**
 * The Founders Hub front page.
 *
 * Ordered by what a founder can do something about: what needs deciding today,
 * then what the money did, then where the quiz is losing people. Every block
 * links to the place you would act — a dashboard that only tells you things is a
 * report, not a hub.
 */
export default function HubDashboard() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/portal/dashboard')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not load the dashboard.'))
  }, [])

  if (!data) {
    return (
      <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>{error ?? 'Loading…'}</p>
    )
  }

  const { summary, funnel } = data
  const { orders, subscriptions, actionRequired } = summary

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-8)' }}>
      <div>
        <h1
          style={{
            fontSize: 'var(--text-display)',
            fontWeight: 'var(--weight-display)',
            fontFamily: 'var(--font-display)',
            letterSpacing: 'var(--tracking-display)',
            lineHeight: 'var(--leading-tight)',
            color: 'var(--ink-1)',
          }}
        >
          Dashboard
        </h1>
        <p
          style={{
            fontSize: 'var(--text-body)',
            lineHeight: 'var(--leading-loose)',
            color: 'var(--ink-3)',
            marginTop: 'var(--space-2)',
          }}
        >
          What needs you today, what the business did, and where the quiz is losing people.
        </p>
      </div>

      {/* ── Needs you ─────────────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Needs you</SectionTitle>

        {/* Notices come first: a VAT deadline outranks any queue. */}
        <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
          {summary.notices.map((n) => (
            <Link key={n.id} href={n.href} className="block">
              <Card tone={n.tone === 'act' ? 'critical' : 'attention'} padding="tight" interactive>
                <p
                  style={{
                    fontSize: 'var(--text-body)',
                    fontWeight: 'var(--weight-strong)',
                    fontFamily: 'var(--font-display)',
                    color: n.tone === 'act' ? 'var(--tone-critical)' : 'var(--tone-attention)',
                  }}
                >
                  {n.label}
                </p>
                <p
                  style={{
                    fontSize: 'var(--text-meta)',
                    lineHeight: 'var(--leading-loose)',
                    color: 'var(--ink-2)',
                    marginTop: 'var(--space-1)',
                  }}
                >
                  {n.detail}
                </p>
              </Card>
            </Link>
          ))}

          {actionRequired.length === 0 && summary.notices.length === 0 ? (
            <Card tone="positive" padding="tight">
              <p style={{ fontSize: 'var(--text-body)', color: 'var(--tone-positive)' }}>
                Nothing outstanding. Every order has been reviewed and nothing on a live plan has changed.
              </p>
            </Card>
          ) : (
            actionRequired.map((a) => (
              <Link key={a.label} href={a.href} className="block">
                <Card tone="attention" padding="tight" interactive>
                  <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }}>
                    <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>{a.label}</span>
                    <span
                      className="shrink-0"
                      style={{
                        fontSize: 'var(--text-title)',
                        fontWeight: 'var(--weight-display)',
                        fontFamily: 'var(--font-display)',
                        color: 'var(--tone-attention)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {a.count}
                    </span>
                  </div>
                </Card>
              </Link>
            ))
          )}
        </div>
      </section>

      {/* ── Orders ────────────────────────────────────────────────────────── */}
      <section>
        <SectionTitle href="/founderhub/commerce/queue">Orders</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 'var(--space-3)' }}>
          <Tile n={orders.today} label="Raised today" colour="var(--ink-1)" />
          <Tile
            n={orders.awaitingReview}
            label="Awaiting review"
            colour={orders.awaitingReview > 0 ? 'var(--tone-attention)' : 'var(--ink-3)'}
          />
          <Tile
            n={orders.readyToSend}
            label="Ready to send"
            colour={orders.readyToSend > 0 ? 'var(--accent)' : 'var(--ink-3)'}
          />
          <Tile n={orders.inFlight} label="With the supplier" colour="var(--ink-3)" />
        </div>
        {orders.failed > 0 && (
          <p
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--tone-critical)',
              marginTop: 'var(--space-2)',
            }}
          >
            {orders.failed} order{orders.failed === 1 ? '' : 's'} failed to reach PowerBody — retry{' '}
            {orders.failed === 1 ? 'it' : 'them'} from the order page.
          </p>
        )}
      </section>

      {/* ── Money ─────────────────────────────────────────────────────────── */}
      <section>
        <SectionTitle href="/founderhub/commerce/financials">This month</SectionTitle>
        <MonthCard w={summary.month} />
        <div className="grid grid-cols-2" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          <SmallWindow label="Last 24 hours" w={summary.today} />
          <SmallWindow label="Last 7 days" w={summary.last7} />
        </div>
      </section>

      {/* ── Subscriptions ─────────────────────────────────────────────────── */}
      <section>
        <SectionTitle href="/founderhub/commerce/subscriptions">Subscriptions</SectionTitle>
        <div className="grid grid-cols-3" style={{ gap: 'var(--space-3)' }}>
          <Tile n={subscriptions.active} label="Active members" colour="var(--ink-1)" />
          <Tile n={money(subscriptions.mrr)} label="Per month" colour="var(--accent)" />
          <Tile n={money(subscriptions.arpu)} label="Each" colour="var(--ink-3)" />
        </div>
      </section>

      {/* ── Quiz funnel ───────────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Where people fall off</SectionTitle>
        {funnel.started === 0 ? (
          <Card elevation={1}>
            <p style={{ fontSize: 'var(--text-body)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-3)' }}>
              No quiz sessions in the last {data.windowDays} days yet. Drop-off appears here as soon as people start
              answering — measured from our own events, with no third-party tracking.
            </p>
          </Card>
        ) : (
          <>
            <div
              className="grid grid-cols-2 sm:grid-cols-4"
              style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}
            >
              <Tile n={funnel.started} label="Started the quiz" colour="var(--ink-1)" />
              <Tile n={funnel.completed} label="Finished it" colour="var(--ink-1)" />
              <Tile n={funnel.startedCheckout} label="Reached checkout" colour="var(--ink-1)" />
              <Tile n={funnel.purchased} label="Bought" colour="var(--accent)" note={pct(funnel.conversionPct)} />
            </div>

            {funnel.worstStep && (
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <Card tone="attention" padding="tight">
                  <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--tone-attention)' }}>
                    Biggest single drop: <strong>{funnel.worstStep.stepId}</strong> loses {funnel.worstStep.dropped}{' '}
                    session{funnel.worstStep.dropped === 1 ? '' : 's'} ({pct(funnel.worstStep.dropOffPct)} of everyone
                    who got there).
                  </p>
                </Card>
              </div>
            )}

            <Card elevation={1}>
              <div className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
                {funnel.steps.map((s) => (
                  <div key={s.stepId}>
                    <div
                      className="flex items-baseline justify-between"
                      style={{ gap: 'var(--space-2)', fontSize: 'var(--text-meta)', marginBottom: 'var(--space-2)' }}
                    >
                      <span style={{ fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>{s.stepId}</span>
                      <span className="whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
                        {s.sessions} left
                        {s.dropped > 0 && (
                          <span style={{ color: 'var(--tone-attention)' }}>
                            {' '}
                            · −{s.dropped} ({pct(s.dropOffPct)})
                          </span>
                        )}
                        {s.medianSeconds != null && ` · ${Math.round(s.medianSeconds)}s`}
                      </span>
                    </div>
                    {/* A proportion, so it is poured rather than filled. The row
                        above already names it and gives the figures, so the
                        meter carries no text of its own. */}
                    <ChargeMeter
                      value={Math.max(2, s.ofStartPct * 100)}
                      label={`${s.stepId} — ${s.sessions} sessions left`}
                      tone={s.dropOffPct > 0.2 ? 'attention' : 'accent'}
                      size="sm"
                      showValue={false}
                    />
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </section>
    </div>
  )
}

function SectionTitle({ children, href }: { children: React.ReactNode; href?: string }) {
  return (
    <div
      className="flex items-baseline justify-between"
      style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}
    >
      <h2
        style={{
          fontSize: 'var(--text-micro)',
          fontWeight: 'var(--weight-strong)',
          fontFamily: 'var(--font-display)',
          letterSpacing: 'var(--tracking-eyebrow)',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
        }}
      >
        {children}
      </h2>
      {href && (
        <Link
          href={href}
          className="system-focus"
          style={{
            fontSize: 'var(--text-meta)',
            fontWeight: 'var(--weight-strong)',
            fontFamily: 'var(--font-display)',
            color: 'var(--accent)',
            borderRadius: 'var(--radius-chip)',
          }}
        >
          Open →
        </Link>
      )}
    </div>
  )
}

function Tile({ n, label, colour, note }: { n: number | string; label: string; colour: string; note?: string }) {
  return (
    <Card elevation={1} padding="tight" className="text-center">
      <p
        style={{
          fontSize: 'var(--text-title)',
          fontWeight: 'var(--weight-display)',
          fontFamily: 'var(--font-display)',
          letterSpacing: 'var(--tracking-title)',
          color: colour,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {n}
      </p>
      <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>{label}</p>
      {note && <p style={{ fontSize: 'var(--text-micro)', color: 'var(--accent)' }}>{note}</p>}
    </Card>
  )
}

function MonthCard({ w }: { w: MoneyWindow }) {
  const colour =
    w.grossProfit > 0 ? 'var(--tone-positive)' : w.grossProfit < 0 ? 'var(--tone-critical)' : 'var(--ink-3)'

  return (
    <Card elevation={2}>
      <div className="flex items-baseline justify-between flex-wrap" style={{ gap: 'var(--space-4)' }}>
        <div>
          <Label>Revenue</Label>
          <Figure colour="var(--ink-1)">{money(w.revenue)}</Figure>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
            {w.orders} order{w.orders === 1 ? '' : 's'} · {money(w.aov)} average
          </p>
        </div>
        <div className="text-right">
          <Label>Gross profit</Label>
          <Figure colour={colour}>{money(w.grossProfit)}</Figure>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
            {pct(w.marginPct)} after {money(w.cogs)} goods + {money(w.delivery)} delivery
          </p>
        </div>
      </div>
      {w.ordersWithUnknownCost > 0 && (
        <p
          style={{
            fontSize: 'var(--text-meta)',
            color: 'var(--tone-attention)',
            marginTop: 'var(--space-3)',
            lineHeight: 'var(--leading-loose)',
          }}
        >
          {w.ordersWithUnknownCost} order{w.ordersWithUnknownCost === 1 ? '' : 's'} have no supplier cost, so they are
          left out of the profit above.
        </p>
      )}
    </Card>
  )
}

function SmallWindow({ label, w }: { label: string; w: MoneyWindow }) {
  return (
    <Card elevation={1} padding="tight">
      <Label>{label}</Label>
      <p
        style={{
          fontSize: 'var(--text-title)',
          fontWeight: 'var(--weight-display)',
          fontFamily: 'var(--font-display)',
          letterSpacing: 'var(--tracking-title)',
          color: 'var(--ink-1)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {money(w.revenue)}
      </p>
      <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
        {w.orders} order{w.orders === 1 ? '' : 's'} · {money(w.grossProfit)} profit
      </p>
    </Card>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 'var(--text-micro)',
        fontWeight: 'var(--weight-strong)',
        fontFamily: 'var(--font-display)',
        letterSpacing: 'var(--tracking-eyebrow)',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
      }}
    >
      {children}
    </p>
  )
}

function Figure({ children, colour }: { children: React.ReactNode; colour: string }) {
  return (
    <p
      style={{
        fontSize: 'var(--text-display)',
        fontWeight: 'var(--weight-display)',
        fontFamily: 'var(--font-display)',
        letterSpacing: 'var(--tracking-display)',
        lineHeight: 'var(--leading-tight)',
        color: colour,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </p>
  )
}
