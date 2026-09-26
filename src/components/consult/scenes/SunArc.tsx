'use client'

import { useCallback, type KeyboardEvent } from 'react'
import { DAYLIGHT_LABEL } from '@/lib/consult/summary'
import type { Daylight } from '@/lib/consult/types'
import { haptic, springTransition, stateTransition } from '@/lib/consult/motion'
import { useDrag, type DragPoint } from '../useDrag'
import { Tile, radioArrows } from '../controls'
import { WhatsThis } from '../WhatsThis'
import type { SceneProps } from './registry'

/**
 * The sun arc (build C7).
 *
 * Drag the sun along an arc to say how often you get daylight. Four clear
 * steps, from low on the horizon ("hardly ever") to high overhead ("every
 * day"), and the glow grows as it rises. It feeds the vitamin D logic, so it
 * is the one scene allowed the warm sun colour.
 *
 * The sun is a slider for the keyboard; the four step bars under the label are
 * also buttons, for anyone who'd rather tap than drag.
 */

export const DAYLIGHT_STEPS: Daylight[] = ['hardly', 'some', 'most', 'daily']

/** The SVG's drawing box. The arc is a half-ellipse sitting on the horizon. */
const W = 320
const H = 180
const CX = W / 2
const CY = H - 20
const RX = 130
const RY = 130

/** Where on the arc each step sits: angle in degrees, 180 = left horizon, 90 = overhead. */
const ANGLES = [168, 138, 112, 90]

export function sunPosition(step: number): { x: number; y: number } {
  const a = (ANGLES[step] * Math.PI) / 180
  return { x: CX + RX * Math.cos(a), y: CY - RY * Math.sin(a) }
}

/** The nearest step to a point in the drawing box. */
export function stepNearest(x: number, y: number): number {
  let best = 0
  let bestD = Infinity
  ANGLES.forEach((_, i) => {
    const p = sunPosition(i)
    const d = (p.x - x) ** 2 + (p.y - y) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

export function SunArc({ answers, onAnswer, onInteract, comfort, ai }: SceneProps) {
  const current = answers.daylight
  const step = current ? DAYLIGHT_STEPS.indexOf(current) : 0

  const set = useCallback(
    (i: number) => {
      const next = DAYLIGHT_STEPS[Math.max(0, Math.min(DAYLIGHT_STEPS.length - 1, i))]
      if (next !== current) {
        haptic('tick')
        onAnswer({ daylight: next })
      }
    },
    [current, onAnswer],
  )

  const onMove = useCallback(
    (p: DragPoint) => {
      onInteract?.(p.x * 2 - 1)
      set(stepNearest(p.x * W, p.y * H))
    },
    [set, onInteract],
  )
  const { ref, dragging, handlers } = useDrag<HTMLDivElement>({ onMove })

  function onKeyDown(e: KeyboardEvent<SVGGElement>) {
    const map: Record<string, number> = {
      ArrowRight: step + 1,
      ArrowUp: step + 1,
      ArrowLeft: step - 1,
      ArrowDown: step - 1,
      Home: 0,
      End: DAYLIGHT_STEPS.length - 1,
    }
    if (!(e.key in map)) return
    e.preventDefault()
    set(map[e.key])
  }

  // Comfort mode (C14): the four steps as big buttons, no dragging.
  if (comfort) {
    return (
      <div role="radiogroup" aria-label="Daylight" onKeyDown={radioArrows} className="grid grid-cols-1" style={{ gap: 'var(--amp-space-2)' }}>
        {DAYLIGHT_STEPS.map((d, i) => (
          <Tile key={d} kind="radio" layout="row" tone="sun" icon="sun" label={DAYLIGHT_LABEL[d]} selected={d === current} onSelect={() => set(i)} />
        ))}
      </div>
    )
  }

  const sun = sunPosition(step)
  const rise = current ? (step + 1) / DAYLIGHT_STEPS.length : 0
  const glow = 14 + rise * 26

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--amp-space-4)' }}>
      <div
        ref={ref}
        {...handlers}
        className="relative w-full cursor-pointer touch-none select-none overflow-hidden"
        style={{
          borderRadius: 'var(--amp-radius-panel)',
          border: `var(--amp-hairline) solid ${current ? 'var(--amp-sun-line)' : 'var(--amp-edge-strong)'}`,
          background: `radial-gradient(ellipse 70% 80% at 50% 100%, ${current ? 'var(--amp-sun-fill)' : 'transparent'}, transparent), var(--amp-glass-solid)`,
          transition: stateTransition('border-color'),
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
          <path
            d={`M ${CX - RX} ${CY} A ${RX} ${RY} 0 0 1 ${CX + RX} ${CY}`}
            fill="none"
            stroke="var(--amp-ink-3)"
            strokeWidth={2}
            strokeDasharray="3 7"
            strokeLinecap="round"
          />
          <line x1={0} x2={W} y1={CY} y2={CY} stroke="var(--amp-edge-strong)" strokeWidth={1} />
          <g
            role="slider"
            tabIndex={0}
            aria-label="Daylight"
            aria-valuemin={0}
            aria-valuemax={DAYLIGHT_STEPS.length - 1}
            aria-valuenow={current ? step : undefined}
            aria-valuetext={current ? DAYLIGHT_LABEL[current] : 'Not set'}
            onKeyDown={onKeyDown}
            style={{
              transform: `translate(${sun.x}px, ${sun.y}px)`,
              transition: dragging ? 'none' : springTransition('transform'),
              outline: 'none',
            }}
          >
            <circle r={24} fill="var(--amp-sun)" opacity={current ? 0.18 : 0.08} style={{ filter: `blur(${glow / 4}px)` }} />
            <circle
              r={17}
              fill={current ? 'var(--amp-sun)' : 'var(--amp-ink-3)'}
              style={{ filter: current ? `drop-shadow(0 0 ${glow}px var(--amp-sun-glow))` : undefined, transition: stateTransition('fill') }}
            />
          </g>
        </svg>
      </div>

      <span className="self-end" style={{ marginTop: 'calc(var(--amp-space-3) * -1)' }}>
        <WhatsThis term="daylight" questions={ai} />
      </span>
      <p
        aria-hidden
        className="uppercase"
        style={{
          fontFamily: 'var(--amp-font-display)',
          fontWeight: 'var(--amp-weight-heavy)',
          fontSize: 'var(--amp-text-question)',
          lineHeight: 'var(--amp-leading-question)',
          color: current ? 'var(--amp-ink)' : 'var(--amp-ink-3)',
        }}
      >
        {current ? DAYLIGHT_LABEL[current] : 'Drag the sun'}
      </p>

      <div role="radiogroup" aria-label="Daylight steps" onKeyDown={radioArrows} className="grid w-full grid-cols-4" style={{ gap: 'var(--amp-space-2)' }}>
        {DAYLIGHT_STEPS.map((d, i) => {
          const lit = current !== null && i <= step
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={d === current}
              aria-label={DAYLIGHT_LABEL[d]}
              onClick={() => set(i)}
              className="amp-press flex items-center"
              style={{ minHeight: 'var(--amp-target)' }}
            >
              <span
                className="block w-full"
                style={{
                  height: 'var(--amp-space-1)',
                  borderRadius: 'var(--amp-radius-pill)',
                  background: lit ? 'var(--amp-sun)' : 'var(--amp-edge-strong)',
                  transition: stateTransition('background-color'),
                }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
