'use client'

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Disclosure, Note, Skeleton } from '@/components/system'
import { HUB_COPY as C } from '@/lib/hub/copy'
import { HUB_PLAN_COPY } from '@/lib/hub-plan/copy'
import { billingDayPhrase } from '@/lib/recharge/billing-day'
import type { HubHome } from '@/lib/hub/home-types'
import { DealsCard } from '../DealsCard'
import { FeedbackLink } from '../feedback/FeedbackPage'
import { HubLoadProblem } from '../HubLoadProblem'
import { LinkOrder, OrdersSection } from './AccountBits'
import { HubHero } from './HubHero'
import { JoinOfferCard, MembershipCard } from './MembershipCard'
import { StackSection } from './StackSection'
import { CheckInTile, DealsTile, TipsTile, WeekTile } from './Tiles'
import { TodayCard } from './TodayCard'
import { TrainerCard } from './TrainerCard'
import { WhatYouHave } from './WhatYouHave'
import { col, Rise, SectionHead } from './ui'

/**
 * The member hub's home, for everyone signed in: one-off buyers, subscribers
 * and those whose hub has closed. Top to bottom, on a phone first:
 *
 *   hero      who they are, and the hub's 90 days as a ring
 *   today     what to take next, ticked off as they go
 *   bento     member prices · this week · tips · check-in
 *   prices    the top-up box
 *   stack     their products, each opening into more about it
 *   plan      the subscription controls, for subscribers (passed in)
 *   orders    and joining an order made under another email
 *
 * One request (`/api/hub/home`); every section is there only when it's theirs
 * and switched on. A closed hub keeps the guide and orders, read-only.
 */
type Arrival = 'joined' | 'arrived' | 'plan-exists'

/**
 * The first thing someone sees after they arrive, in the words of how they
 * came: what they now have, when it comes, and where the rest is.
 */
export function welcomeLine(arrival: Arrival, home: Pick<HubHome, 'plan' | 'access' | 'membership'>): string {
  if (arrival === 'joined') return HUB_PLAN_COPY.welcome
  if (arrival === 'plan-exists') return 'You already have a monthly plan, so we didn’t start a second one. Add to it, or put something in your next box, below.'
  const plan = home.plan
  if (plan && plan.status !== 'cancelled') {
    const day = billingDayPhrase(plan.day)
    if (plan.source === 'shop') return `Your monthly basket is set up. It comes on ${day} of each month, at the shop’s price. What’s on it, and how to change it, is below.`
    if (plan.source === 'bundle') return `Your bundle is set up and your first box is on its way. After that it comes on ${day} of each month. What’s on it, and how to change it, is below.`
    return `Your plan is set up and your first box is on its way. After that it comes on ${day} of each month, and your guide below says when to take each product.`
  }
  // The hub on its own, just joined (from the quiz, `?welcome=1`).
  if (home.membership && home.membership.status !== 'cancelled') return HUB_PLAN_COPY.welcome
  if (home.access.state === 'member') return 'Your order is on its way. Your hub is open for 90 days: your guide, your order and buying again are all here.'
  return 'Welcome to your hub.'
}

