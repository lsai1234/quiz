'use client'

import { useMemo, useState } from 'react'
import { Button, Card } from '@/components/system'
import { HUB_COPY as C } from '@/lib/hub/copy'
import type { TodayItem } from '@/lib/hub/home-types'
import { body, eyebrow, meta, Ring, strong } from './ui'

/**
 * Today: their products on their day, in time order, each one tick away from
 * taken. The next untaken one is called out; a ring counts them off. Ticks
 * save straight away and last the day.
 */
export function TodayCard({ items: initial }: { items: TodayItem[] }) {
  const [items, setItems] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const done = items.filter((i) => i.done).length
  const next = useMemo(
    () => items.find((i) => !i.done && i.minutes !== null && i.minutes >= nowMin - 30) ?? items.find((i) => !i.done) ?? null,
    [items, nowMin],
  )

  async function toggle(item: TodayItem) {
    setBusy(item.productId)
    const want = !item.done
    setItems((xs) => xs.map((x) => (x.productId === item.productId ? { ...x, done: want } : x)))
    const res = await fetch('/api/hub/today', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: item.productId, done: want }) }).catch(() => null)
    if (!res?.ok) setItems((xs) => xs.map((x) => (x.productId === item.productId ? { ...x, done: !want } : x)))
    setBusy(null)
  }

  if (!items.length) {
    return (
      <Card padding="roomy">
        <p style={eyebrow}>{C.todayTitle}</p>
        <p style={{ ...body, marginTop: 'var(--space-2)' }}>{C.todayEmpty}</p>
      </Card>
    )
  }

  return (
    <div data-today>
      <Card padding="roomy" glow="accent">
        <div className="flex items-center justify-between" style={{ gap: 'var(--space-4)' }}>
          <div className="min-w-0">
            <p style={eyebrow}>{C.todayTitle}</p>
            <p style={{ ...strong, fontSize: 'var(--text-lead)', fontFamily: 'var(--font-display)', marginTop: 'var(--space-2)' }} aria-live="polite">
              {next ? C.todayNext(next.time, next.title) : C.todayAllDone}
            </p>
            {next && <p style={meta}>{`${next.moment} · ${next.amount}`}</p>}
          </div>
          <Ring value={items.length ? done / items.length : 0} size={64} stroke={6} label={C.todayProgress(done, items.length)}>
            <span className="hub-figure" style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)' }}>
              {C.todayProgress(done, items.length)}
            </span>
          </Ring>
        </div>

        <ol style={{ marginTop: 'var(--space-5)', display: 'flex', flexDirection: 'column' }}>
          {items.map((item, i) => {
            const isNext = next?.productId === item.productId && !item.done
            return (
              <li
                key={`${item.productId}-${i}`}
                className="flex items-center"
                style={{
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3) 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--edge)',
                }}
                data-today-item={item.productId}
                data-done={item.done}
              >
                <span className="hub-figure shrink-0" style={{ width: 'calc(var(--space-8) * 1.7)', fontSize: 'var(--text-body-sm)', color: isNext ? 'var(--accent)' : 'var(--ink-3)' }}>
                  {item.time ?? C.untimed}
                </span>
                <span className="min-w-0" style={{ flex: 1 }}>
                  <span style={{ ...strong, display: 'block', color: item.done ? 'var(--ink-3)' : 'var(--ink-1)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.title}</span>
                  <span style={{ ...meta, display: 'block' }}>{item.moment}</span>
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
            )
          })}
        </ol>
      </Card>
    </div>
  )
}
