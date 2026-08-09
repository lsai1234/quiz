'use client'

import { useEffect, useState } from 'react'
import type { PartnerDashboard as Data } from '@/lib/partners/dashboard'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'
const RED = '#f87171'

const money = (n: number) => `£${n.toFixed(2)}`
const pct = (n: number) => `${Math.round(n * 100)}%`
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * `/partner` — a partner's own account.
 *
 * Two tabs, because there are exactly two questions: how am I doing, and what
 * is my deal. Everything on both is theirs; nothing here can reach another
 * partner's numbers, because the server builds it from the session and takes no
 * id from the browser at all.
 */
export function PartnerDashboard() {
  const [data, setData] = useState<Data | null>(null)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<'money' | 'terms'>('money')

  useEffect(() => {
    fetch('/api/partner/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unauthorised'))))
      .then(setData)
      .catch(() => setFailed(true))
  }, [])

  async function logout() {
    await fetch('/api/partner/logout', { method: 'POST' })
    window.location.reload()
  }

  if (failed) {
    return (
      <Shell onLogout={logout} name="">
        <p className="text-sm text-[var(--color-muted)]">
          We couldn’t load your account. Try refreshing — if it keeps happening, get in touch.
        </p>
      </Shell>
    )
  }
  if (!data) {
    return (
      <Shell onLogout={logout} name="">
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      </Shell>
    )
  }

  return (
    <Shell onLogout={logout} name={data.partner.name}>
      <div className="flex gap-1 mb-4">
        {(['money', 'terms'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3.5 py-1.5 rounded-full text-xs font-bold"
            style={{
              background: tab === t ? ACCENT : 'var(--color-surface-2)',
              color: tab === t ? 'var(--color-bg)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            {t === 'money' ? 'How you’re doing' : 'Your deal'}
          </button>
        ))}
      </div>

      {tab === 'money' ? <MoneyTab data={data} /> : <TermsTab data={data} />}
    </Shell>
  )
}

function Shell({ children, name, onLogout }: { children: React.ReactNode; name: string; onLogout: () => void }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)]" style={{ background: 'var(--color-surface)' }}>
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <span className="text-sm font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            CHRGD <span style={{ color: ACCENT }}>Partners</span>
          </span>
          <div className="flex items-center gap-3">
            {name && <span className="text-[11px] font-semibold text-[var(--color-muted)] hidden sm:inline">{name}</span>}
            <button onClick={onLogout} className="text-xs font-semibold text-[var(--color-muted)] underline">Sign out</button>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-5 py-6">{children}</main>
    </div>
  )
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] p-4 mb-3" style={{ background: 'var(--color-surface)' }}>
      <h2 className="text-xs font-black text-[var(--color-text)] mb-0.5" style={{ fontFamily: 'var(--font-display)' }}>{title}</h2>
      {desc && <p className="text-[11px] text-[var(--color-muted)] mb-3 leading-snug">{desc}</p>}
      {children}
    </section>
  )
}