export function MemberHome({ name, plan, none, data }: { name: string | null; plan?: ReactNode; none?: ReactNode; data?: ReactNode }) {
  const [home, setHome] = useState<HubHome | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    if (typeof fetch !== 'function') return Promise.resolve()
    return fetch('/api/hub/home')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((h: HubHome) => {
        setHome(h)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  // Just arrived: joined the hub on its own (`?joined=1`), came from a checkout
  // (`?welcome=…`), or tried to start a second plan (`?plan=exists`). Said once.
  const [welcome, setWelcome] = useState<Arrival | null>(null)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const arrival: Arrival | null = q.get('plan') === 'exists' ? 'plan-exists' : q.get('joined') === '1' ? 'joined' : q.get('welcome') ? 'arrived' : null
    if (arrival) {
      setWelcome(arrival)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  if (failed && !home) {
    return (
      <div className="mx-auto max-w-2xl" style={col('var(--stack)')}>
        <HubLoadProblem what="hub" onRetry={load} />
        {plan}
        {data}
      </div>
    )
  }
  if (!home) {
    return (
      <div className="mx-auto max-w-2xl" style={col('var(--stack)')}>
        <div style={col('var(--stack)')} aria-busy="true" data-hub-loading>
          {/* The shape of what's coming: the greeting, the pass, the day's card. */}
          <div style={{ ...col('var(--space-3)'), paddingTop: 'var(--space-2)', paddingBottom: 'var(--space-2)' }}>
            <Skeleton width="40%" height="var(--space-3)" />
            <Skeleton width="75%" height="var(--space-8)" />
          </div>
          <Skeleton width="100%" height="calc(var(--space-8) * 2)" radius="var(--radius-card)" />
          <Skeleton width="100%" height="calc(var(--space-8) * 12)" radius="var(--radius-card)" />
          <div className="grid grid-cols-2" style={{ gap: 'var(--space-3)' }}>
            <Skeleton width="100%" height="calc(var(--space-8) * 4)" radius="var(--radius-card)" />
            <Skeleton width="100%" height="calc(var(--space-8) * 4)" radius="var(--radius-card)" />
          </div>
        </div>
        {/* A plan's controls don't wait for the rest of the hub. */}
        {plan}
        {data}
      </div>
    )
  }

  // Never ordered: the hub hasn't opened yet, and the no-plan screen says why and what to do.
  if (home.access.state === 'none' && none) {
    return (
      <div className="mx-auto max-w-2xl" style={col('var(--stack)')} data-member-home data-hub-state="none">
        {home.membership && <MembershipCard membership={home.membership} onChange={load} />}
        {none}
        {home.joinOffer && <JoinOfferCard monthly={home.joinOffer.monthly} />}
        <LinkOrder onLinked={load} />
        <FeedbackLink />
        {data}
      </div>
    )
  }

  const open = home.access.state === 'subscriber' || home.access.state === 'member'
  // Wide tiles span both columns; the small ones pair up, or widen when alone.
  const small = [
    home.training ? <WeekTile key="week" training={home.training} /> : null,
    home.checkIn && !home.checkIn.stopped ? <CheckInTile key="checkin" checkIn={home.checkIn} /> : null,
  ].filter(Boolean)
  const tiles = [
    home.deals && home.services.deals ? (
      <div key="deals" className="col-span-2">
        <DealsTile deals={home.deals} />
      </div>
    ) : null,
    ...small.map((t, n) => (
      <div key={n} className={small.length === 1 ? 'col-span-2' : 'col-span-1'}>
        {t}
      </div>
    )),
    open && home.tips.length ? (
      <div key="tips" className="col-span-2">
        <TipsTile tips={home.tips} />
      </div>
    ) : null,
  ].filter(Boolean)
  // Reading order on a phone; on a wide screen the day and the money on the
  // left, the glance tiles and the account on the right.
  const ORDER = { welcome: 0, hero: 0, offer: 1, today: 1, trainer: 2, tiles: 3, deals: 4, stack: 5, plan: 6, membership: 7, account: 8 } as const
  const at = (k: keyof typeof ORDER): CSSProperties => ({ order: ORDER[k] })

  return (
    <div className="hub-home" data-member-home data-hub-state={home.access.state}>
      {welcome && (
        <div className="hub-home-wide" style={at('welcome')} data-hub-welcome>
          <Note tone={welcome === 'plan-exists' ? 'info' : 'positive'} icon={welcome === 'plan-exists' ? 'info' : 'check'} live="polite">
            {welcomeLine(welcome, home)}
          </Note>
        </div>
      )}
      <Rise i={0} className="hub-home-wide" style={at('hero')}>
        <HubHero home={home} name={name} />
      </Rise>

      {/* What they have, plainly, before anything else: the plan, what they bought once, the hub on its own. */}
      <Rise i={1} className="hub-home-wide" style={at('hero')}>
        <WhatYouHave plan={home.plan ?? null} orders={home.orders} membership={home.membership} />
      </Rise>

      <div className="hub-home-col">
        {open && (home.today || home.todaySession) && (
          <Rise i={1} style={at('today')}>
            {/* Keyed on the day: the card holds its ticks, and a new day brings new times. */}
            <TodayCard
              key={home.guide ? [home.guide.day.wake, home.guide.day.bed, home.guide.day.trainAt, (home.guide.day.trainWeekdays ?? []).join('')].join('|') : 'no-guide'}
              items={home.today?.items ?? []}
              session={home.todaySession}
              day={home.guide?.day ?? null}
              onDayChanged={load}
            />
          </Rise>
        )}

        {open && home.services.deals && (
          <Rise i={3} style={at('deals')}>
            <DealsCard />
          </Rise>
        )}

        {home.guide && (
          <Rise i={4} style={at('stack')}>
            <StackSection guide={home.guide} />
          </Rise>
        )}

        {plan && (
          <Rise i={5} style={at('plan')}>
            <section data-plan tabIndex={-1} style={{ outline: 'none' }}>
              <SectionHead eyebrowText={C.planEyebrow} title={C.planTitle} />
              {plan}
            </section>
          </Rise>
        )}
      </div>

      <div className="hub-home-col">
        {open && home.trainer && (
          <Rise i={2} style={at('trainer')}>
            <TrainerCard trainer={home.trainer} />
          </Rise>
        )}

        {tiles.length > 0 && (
          <Rise i={2} style={at('tiles')}>
            <div className="grid grid-cols-2" style={{ gap: 'var(--space-3)' }} data-bento>
              {tiles}
            </div>
          </Rise>
        )}

        {home.joinOffer && (
          <Rise i={1} style={at('offer')}>
            <JoinOfferCard monthly={home.joinOffer.monthly} />
          </Rise>
        )}

        {home.membership && (
          <Rise i={6} style={at('membership')}>
            <MembershipCard membership={home.membership} onChange={load} />
          </Rise>
        )}

        <Rise i={6} style={at('account')}>
          <section style={col('var(--space-3)')} data-account>
            <OrdersSection orders={home.orders} />
            <Disclosure summary={C.linkTitle}>
              <div style={{ paddingTop: 'var(--space-3)' }}>
                <LinkOrder onLinked={load} />
              </div>
            </Disclosure>
            {data && (
              <Disclosure summary={C.dataTitle}>
                <div style={{ paddingTop: 'var(--space-3)' }}>{data}</div>
              </Disclosure>
            )}
            <FeedbackLink />
          </section>
        </Rise>
      </div>
    </div>
  )
}
