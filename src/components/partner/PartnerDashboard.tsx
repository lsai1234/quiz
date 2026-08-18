'use client'

import { useEffect, useState } from 'react'
import { Badge, Button, Card, Ground, Input } from '@/components/system'
import type { PartnerDashboard as Data } from '@/lib/partners/dashboard'

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
  const [tab, setTab] = useState<'money' | 'assets' | 'terms'>('money')

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
        <p className="text-sm text-[var(--ink-3)]">
          We couldn’t load your account. Try refreshing — if it keeps happening, get in touch.
        </p>
      </Shell>
    )
  }
  if (!data) {
    return (
      <Shell onLogout={logout} name="">
        <p className="text-sm text-[var(--ink-3)]">Loading…</p>
      </Shell>
    )
  }

  return (
    <Shell onLogout={logout} name={data.partner.name}>
      <div className="flex gap-1 mb-4">
        {(['money', 'assets', 'terms'] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? 'primary' : 'secondary'}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t === 'money' ? 'How you’re doing' : t === 'assets' ? 'Your assets' : 'Your deal'}
          </Button>
        ))}
      </div>

      {tab === 'money' && <MoneyTab data={data} />}
      {tab === 'assets' && <AssetsTab data={data} />}
      {tab === 'terms' && <TermsTab data={data} />}
    </Shell>
  )
}

function Shell({ children, name, onLogout }: { children: React.ReactNode; name: string; onLogout: () => void }) {
  return (
    // `my-hub` is the region class the focus floor hangs off. The Partners Hub
    // is a different audience, not a different system.
    <Ground className="my-hub">
      <header
        className="sticky top-0 z-10"
        style={{
          background: 'var(--surface-2)',
          backdropFilter: 'blur(var(--blur-nav)) saturate(var(--blur-saturate))',
          WebkitBackdropFilter: 'blur(var(--blur-nav)) saturate(var(--blur-saturate))',
          borderBottom: '1px solid var(--edge)',
        }}
      >
        <div
          className="max-w-2xl mx-auto flex items-center justify-between"
          style={{ padding: 'var(--space-3) var(--gutter)', gap: 'var(--space-3)' }}
        >
          <span style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
            CHRGD <span style={{ color: 'var(--accent)' }}>Partners</span>
          </span>
          <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
            {name && (
              <span className="hidden sm:inline" style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
                {name}
              </span>
            )}
            <Button variant="ghost" size="sm" icon="log-out" aria-label="Sign out" onClick={onLogout} />
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto" style={{ padding: 'var(--space-6) var(--gutter)' }}>
        {children}
      </main>
    </Ground>
  )
}

/** A titled block. Layout — everything inside it is a primitive. */
function Panel({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card as="section" solid className="mb-3">
      <h2 style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
        {title}
      </h2>
      {desc && (
        <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
          {desc}
        </p>
      )}
      {children}
    </Card>
  )
}

