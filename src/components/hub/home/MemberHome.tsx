'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Disclosure, Note, Skeleton } from '@/components/system'
import { HUB_COPY as C } from '@/lib/hub/copy'
import type { HubHome } from '@/lib/hub/home-types'
import { DealsCard } from '../DealsCard'
import { LinkOrder, OrdersSection } from './AccountBits'
import { HubHero } from './HubHero'
import { StackSection } from './StackSection'
import { CheckInTile, DealsTile, TipsTile, WeekTile } from './Tiles'
import { TodayCard } from './TodayCard'
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
export function MemberHome({ name, plan, none, data }: { name: string | null; plan?: ReactNode; none?: ReactNode; data?: ReactNode }) {
  const [home, setHome] = useState<HubHome | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    if (typeof fetch !== 'function') return
    fetch('/api/hub/home')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((h: HubHome) => setHome(h))
      .catch(() => setFailed(true))
  }, [])
  useEffect(() => load(), [load])

  if (failed && !home) {
    return (
      <div style={col('var(--stack)')}>
        <Note tone="critical">We couldn’t load your hub. Pull to refresh, or try again in a moment.</Note>
        {plan}
        {data}
      </div>
    )
  }
  if (!home) {
    return (
      <div style={col('var(--stack)')}>
        <div style={col('var(--stack)')} aria-busy="true" data-hub-loading>
          <Skeleton width="100%" height="calc(var(--space-8) * 4)" radius="var(--radius-card)" />
          <Skeleton width="100%" height="calc(var(--space-8) * 6)" radius="var(--radius-card)" />
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
      <div style={col('var(--stack)')} data-member-home data-hub-state="none">
        {none}
        <LinkOrder onLinked={load} />
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
  let i = 0

  return (
    <div style={col('var(--stack)')} data-member-home data-hub-state={home.access.state}>
      <Rise i={i++}>
        <HubHero home={home} name={name} />
      </Rise>

      {open && home.today && (
        <Rise i={i++}>
          <TodayCard items={home.today.items} />
        </Rise>
      )}

      {tiles.length > 0 && (
        <Rise i={i++}>
          <div className="grid grid-cols-2" style={{ gap: 'var(--space-3)' }} data-bento>
            {tiles}
          </div>
        </Rise>
      )}

      {open && home.services.deals && (
        <Rise i={i++}>
          <DealsCard />
        </Rise>
      )}

      {home.guide && (
        <Rise i={i++}>
          <StackSection guide={home.guide} />
        </Rise>
      )}

      {plan && (
        <Rise i={i++}>
          <section data-plan>
            <SectionHead eyebrowText={C.planEyebrow} title={C.planTitle} />
            {plan}
          </section>
        </Rise>
      )}

      <Rise i={i++}>
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
        </section>
      </Rise>
    </div>
  )
}
