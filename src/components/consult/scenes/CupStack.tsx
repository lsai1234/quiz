'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import type { CaffeineAnswer } from '@/lib/consult/types'
import { dropped, fall, knock, still, sway, upright, type Cup, type Stack } from '@/lib/consult/cup-physics'
import { cue } from '@/lib/consult/sound-switch'
import { Glyph, type GlyphName } from '../Glyph'

/**
 * The cups as a physical stack (plan Phase 7.6): one stack per drink. A cup
 * added drops in from above, bounces once and settles; a stack of four or
 * more wobbles as each lands (`cup-physics.ts`). Revisiting the scene, the
 * cups are simply there; under reduced motion they never move.
 *
 * Drawn by writing transforms straight to the cups each frame, so a drop is
 * no React render per frame, and the loop stops once everything is still.
 */

export const CUP = 28
/** How much higher each cup sits than the one under it: on top of it, until a tall stack squeezes up to fit. */
export const STEP = 19
const TALLEST = 80
const step = (n: number) => (n > 1 ? Math.min(STEP, TALLEST / (n - 1)) : STEP)
const DROP = 72

const SIDES = { coffee: -1, tea: 1, energy: -1 } as const

export function CupStack({ value, drinks, reduced }: { value: CaffeineAnswer; drinks: { key: keyof CaffeineAnswer; icon: GlyphName; tone: string }[]; reduced: boolean }) {
  const cups = useRef(new Map<string, Cup>())
  const stacks = useRef(new Map<string, Stack>())
  const els = useRef(new Map<string, HTMLElement>())
  const frame = useRef<number | null>(null)
  const mounted = useRef(false)
  /** Cups that have landed once: only the first landing knocks and sounds. */
  const landed = useRef(new Set<string>())
  /** The counts now, for a loop that started a few taps ago. */
  const counts = useRef(value)
  counts.current = value

  const shown = drinks.filter((d) => value[d.key] > 0)

  useLayoutEffect(() => {
    const ids = new Set(drinks.flatMap((d) => Array.from({ length: value[d.key] }, (_, i) => `${d.key}-${i}`)))
    for (const id of [...cups.current.keys()]) {
      if (!ids.has(id)) {
        cups.current.delete(id)
        landed.current.delete(id)
      }
    }
    for (const id of ids) {
      if (cups.current.has(id)) continue
      // New since the last render: dropped in, unless it was here when the scene opened.
      const drop = mounted.current && !reduced
      cups.current.set(id, drop ? dropped(DROP) : { y: 0, vy: 0, settled: true })
      if (!drop) landed.current.add(id)
      // Up above before it's ever painted at rest.
      const el = els.current.get(id)
      if (el && drop) el.style.transform = `translateY(${-DROP}px)`
    }
    mounted.current = true
    if (reduced) return
    const moving = () => [...cups.current.values()].some((c) => !c.settled) || [...stacks.current.values()].some((s) => !still(s))
    if (!moving() || frame.current !== null) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.034, (now - last) / 1000)
      last = now
      for (const [id, c] of cups.current) {
        if (c.settled) continue
        const { cup, impact } = fall(c, dt)
        cups.current.set(id, cup)
        const key = id.split('-')[0] as keyof CaffeineAnswer
        // Its first landing: a knock for the stack, and a sound if they're on.
        if (impact !== null && !landed.current.has(id)) {
          landed.current.add(id)
          const height = counts.current[key]
          stacks.current.set(key, knock(stacks.current.get(key) ?? upright(), height, impact, SIDES[key]))
          cue('drop')
        }
        const el = els.current.get(id)
        if (el) el.style.transform = `translateY(${cup.y.toFixed(1)}px)`
      }
      for (const [key, s] of stacks.current) {
        const next = sway(s, dt)
        stacks.current.set(key, next)
        const el = els.current.get(`stack-${key}`)
        if (el) el.style.transform = `rotate(${next.angle.toFixed(2)}deg)`
      }
      frame.current = moving() ? requestAnimationFrame(tick) : null
    }
    frame.current = requestAnimationFrame(tick)
  })

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  if (!shown.length) {
    return (
      <span aria-hidden style={{ color: 'var(--amp-ink-3)' }}>
        <Glyph name="cup" size={32} />
      </span>
    )
  }

  return (
    <div aria-hidden className="flex items-end justify-center" style={{ gap: 'var(--amp-space-5)' }} data-cup-stacks>
      {shown.map((d) => {
        const n = value[d.key]
        return (
          <div
            key={d.key}
            ref={(el) => void (el ? els.current.set(`stack-${d.key}`, el) : els.current.delete(`stack-${d.key}`))}
            data-stack={d.key}
            className="relative"
            style={{ width: CUP, height: CUP + (n - 1) * step(n), transformOrigin: '50% 100%', color: d.tone }}
          >
            {Array.from({ length: n }, (_, i) => {
              const id = `${d.key}-${i}`
              const c = cups.current.get(id)
              return (
                <span
                  key={id}
                  ref={(el) => void (el ? els.current.set(id, el) : els.current.delete(id))}
                  data-cup={d.key}
                  className="absolute left-0"
                  style={{ bottom: i * step(n), zIndex: i, transform: c && !c.settled ? `translateY(${c.y}px)` : undefined }}
                >
                  <Glyph name={d.icon} size={CUP} />
                </span>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
