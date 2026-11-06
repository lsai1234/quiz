'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, Checkbox, Disclosure, Note } from '@/components/system'
import { useMemberDealCheckout } from '@/hooks/useMemberDealCheckout'
import { DEALS_COPY as C } from '@/lib/deals/copy'
import type { PublicBox } from '@/lib/deals/box'
import type { MemberDeal } from '@/lib/deals/engine'
import type { DealsState } from '@/lib/deals/server'
import { HUB_COPY } from '@/lib/hub/copy'

/**
 * Member prices, as a top-up box. Open deals are in the box to start with;
 * anything due within 30 days can join early at its own member price, so one
 * parcel covers them. The server prices the box as it changes (free delivery
 * over the founders' line), and the checkout prices it again and never
 * charges more than shown. What's further off is listed with when it opens.
 * Nothing shows while deals are off or there are none.
 */

const day = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const gbp = (n: number) => `£${n.toFixed(2)}`
const eyebrow = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-strong)',
  letterSpacing: 'var(--tracking-eyebrow)',
  textTransform: 'uppercase' as const,
  color: 'var(--accent)',
}
const meta = { color: 'var(--ink-3)', fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)' }
const strong = { color: 'var(--ink-1)', fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', lineHeight: 'var(--leading-snug)' }

export function DealsCard() {
  const [state, setState] = useState<DealsState | null>(null)
  const [picked, setPicked] = useState<string[] | null>(null)
  const [box, setBox] = useState<PublicBox | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [emailsOn, setEmailsOn] = useState<boolean | null>(null)
  const { state: buying, buy } = useMemberDealCheckout()

  useEffect(() => {
    let live = true
    if (typeof fetch !== 'function') return
    fetch('/api/hub/deals')
      .then((r) => (r.ok ? r.json() : null))
      .then((s: DealsState | null) => {
        if (!live || !s) return
        setState(s)
        setPicked(s.deals.filter((d) => d.state === 'open').map((d) => d.variantId))
      })
      .catch(() => {})
    fetch('/api/hub/deal-emails')
      .then((r) => (r.ok ? r.json() : null))
      .then((e: { on: boolean } | null) => live && e && setEmailsOn(e.on))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  // The box's price, from the server, as the selection changes.
  const key = (picked ?? []).join(',')
  useEffect(() => {
    if (!picked?.length) {
      setBox(null)
      return
    }
    const controller = new AbortController()
    setQuoting(true)
    const t = window.setTimeout(() => {
      fetch('/api/hub/deals/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variantIds: picked }), signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((b: PublicBox | null) => setBox(b && b.viable ? b : null))
        .catch(() => {})
        .finally(() => setQuoting(false))
    }, 250)
    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
    // `key` stands for the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const changed = buying.status === 'changed' ? buying : null
  useEffect(() => {
    if (changed?.box) setBox(changed.box)
  }, [changed?.box])

  const groups = useMemo(() => {
    const deals = state?.deals ?? []
    return {
      open: deals.filter((d) => d.state === 'open'),
      early: deals.filter((d) => d.state === 'upcoming' && d.boxable),
      later: deals.filter((d) => d.state === 'upcoming' && !d.boxable),
    }
  }, [state])

  if (!state?.enabled || !state.deals?.length) return null
  const busy = buying.status === 'loading' || buying.status === 'redirecting'
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...new Set([...(p ?? []), id])] : (p ?? []).filter((x) => x !== id)))
  const canBuy = Boolean(box) && groups.open.some((d) => picked?.includes(d.variantId))
  // With nothing open yet, what's due soon is simply coming up.
  const comingUp = groups.open.length ? groups.later : [...groups.early, ...groups.later]

  return (
    <div data-deals id="deals">
      <Card padding="roomy" glow={groups.open.length ? 'positive' : undefined}>
        <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }}>
          <p style={eyebrow}>{C.eyebrow}</p>
          {groups.open.length > 0 && <Badge tone="positive" dot>{HUB_COPY.dealsOpen(groups.open.length)}</Badge>}
        </div>
        <h2 style={{ ...strong, fontSize: 'var(--text-title)', fontFamily: 'var(--font-display)', marginTop: 'var(--space-2)' }}>{C.heading}</h2>
        <p style={{ color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body)', marginTop: 'var(--space-2)' }}>{C.intro}</p>

        {groups.open.length > 0 && (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
            {groups.open.map((d) => (
              <DealRow key={d.productId} deal={d} checked={picked?.includes(d.variantId) ?? false} onChange={(on) => toggle(d.variantId, on)} />
            ))}
          </ul>
        )}

        {groups.early.length > 0 && groups.open.length > 0 && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <h3 style={{ ...eyebrow, color: 'var(--ink-2)' }}>{C.addEarlyHeading}</h3>
            <p style={{ ...meta, marginTop: 'var(--space-1)' }}>{C.addEarlyBody}</p>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              {groups.early.map((d) => (
                <DealRow key={d.productId} deal={d} checked={picked?.includes(d.variantId) ?? false} onChange={(on) => toggle(d.variantId, on)} />
              ))}
            </ul>
          </div>
        )}

        {groups.open.length > 0 && (
          <div style={{ marginTop: 'var(--space-5)' }} data-deal-box>
            <Card padding="normal" tone="positive">
              <div className="flex items-end justify-between" style={{ gap: 'var(--space-3)' }}>
                <div className="min-w-0">
                  <p style={{ ...eyebrow, color: 'var(--ink-2)' }}>{C.boxTitle(picked?.length ?? 0)}</p>
                  {box ? (
                    <>
                      <p className="hub-figure" style={{ fontSize: 'var(--text-display)', color: 'var(--ink-1)', marginTop: 'var(--space-1)' }} aria-live="polite">
                        {gbp(box.total)}
                      </p>
                      <p style={meta}>{C.boxSaving(box.totalSaving, box.normalTotal)}</p>
                      <p style={meta}>{box.deliveryCharge === 0 ? `${C.boxFreeDelivery}. ${C.freeShortTail}` : C.boxDelivery(box.deliveryCharge, state.freeOver)}</p>
                    </>
                  ) : (
                    <p style={{ ...meta, marginTop: 'var(--space-1)' }}>{picked?.length ? (quoting ? C.boxQuoting : C.boxNone) : C.boxEmpty}</p>
                  )}
                </div>
              </div>
              {changed && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <Note tone="attention" live="polite">
                    {changed.message}
                  </Note>
                </div>
              )}
              {buying.status === 'error' && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <Note tone="critical" live="assertive">
                    {buying.message}
                  </Note>
                </div>
              )}
              <div style={{ marginTop: 'var(--space-4)' }}>
                <Button variant="primary" size="lg" fullWidth disabled={!canBuy || quoting} loading={busy} onClick={() => box && void buy(box)} data-deal-buy>
                  {busy ? C.buying : box ? C.buy(box.total) : C.boxEmpty}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {comingUp.length > 0 && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <h3 style={{ ...eyebrow, color: 'var(--ink-2)' }}>{C.upcomingHeading}</h3>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              {comingUp.map((d) => (
                <li key={d.productId} data-deal={d.productId} data-deal-state="upcoming">
                  <p style={{ ...strong, fontSize: 'var(--text-body-sm)' }}>
                    {d.short}: {C.dealLine(d.quote)}
                  </p>
                  <p style={{ color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)' }}>{C.price(d.quote.total, d.quote.normalTotal)}</p>
                  <p style={meta}>
                    {C.opensIn(d.opensInDays, day(d.opensOn))} · {d.estimated ? C.runsOutEstimated(day(d.runsOutOn)) : C.runsOut(day(d.runsOutOn))}
                  </p>
                  {d.quote.deliveryDeal === 'free' && <p style={meta}>{C.freeShort}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginTop: 'var(--space-5)' }}>
          <Disclosure summary={C.howTitle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-2)' }}>
              <p style={meta}>{C.boxFreeOver(state.freeOver)}</p>
              <p style={meta}>{C.terms}</p>
              {state.hubEndsOn && <p style={meta}>{C.hubOpen(day(state.hubEndsOn))}</p>}
              <p style={meta}>
                <Link href="/legal/member-hub" style={{ textDecoration: 'underline' }}>
                  {C.termsLink}
                </Link>
              </p>
            </div>
          </Disclosure>
        </div>
        {emailsOn !== null && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Checkbox
              label={C.emailsOn}
              checked={emailsOn}
              onChange={async (e) => {
                const on = e.target.checked
                setEmailsOn(on)
                const res = await fetch('/api/hub/deal-emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) }).catch(() => null)
                if (!res?.ok) setEmailsOn(!on)
              }}
            />
          </div>
        )}
      </Card>
    </div>
  )
}

function DealRow({ deal, checked, onChange }: { deal: MemberDeal; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <li data-deal={deal.productId} data-deal-state={deal.state}>
      <div className="flex items-start" style={{ gap: 'var(--space-3)' }}>
        {deal.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={deal.imageUrl}
            alt=""
            width={56}
            height={56}
            style={{ width: 'calc(var(--space-8) * 1.75)', height: 'calc(var(--space-8) * 1.75)', objectFit: 'contain', borderRadius: 'var(--radius-chip)', background: 'var(--surface-2)' }}
          />
        )}
        <div className="min-w-0" style={{ flex: 1 }}>
          <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
            <p style={strong}>{deal.short}</p>
            <Badge tone={deal.state === 'open' ? 'positive' : 'info'}>{C.dealLine(deal.quote)}</Badge>
          </div>
          <p style={{ color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)', marginTop: 'var(--space-1)' }}>{C.price(deal.quote.total, deal.quote.normalTotal)}</p>
          <p style={meta}>{deal.state === 'open' ? C.openUntil(day(deal.endsOn)) : C.opensIn(deal.opensInDays, day(deal.opensOn))}</p>
          {deal.quote.deliveryDeal === 'free' && <p style={meta}>{C.freeShort}</p>}
          <div style={{ marginTop: 'var(--space-2)' }}>
            <Checkbox label={deal.state === 'open' ? C.inBox : C.addEarly} checked={checked} onChange={(e) => onChange(e.target.checked)} />
          </div>
        </div>
      </div>
    </li>
  )
}
