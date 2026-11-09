'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Button, Card, buttonSurface } from '@/components/system'
import { COACHING_COPY as W } from '@/lib/training/coaching-copy'
import { HUB_COPY as C } from '@/lib/hub/copy'
import type { HubHome, TodayItem } from '@/lib/hub/home-types'
import { body, eyebrow, meta, Ring, strong } from './ui'

/**
 * Today: their products on their day, as a timeline. Products taken at the
 * same moment sit together under it; each is one tick away from taken. The
 * next untaken one is called out at the top and its moment lit on the line; a
 * ring counts them off. Ticks save straight away and last the day.
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
    setBusy(item.productId)
    const want = !item.done
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

  return (
    <div data-today className="h-full">
      <Card padding="roomy" elevation={2} className="h-full">
        <div className="flex items-center justify-between" style={{ gap: 'var(--space-4)' }}>
          <div className="min-w-0">
            <p style={eyebrow}>{C.todayTitle}</p>
            <p
              style={{
                ...strong,
                fontSize: 'var(--text-title)',
                fontFamily: 'var(--font-display)',
                letterSpacing: 'var(--tracking-title)',
                lineHeight: 'var(--leading-tight)',
                marginTop: 'var(--space-2)',
              }}
              aria-live="polite"
            >
              {next ? C.todayNext(next.time, next.title) : C.todayAllDone}
            </p>
            {next && <p style={{ ...meta, marginTop: 'var(--space-1)' }}>{`${next.moment} · ${next.amount}`}</p>}
          </div>
          <Ring value={items.length ? done / items.length : 0} size={68} stroke={6} label={C.todayProgress(done, items.length)}>
            <span className="hub-figure" style={{ fontSize: 'var(--text-lead)', color: allDone ? 'var(--accent)' : 'var(--ink-1)' }}>
              {C.todayProgress(done, items.length)}
            </span>
          </Ring>
        </div>

        {session && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <SessionRow session={session} />
          </div>
        )}

        <ol className="hub-timeline" style={{ marginTop: 'var(--space-5)' }}>
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
                    <li key={item.productId} className="hub-today-row flex items-center" style={{ gap: 'var(--space-3)' }} data-today-item={item.productId} data-done={item.done}>
                      <span className="min-w-0" style={{ flex: 1 }}>
                        <span style={{ ...strong, display: 'block', color: item.done ? 'var(--ink-3)' : 'var(--ink-1)', textDecoration: item.done ? 'line-through' : 'none' }}>
                          {item.title}
                        </span>
                        <span style={{ ...meta, display: 'block' }}>{item.amount}</span>
                      </span>
                      <Button
                        size="sm"
                        variant={item.done ? 'primary' : 'secondary'}
                        icon="check"
                        aria-pressed={item.done}
                        aria-label={item.done ? C.todayUntick(item.title) : C.todayTick(item.title)}
                        disabled={busy === item.productId}
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
