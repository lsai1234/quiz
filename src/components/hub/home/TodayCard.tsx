'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Card, TickRow, buttonSurface } from '@/components/system'
import { COACHING_COPY as W } from '@/lib/training/coaching-copy'
import { HUB_COPY as C } from '@/lib/hub/copy'
import type { HubHome, TodayItem } from '@/lib/hub/home-types'
import { body, ChargeRing, eyebrow, meta, strong } from './ui'

/**
 * Today: the hub's centrepiece. A charge ring with a segment for each product
 * lights as they're taken, over the next one to take; under it, their day as a
 * timeline. Products taken at the same moment sit together, each a row to tap
 * (`TickRow`), and the next moment is lit on the line. Ticks save straight
 * away and last the day; the last one fills the ring.
 */
interface Moment {
  key: string
  time: string | null
  moment: string
  items: TodayItem[]
}

function momentsOf(items: TodayItem[]): Moment[] {
  const out: Moment[] = []
  for (const item of items) {
    const key = `${item.time ?? ''}|${item.moment}`
    const last = out[out.length - 1]
    if (last && last.key === key) last.items.push(item)
    else out.push({ key, time: item.time, moment: item.moment, items: [item] })
  }
  return out
}

/** Today's training session, one tap from starting it (coaching tools on). */
function SessionRow({ session }: { session: NonNullable<HubHome['todaySession']> }) {
  const start = buttonSurface('primary', 'sm')
  return (
    <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }} data-today-session={session.id}>
      <p style={{ ...strong, minWidth: 0 }}>{W.todaySession(session.time ?? C.untimed, session.title, session.minutes)}</p>
      <Link href={session.workout ? `/myhub/training?workout=${encodeURIComponent(session.id)}` : '/myhub/training'} className={start.className} style={start.style} data-today-start>
        {W.todayStart}
      </Link>
    </div>
  )
}

export function TodayCard({ items: initial, session = null }: { items: TodayItem[]; session?: HubHome['todaySession'] }) {
  const [items, setItems] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const done = items.filter((i) => i.done).length
  const next = useMemo(() => items.find((i) => !i.done && i.minutes !== null && i.minutes >= nowMin - 30) ?? items.find((i) => !i.done) ?? null, [items, nowMin])
  const moments = useMemo(() => momentsOf(items), [items])

  async function toggle(item: TodayItem) {
    // One save at a time per product; the row stays live, so a tick never dims.
    if (busy === item.productId) return
    setBusy(item.productId)
    const want = !item.done
    // A small buzz under the thumb, where the phone has one.
    if (want && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(8)
    setItems((xs) => xs.map((x) => (x.productId === item.productId ? { ...x, done: want } : x)))
    const res = await fetch('/api/hub/today', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: item.productId, done: want }),
    }).catch(() => null)
    if (!res?.ok) setItems((xs) => xs.map((x) => (x.productId === item.productId ? { ...x, done: !want } : x)))
    setBusy(null)
  }

  if (!items.length) {
    return (
      <Card padding="roomy">
        <p style={eyebrow}>{C.todayTitle}</p>
        {session ? (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <SessionRow session={session} />
          </div>
        ) : (
          <p style={{ ...body, marginTop: 'var(--space-2)' }}>{C.todayEmpty}</p>
        )}
      </Card>
    )
  }

  const allDone = done === items.length
  const [count, ...ofTotal] = C.todayProgress(done, items.length).split(' ')
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div data-today className="h-full">
      <Card padding="roomy" elevation={2} glow="accent" className="h-full">
        <div className="flex items-baseline justify-between" style={{ gap: 'var(--space-3)' }}>
          <p style={eyebrow}>{C.todayTitle}</p>
          <p style={meta}>{date}</p>
        </div>

        <div className="flex flex-col items-center text-center" style={{ marginTop: 'var(--space-5)' }}>
          <ChargeRing done={done} total={items.length} size={156} stroke={12} label={C.todayProgress(done, items.length)}>
            <span className="hub-figure" style={{ fontSize: 'var(--text-hero)', color: allDone ? 'var(--accent)' : 'var(--ink-1)' }}>
              {count}
            </span>
            <span style={{ ...meta, fontSize: 'var(--text-body-sm)', marginTop: 'calc(var(--space-1) * -1)' }}>{ofTotal.join(' ')}</span>
          </ChargeRing>
          <p
            style={{
              ...strong,
              fontSize: 'var(--text-title)',
              fontFamily: 'var(--font-display)',
              letterSpacing: 'var(--tracking-title)',
              lineHeight: 'var(--leading-tight)',
              marginTop: 'var(--space-5)',
            }}
            aria-live="polite"
          >
            {next ? C.todayNext(next.time, next.title) : C.todayAllDone}
          </p>
          {next && <p style={{ ...meta, fontSize: 'var(--text-body-sm)', marginTop: 'var(--space-1)' }}>{`${next.moment} · ${next.amount}`}</p>}
        </div>

        {session && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <SessionRow session={session} />
          </div>
        )}

        <ol className="hub-timeline" style={{ marginTop: 'var(--space-6)' }}>
          {moments.map((m) => {
            const lit = m.items.some((i) => i.productId === next?.productId)
            const over = m.items.every((i) => i.done)
            return (
              <li key={m.key} className="hub-timeline-moment" data-lit={lit} data-over={over}>
                <span aria-hidden className="hub-timeline-node" />
                <p className="flex items-baseline" style={{ gap: 'var(--space-2)' }}>
                  <span className="hub-figure" style={{ fontSize: 'var(--text-body)', color: lit ? 'var(--accent)' : 'var(--ink-1)' }}>
                    {m.time ?? C.untimed}
                  </span>
                  <span style={meta}>{m.moment}</span>
                </p>
                <ul style={{ marginTop: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {m.items.map((item) => (
                    <li key={item.productId} data-today-item={item.productId} data-done={item.done}>
                      <TickRow
                        label={item.title}
                        sub={item.amount}
                        done={item.done}
                        name={item.done ? C.todayUntick(item.title) : C.todayTick(item.title)}
                        onClick={() => void toggle(item)}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ol>
      </Card>
    </div>
  )
}
