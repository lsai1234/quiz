'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { DashboardSummary, MoneyWindow } from '@/lib/portal/dashboard'
import type { QuizFunnel } from '@/lib/analytics/funnel'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'
const RED = '#f87171'

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

  if (!data) return <p className="text-sm text-[var(--color-muted)]">{error ?? 'Loading…'}</p>

  const { summary, funnel } = data
  const { orders, subscriptions, actionRequired } = summary

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Dashboard
        </h1>
        <p className="text-sm text-[var(--color-muted)] mt-0.5">
          What needs you today, what the business did, and where the quiz is losing people.
        </p>
      </div>

      {/* ── Needs you ─────────────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Needs you</SectionTitle>
        {actionRequired.length === 0 ? (
          <p className="text-sm rounded-2xl border p-4" style={{ background: `color-mix(in srgb, ${GREEN} 7%, transparent)`, borderColor: `color-mix(in srgb, ${GREEN} 30%, transparent)`, color: GREEN }}>
            Nothing outstanding. Every order has been reviewed and nothing on a live plan has changed.
          </p>
        ) : (
          <div className="space-y-2">
            {actionRequired.map((a) => (
              <Link key={a.label} href={a.href}
                className="flex items-center justify-between gap-3 rounded-2xl border p-3.5"
                style={{ background: 'var(--color-surface)', borderColor: `color-mix(in srgb, ${AMBER} 30%, transparent)` }}>
                <span className="text-sm text-[var(--color-text-2)]">{a.label}</span>
                <span className="text-lg font-black shrink-0" style={{ color: AMBER, fontFamily: 'var(--font-display)' }}>{a.count}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Orders ────────────────────────────────────────────────────────── */}
      <section>
        <SectionTitle href="/portal/commerce/queue">Orders</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile n={orders.today} label="Raised today" colour="var(--color-text)" />
          <Tile n={orders.awaitingReview} label="Awaiting review" colour={orders.awaitingReview > 0 ? AMBER : 'var(--color-muted)'} />
          <Tile n={orders.readyToSend} label="Ready to send" colour={orders.readyToSend > 0 ? ACCENT : 'var(--color-muted)'} />
          <Tile n={orders.inFlight} label="With the supplier" colour="var(--color-muted)" />
        </div>
        {orders.failed > 0 && (
          <p className="text-xs mt-2" style={{ color: RED }}>
            {orders.failed} order{orders.failed === 1 ? '' : 's'} failed to reach PowerBody — retry {orders.failed === 1 ? 'it' : 'them'} from the order page.
          </p>
        )}
      </section>

      {/* ── Money ─────────────────────────────────────────────────────────── */}
      <section>
        <SectionTitle href="/portal/commerce/financials">This month</SectionTitle>
        <MonthCard w={summary.month} />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <SmallWindow label="Last 24 hours" w={summary.today} />
          <SmallWindow label="Last 7 days" w={summary.last7} />
        </div>
      </section>

      {/* ── Subscriptions ─────────────────────────────────────────────────── */}
      <section>
        <SectionTitle href="/portal/commerce/subscriptions">Subscriptions</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <Tile n={subscriptions.active} label="Active members" colour="var(--color-text)" />
          <Tile n={money(subscriptions.mrr)} label="Per month" colour={ACCENT} />
          <Tile n={money(subscriptions.arpu)} label="Each" colour="var(--color-muted)" />
        </div>
      </section>

      {/* ── Quiz funnel ───────────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Where people fall off</SectionTitle>
        {funnel.started === 0 ? (
          <p className="text-sm text-[var(--color-muted)] rounded-2xl border border-[var(--color-border)] p-4">
            No quiz sessions in the last {data.windowDays} days yet. Drop-off appears here as soon as people start
            answering — measured from our own events, with no third-party tracking.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <Tile n={funnel.started} label="Started the quiz" colour="var(--color-text)" />
              <Tile n={funnel.completed} label="Finished it" colour="var(--color-text)" />
              <Tile n={funnel.startedCheckout} label="Reached checkout" colour="var(--color-text)" />
              <Tile n={funnel.purchased} label="Bought" colour={ACCENT} note={pct(funnel.conversionPct)} />
            </div>

            {funnel.worstStep && (
              <p className="text-xs rounded-xl px-3 py-2 mb-3" style={{ background: `color-mix(in srgb, ${AMBER} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${AMBER} 30%, transparent)`, color: AMBER }}>
                Biggest single drop: <strong>{funnel.worstStep.stepId}</strong> loses {funnel.worstStep.dropped} session
                {funnel.worstStep.dropped === 1 ? '' : 's'} ({pct(funnel.worstStep.dropOffPct)} of everyone who got there).
              </p>
            )}

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2">
              {funnel.steps.map((s) => (
                <div key={s.stepId}>
                  <div className="flex items-baseline justify-between gap-2 text-[11px] mb-1">
                    <span className="font-semibold text-[var(--color-text)]">{s.stepId}</span>
                    <span className="text-[var(--color-muted)] whitespace-nowrap">
                      {s.sessions} left
                      {s.dropped > 0 && <span style={{ color: AMBER }}> · −{s.dropped} ({pct(s.dropOffPct)})</span>}
                      {s.medianSeconds != null && ` · ${Math.round(s.medianSeconds)}s`}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, s.ofStartPct * 100)}%`, background: s.dropOffPct > 0.2 ? AMBER : ACCENT }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function SectionTitle({ children, href }: { children: React.ReactNode; href?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-2">
      <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        {children}
      </h2>
      {href && <Link href={href} className="text-[11px] font-bold" style={{ color: ACCENT }}>Open →</Link>}
    </div>
  )
}

function Tile({ n, label, colour, note }: { n: number | string; label: string; colour: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-center">
      <p className="text-xl font-black" style={{ color: colour, fontFamily: 'var(--font-display)' }}>{n}</p>
      <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{label}</p>
      {note && <p className="text-[10px]" style={{ color: ACCENT }}>{note}</p>}
    </div>
  )
}

function MonthCard({ w }: { w: MoneyWindow }) {
  const colour = w.grossProfit > 0 ? GREEN : w.grossProfit < 0 ? RED : 'var(--color-muted)'
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)]">Revenue</p>
          <p className="text-3xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{money(w.revenue)}</p>
          <p className="text-[11px] text-[var(--color-muted)]">{w.orders} order{w.orders === 1 ? '' : 's'} · {money(w.aov)} average</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)]">Gross profit</p>
          <p className="text-3xl font-black" style={{ color: colour, fontFamily: 'var(--font-display)' }}>{money(w.grossProfit)}</p>
          <p className="text-[11px] text-[var(--color-muted)]">
            {pct(w.marginPct)} after {money(w.cogs)} goods + {money(w.delivery)} delivery
          </p>
        </div>
      </div>
      {w.ordersWithUnknownCost > 0 && (
        <p className="text-[11px] mt-2" style={{ color: AMBER }}>
          {w.ordersWithUnknownCost} order{w.ordersWithUnknownCost === 1 ? '' : 's'} have no supplier cost, so they are
          left out of the profit above.
        </p>
      )}
    </div>
  )
}

function SmallWindow({ label, w }: { label: string; w: MoneyWindow }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5">
      <p className="text-[10px] uppercase font-bold text-[var(--color-muted)]">{label}</p>
      <p className="text-lg font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{money(w.revenue)}</p>
      <p className="text-[11px] text-[var(--color-muted)]">
        {w.orders} order{w.orders === 1 ? '' : 's'} · {money(w.grossProfit)} profit
      </p>
    </div>
  )
}