function Figure({ label, value, tone, note }: { label: string; value: string; tone?: string; note?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="text-lg font-black" style={{ color: tone ?? 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{value}</p>
      {note && <p className="text-[10px] text-[var(--color-muted)] leading-snug mt-0.5">{note}</p>}
    </div>
  )
}

function MoneyTab({ data }: { data: Data }) {
  const { balance, totals, thisMonth, earnings, payouts, invoices } = data

  return (
    <>
      <Card
        title="What you’re owed"
        desc="Commission is held until the 14-day return window on the order has passed. Only then can it be paid."
      >
        <div className="grid grid-cols-2 gap-2">
          <Figure
            label="Ready to pay"
            value={money(balance.payableNow)}
            tone={balance.payableNow > 0 ? GREEN : undefined}
            note={balance.payableNow > 0 ? 'In the next payout run' : 'Nothing cleared yet'}
          />
          <Figure
            label="Still in the window"
            value={money(balance.accrued)}
            tone={balance.accrued > 0 ? AMBER : undefined}
            note="Earned, not yet clear"
          />
          <Figure
            label="On its way"
            value={money(balance.invoiced)}
            tone={balance.invoiced > 0 ? ACCENT : undefined}
            note={balance.invoiced > 0 ? 'Invoiced, being sent' : undefined}
          />
          <Figure label="Paid to you" value={money(balance.paid)} />
          {/* Only when there is something to say. A permanent £0.00 reversed
              tile is a row of the grid spent telling someone nothing went
              wrong, and it leaves the four that matter sitting unevenly. */}
          {balance.reversed > 0 && (
            <Figure
              label="Reversed"
              value={money(balance.reversed)}
              tone={RED}
              note="Orders that were refunded"
            />
          )}
        </div>
        <p className="text-[11px] text-[var(--color-muted)] leading-snug mt-3">{data.wording.paid}</p>
      </Card>

      <Card title="What you’ve brought in">
        <div className="grid grid-cols-2 gap-2">
          <Figure label="Orders, all time" value={String(totals.orders)} note={totals.subscriptions > 0 ? `${totals.subscriptions} on subscription` : undefined} />
          <Figure label="Their spend" value={money(totals.revenue)} />
          <Figure label="Orders this month" value={String(thisMonth.orders)} />
          <Figure label="Earned this month" value={money(thisMonth.earned)} tone={thisMonth.earned > 0 ? ACCENT : undefined} />
        </div>
        {totals.reversed > 0 && (
          <p className="text-[11px] text-[var(--color-muted)] leading-snug mt-3">
            {totals.reversed} order{totals.reversed === 1 ? ' was' : 's were'} refunded and {totals.reversed === 1 ? 'is' : 'are'} not counted above.
          </p>
        )}
      </Card>

      <Card
        title={`Your earnings (${earnings.length})`}
        desc="Each order you brought in, and the date its commission clears."
      >
        {earnings.length === 0 ? (
          <p className="text-[11px] text-[var(--color-muted)]">Nothing yet. Share your link and it’ll show up here.</p>
        ) : (
          <div className="space-y-2">
            {earnings.slice(0, 50).map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3 text-[11px]">
                <div className="min-w-0">
                  <p className="text-[var(--color-text-2)]">
                    {day(e.at)} · {e.kind === 'first' ? 'first order' : 'renewal'} · {pct(e.rate)} of {money(e.netBasis)}
                  </p>
                  {/* The date on the row that raises the question, not a policy
                      line somewhere else on the page. */}
                  <p className="text-[10px] text-[var(--color-muted)]">
                    {e.state === 'accrued'
                      ? `Clears ${day(e.payableFrom)}`
                      : e.state === 'confirmed'
                        ? 'Cleared — in the next payout'
                        : e.state === 'invoiced'
                          ? 'On its way to you'
                          : e.state === 'paid'
                            ? 'Paid'
                            : 'Reversed — that order was refunded'}
                  </p>
                </div>
                <span
                  className="font-bold flex-shrink-0"
                  style={{
                    color:
                      e.state === 'reversed' ? RED : e.state === 'accrued' ? AMBER : e.state === 'invoiced' ? ACCENT : 'var(--color-text)',
                    textDecoration: e.state === 'reversed' ? 'line-through' : undefined,
                  }}
                >
                  {money(e.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title={`Payouts (${payouts.length})`}
        desc="We raise the invoice for you — here is exactly what it says."
      >
        {payouts.length === 0 ? (
          <p className="text-[11px] text-[var(--color-muted)]">None yet.</p>
        ) : (
          <div className="space-y-2.5">
            {payouts.map((p, i) => {
              const inv = invoices[i]
              return (
                <div key={p.id} className="rounded-xl p-3" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-[var(--color-text)]">{p.period}</p>
                      {inv && <p className="text-[10px] text-[var(--color-muted)] truncate">{inv.number}</p>}
                    </div>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        color: p.state === 'paid' ? GREEN : AMBER,
                        background: `color-mix(in srgb, ${p.state === 'paid' ? GREEN : AMBER} 14%, transparent)`,
                      }}
                    >
                      {p.state === 'paid' ? 'paid' : 'on its way'}
                    </span>
                  </div>

                  {inv ? (
                    <>
                      {inv.lines.map((l, n) => (
                        <div key={n} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-[var(--color-muted)]">
                            {l.description} — {l.count} × {l.rate != null ? `${Math.round(l.rate * 100)}%` : 'mixed'} of {money(l.basis)}
                          </span>
                          <span className="text-[var(--color-text-2)]">{money(l.amount)}</span>
                        </div>
                      ))}
                      {inv.vat > 0 && (
                        <div className="flex items-center justify-between gap-2 text-[11px] mt-0.5">
                          <span className="text-[var(--color-muted)]">VAT at {Math.round(inv.vatRate * 100)}%</span>
                          <span className="text-[var(--color-text-2)]">{money(inv.vat)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 text-[11px] font-bold mt-1 pt-1 border-t border-[var(--color-border)]">
                        <span className="text-[var(--color-text)]">Total</span>
                        <span className="text-[var(--color-text)]">{money(inv.gross)}</span>
                      </div>
                      {p.reference && (
                        <p className="text-[10px] text-[var(--color-muted)] mt-1">Sent with reference {p.reference}</p>
                      )}
                      <p className="text-[10px] text-[var(--color-muted)] leading-snug mt-1.5">{inv.notice}</p>
                    </>
                  ) : (
                    <p className="text-[11px] text-[var(--color-text-2)]">{money(p.amount)}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </>
  )
}

function TermsTab({ data }: { data: Data }) {
  const { codes, terms, termsHistory, wording } = data

  return (
    <>
      {codes.map((code) => (
        <Card key={code.code} title="Your code" desc={`Used ${code.terms.uses} time${code.terms.uses === 1 ? '' : 's'}.`}>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span
              className="text-sm font-black tracking-wide px-3 py-1.5 rounded-xl"
              style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 14%, transparent)` }}
            >
              {code.code}
            </span>
            <span className="text-sm font-bold text-[var(--color-text)]">{pct(code.discountPct)} off for your followers</span>
            {code.status !== 'active' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: AMBER, background: `color-mix(in srgb, ${AMBER} 14%, transparent)` }}>
                {code.status}
              </span>
            )}
          </div>

          <ShareLink code={code.code} />

          {/* Every restriction, stated — nothing they have to email to find out. */}
          <ul className="text-[11px] text-[var(--color-muted)] leading-relaxed mt-3 space-y-0.5">
            <li>{code.terms.firstOrderOnly ? '· Valid on a customer’s first order only.' : '· Valid on any order.'}</li>
            {code.terms.minSpend != null && <li>· Orders of {money(code.terms.minSpend)} or more.</li>}
            {code.terms.maxUses != null && (
              <li>· Capped at {code.terms.maxUses} uses — {code.terms.uses} used, {Math.max(0, code.terms.maxUses - code.terms.uses)} left.</li>
            )}
            {code.terms.startsAt && <li>· Starts {day(code.terms.startsAt)}.</li>}
            {code.terms.endsAt && <li>· Ends {day(code.terms.endsAt)}.</li>}
            {code.terms.maxUses == null && !code.terms.endsAt && <li>· No usage cap and no end date.</li>}
          </ul>
        </Card>
      ))}

      <Card title="What you earn" desc={`In force since ${day(terms.effectiveFrom)}.`}>
        <p className="text-sm text-[var(--color-text)] leading-snug">{wording.earn}</p>
      </Card>

      <Card title="When it becomes payable">
        <ol className="text-[11px] text-[var(--color-text-2)] leading-relaxed space-y-1">
          <li><strong>1.</strong> Someone orders on your code. Commission is earned the moment they pay.</li>
          <li><strong>2.</strong> It’s held for 14 days, the window a customer has to send an order back.</li>
          <li><strong>3.</strong> After that it clears and goes into the next payout run.</li>
          <li><strong>4.</strong> If an order is refunded, its commission is reversed — you’ll see it struck through on your earnings rather than quietly disappearing.</li>
        </ol>
        <p className="text-[11px] text-[var(--color-muted)] leading-snug mt-3">
          Every earning on the previous tab shows its own clearing date, so you never have to work this out.
        </p>
      </Card>

      <Card title="How you get paid">
        <p className="text-sm text-[var(--color-text)] leading-snug">{wording.paid}</p>
      </Card>

      <Card
        title={`Your deal, over time (${termsHistory.length})`}
        desc="Every version, dated, with the reason it changed. Nothing here is ever edited or removed."
      >
        <div className="space-y-2.5">
          {termsHistory.map((t, i) => (
            <div key={t.id} className="rounded-xl p-3" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[11px] font-black text-[var(--color-text)]">From {day(t.effectiveFrom)}</p>
                {i === 0 && new Date(t.effectiveFrom) <= new Date() && (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 14%, transparent)` }}>
                    Current
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--color-text-2)] leading-snug">
                {pct(t.firstOrderPct)} on a first order, then {pct(t.renewalPct)} of every renewal for {t.renewalMonths} months.
              </p>
              {t.note && <p className="text-[11px] text-[var(--color-muted)] italic leading-snug mt-1.5">“{t.note}”</p>}
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

function ShareLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window === 'undefined' ? `/?ref=${code}` : `${window.location.origin}/?ref=${code}`

  return (
    <div>
      <p className="text-[11px] font-bold text-[var(--color-muted)] mb-1">Your link</p>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 px-3 py-2 rounded-xl text-[11px] outline-none"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
        />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              /* clipboard blocked — the field is selectable, which is the fallback */
            }
          }}
          className="text-xs font-bold px-3 py-2 rounded-xl active:scale-95 transition-all"
          style={{ background: 'var(--color-surface-2)', color: ACCENT, border: '1px solid var(--color-border)' }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-[10px] text-[var(--color-muted)] leading-snug mt-1">
        Anyone following this gets your code applied at checkout without typing it, for 30 days.
      </p>
    </div>
  )
}