function Figure({ label, value, tone, note }: { label: string; value: string; tone?: string; note?: string }) {
  return (
    <Card elevation={2} padding="tight">
      <p style={{ fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-strong)', letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
        {label}
      </p>
      <p style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', color: tone ?? 'var(--ink-1)' }}>
        {value}
      </p>
      {note && (
        <p style={{ fontSize: 'var(--text-micro)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
          {note}
        </p>
      )}
    </Card>
  )
}

function MoneyTab({ data }: { data: Data }) {
  const { balance, totals, thisMonth, earnings, payouts, invoices } = data

  return (
    <>
      <Panel
        title="What you’re owed"
        desc="Commission is held until the 14-day return window on the order has passed. Only then can it be paid."
      >
        <div className="grid grid-cols-2 gap-2">
          <Figure
            label="Ready to pay"
            value={money(balance.payableNow)}
            tone={balance.payableNow > 0 ? 'var(--tone-positive)' : undefined}
            note={balance.payableNow > 0 ? 'In the next payout run' : 'Nothing cleared yet'}
          />
          <Figure
            label="Still in the window"
            value={money(balance.accrued)}
            tone={balance.accrued > 0 ? 'var(--tone-attention)' : undefined}
            note="Earned, not yet clear"
          />
          <Figure
            label="On its way"
            value={money(balance.invoiced)}
            tone={balance.invoiced > 0 ? 'var(--accent)' : undefined}
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
              tone="critical"
              note="Orders that were refunded"
            />
          )}
        </div>
        <p className="text-[11px] text-[var(--ink-3)] leading-snug mt-3">{data.wording.paid}</p>
      </Panel>

      <Panel title="What you’ve brought in">
        <div className="grid grid-cols-2 gap-2">
          <Figure label="Orders, all time" value={String(totals.orders)} note={totals.subscriptions > 0 ? `${totals.subscriptions} on subscription` : undefined} />
          <Figure label="Their spend" value={money(totals.revenue)} />
          <Figure label="Orders this month" value={String(thisMonth.orders)} />
          <Figure label="Earned this month" value={money(thisMonth.earned)} tone={thisMonth.earned > 0 ? 'var(--accent)' : undefined} />
        </div>
        {totals.reversed > 0 && (
          <p className="text-[11px] text-[var(--ink-3)] leading-snug mt-3">
            {totals.reversed} order{totals.reversed === 1 ? ' was' : 's were'} refunded and {totals.reversed === 1 ? 'is' : 'are'} not counted above.
          </p>
        )}
      </Panel>

      <Panel
        title={`Your earnings (${earnings.length})`}
        desc="Each order you brought in, and the date its commission clears."
      >
        {earnings.length === 0 ? (
          <p className="text-[11px] text-[var(--ink-3)]">Nothing yet. Share your link and it’ll show up here.</p>
        ) : (
          <div className="space-y-2">
            {earnings.slice(0, 50).map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3 text-[11px]">
                <div className="min-w-0">
                  <p className="text-[var(--ink-2)]">
                    {day(e.at)} · {e.kind === 'first' ? 'first order' : 'renewal'} · {pct(e.rate)} of {money(e.netBasis)}
                  </p>
                  {/* The date on the row that raises the question, not a policy
                      line somewhere else on the page. */}
                  <p className="text-[10px] text-[var(--ink-3)]">
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
                      e.state === 'reversed' ? 'var(--tone-critical)' : e.state === 'accrued' ? 'var(--tone-attention)' : e.state === 'invoiced' ? 'var(--accent)' : 'var(--ink-1)',
                    textDecoration: e.state === 'reversed' ? 'line-through' : undefined,
                  }}
                >
                  {money(e.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title={`Payouts (${payouts.length})`}
        desc="We raise the invoice for you — here is exactly what it says."
      >
        {payouts.length === 0 ? (
          <p className="text-[11px] text-[var(--ink-3)]">None yet.</p>
        ) : (
          <div className="space-y-2.5">
            {payouts.map((p, i) => {
              const inv = invoices[i]
              return (
                <div key={p.id} className="rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-[var(--ink-1)]">{p.period}</p>
                      {inv && <p className="text-[10px] text-[var(--ink-3)] truncate">{inv.number}</p>}
                    </div>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        color: p.state === 'paid' ? 'var(--tone-positive)' : 'var(--tone-attention)',
                        background: `color-mix(in srgb, ${p.state === 'paid' ? 'var(--tone-positive)' : 'var(--tone-attention)'} 14%, transparent)`,
                      }}
                    >
                      {p.state === 'paid' ? 'paid' : 'on its way'}
                    </span>
                  </div>

                  {inv ? (
                    <>
                      {inv.lines.map((l, n) => (
                        <div key={n} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-[var(--ink-3)]">
                            {l.description} — {l.count} × {l.rate != null ? `${Math.round(l.rate * 100)}%` : 'mixed'} of {money(l.basis)}
                          </span>
                          <span className="text-[var(--ink-2)]">{money(l.amount)}</span>
                        </div>
                      ))}
                      {inv.vat > 0 && (
                        <div className="flex items-center justify-between gap-2 text-[11px] mt-0.5">
                          <span className="text-[var(--ink-3)]">VAT at {Math.round(inv.vatRate * 100)}%</span>
                          <span className="text-[var(--ink-2)]">{money(inv.vat)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 text-[11px] font-bold mt-1 pt-1 border-t border-[var(--edge)]">
                        <span className="text-[var(--ink-1)]">Total</span>
                        <span className="text-[var(--ink-1)]">{money(inv.gross)}</span>
                      </div>
                      {p.reference && (
                        <p className="text-[10px] text-[var(--ink-3)] mt-1">Sent with reference {p.reference}</p>
                      )}
                      <p className="text-[10px] text-[var(--ink-3)] leading-snug mt-1.5">{inv.notice}</p>
                    </>
                  ) : (
                    <p className="text-[11px] text-[var(--ink-2)]">{money(p.amount)}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </>
  )
}

/**
 * `Your assets` — the tab that stops partners emailing us for a graphic.
 *
 * Three sizes of a sample card with their code on it, their link, and the two
 * numbers at the top of their funnel: cards their followers made, and how often
 * those were opened. Orders and revenue are the money tab's job; this is the
 * part a partner can actually do something about.
 *
 * The card is labelled a sample in three places on purpose. It is a real stack
 * built by the real engine, but it is nobody's — and an asset that could be
 * mistaken for a customer's own card is an asset that will be, eventually, by
 * somebody writing a caption.
 */
function AssetsTab({ data }: { data: Data }) {
  if (data.shareAssets.length === 0) {
    return (
      <Panel title="Your assets" desc="Cards to post, with your code on them.">
        <p className="text-[11px] text-[var(--ink-3)] leading-snug">
          You don’t have a code yet. Once one is set up, your cards appear here.
        </p>
      </Panel>
    )
  }

  return (
    <>
      {data.shareAssets.map((asset) => (
        <Panel
          key={asset.code}
          title={`${asset.code} — cards to post`}
          desc="A sample of what your followers get when they finish the quiz, with your code on it. Download, post, and anyone who uses the code is attributed to you."
        >
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Figure
              label="Cards made"
              value={String(asset.cardsCreated)}
              note="By people who finished the quiz on your link"
            />
            <Figure
              label="Card opens"
              value={String(asset.cardViews)}
              note="Times someone followed one of those cards"
            />
          </div>

          <div className="flex gap-2 mb-3">
            {(['story', 'square', 'og'] as const).map((format) => (
              <a
                key={format}
                href={`/api/share/image?format=${format}&d=${asset.encoded}`}
                download={`chrgd-${asset.code.toLowerCase()}-${format}.png`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center text-[11px] font-bold px-3 py-2.5 rounded-xl"
                style={{ background: 'var(--surface-2)', color: 'var(--accent)', border: '1px solid var(--edge)' }}
              >
                {format === 'story' ? 'Story' : format === 'square' ? 'Post' : 'Link preview'}
              </a>
            ))}
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/share/image?format=square&d=${asset.encoded}`}
            alt={`Sample CHRGD card carrying the code ${asset.code}`}
            width={1080}
            height={1080}
            loading="lazy"
            className="w-full h-auto rounded-xl mb-3"
            style={{ border: '1px solid var(--edge)' }}
          />

          <ShareLink code={asset.code} />

          <p className="text-[10px] text-[var(--ink-3)] leading-snug mt-3">
            This is a sample card, not a real customer’s. Please don’t caption it as
            somebody’s results — the numbers on it are an example of what the quiz
            produces.
          </p>
        </Panel>
      ))}
    </>
  )
}

function TermsTab({ data }: { data: Data }) {
  const { codes, terms, termsHistory, wording } = data

  return (
    <>
      {codes.map((code) => (
        <Panel key={code.code} title="Your code" desc={`Used ${code.terms.uses} time${code.terms.uses === 1 ? '' : 's'}.`}>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span
              className="text-sm font-black tracking-wide px-3 py-1.5 rounded-xl"
              style={{ color: 'var(--accent)', background: `color-mix(in srgb, ${'var(--accent)'} 14%, transparent)` }}
            >
              {code.code}
            </span>
            <span className="text-sm font-bold text-[var(--ink-1)]">{pct(code.discountPct)} off for your followers</span>
            {code.status !== 'active' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: 'var(--tone-attention)', background: `color-mix(in srgb, ${'var(--tone-attention)'} 14%, transparent)` }}>
                {code.status}
              </span>
            )}
          </div>

          <ShareLink code={code.code} />

          {/* Every restriction, stated — nothing they have to email to find out. */}
          <ul className="text-[11px] text-[var(--ink-3)] leading-relaxed mt-3 space-y-0.5">
            {/* Where it works and what it replaces, stated up front. A partner
                who tells their audience "25% off everything, on top of whatever
                else is on" is going to hear about it from the people who
                believed them. */}
            <li>· Works on stacks, curated bundles and subscriptions — not on single products from the shop.</li>
            <li>· Takes {pct(code.discountPct)} off the regular price, instead of any other discount — never on top of one.</li>
            <li>· On a subscription it&rsquo;s the first month, then the normal monthly price after that.</li>
            <li>{code.terms.firstOrderOnly ? '· Valid on a customer’s first order only.' : '· Valid on any order.'}</li>
            {code.terms.minSpend != null && <li>· Orders of {money(code.terms.minSpend)} or more.</li>}
            {code.terms.maxUses != null && (
              <li>· Capped at {code.terms.maxUses} uses — {code.terms.uses} used, {Math.max(0, code.terms.maxUses - code.terms.uses)} left.</li>
            )}
            {code.terms.startsAt && <li>· Starts {day(code.terms.startsAt)}.</li>}
            {code.terms.endsAt && <li>· Ends {day(code.terms.endsAt)}.</li>}
            {code.terms.maxUses == null && !code.terms.endsAt && <li>· No usage cap and no end date.</li>}
          </ul>
        </Panel>
      ))}

      <Panel title="What you earn" desc={`In force since ${day(terms.effectiveFrom)}.`}>
        <p className="text-sm text-[var(--ink-1)] leading-snug">{wording.earn}</p>
      </Panel>

      <Panel title="When it becomes payable">
        <ol className="text-[11px] text-[var(--ink-2)] leading-relaxed space-y-1">
          <li><strong>1.</strong> Someone orders on your code. Commission is earned the moment they pay.</li>
          <li><strong>2.</strong> It’s held for 14 days, the window a customer has to send an order back.</li>
          <li><strong>3.</strong> After that it clears and goes into the next payout run.</li>
          <li><strong>4.</strong> If an order is refunded, its commission is reversed — you’ll see it struck through on your earnings rather than quietly disappearing.</li>
        </ol>
        <p className="text-[11px] text-[var(--ink-3)] leading-snug mt-3">
          Every earning on the previous tab shows its own clearing date, so you never have to work this out.
        </p>
      </Panel>

      <Panel title="How you get paid">
        <p className="text-sm text-[var(--ink-1)] leading-snug">{wording.paid}</p>
      </Panel>

      <Panel
        title={`Your deal, over time (${termsHistory.length})`}
        desc="Every version, dated, with the reason it changed. Nothing here is ever edited or removed."
      >
        <div className="space-y-2.5">
          {termsHistory.map((t, i) => (
            <div key={t.id} className="rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--edge)' }}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[11px] font-black text-[var(--ink-1)]">From {day(t.effectiveFrom)}</p>
                {i === 0 && new Date(t.effectiveFrom) <= new Date() && (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ color: 'var(--accent)', background: `color-mix(in srgb, ${'var(--accent)'} 14%, transparent)` }}>
                    Current
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--ink-2)] leading-snug">
                {pct(t.firstOrderPct)} on a first order, then {pct(t.renewalPct)} of every renewal for {t.renewalMonths} months.
              </p>
              {t.note && <p className="text-[11px] text-[var(--ink-3)] italic leading-snug mt-1.5">“{t.note}”</p>}
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}

function ShareLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window === 'undefined' ? `/?ref=${code}` : `${window.location.origin}/?ref=${code}`

  return (
    <div>
      <p className="text-[11px] font-bold text-[var(--ink-3)] mb-1">Your link</p>
      <div className="flex gap-2">
        <Input
          label="Your link"
          hideLabel
          className="flex-1"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          icon={copied ? 'check' : 'link'}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              /* clipboard blocked — the field is selectable, which is the fallback */
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {/* The 30 days is the LINK's memory, not the code's life. Saying "lasts
          30 days" next to a code read as the code expiring, which would be a
          fairly alarming thing for a partner to think about their own deal. */}
      <p className="text-[10px] text-[var(--ink-3)] leading-snug mt-1">
        Anyone following this gets your code applied at checkout without typing it. Their browser remembers it for 30
        days, so it still works if they come back later. Your code itself doesn’t expire — it works as long as your
        account is active, and they can always type it in.
      </p>
    </div>
  )
}
