'use client'

import { useCallback, useRef } from 'react'
import { CURVE_HOURS, CURVE_MAX, PRESET_LABEL, PRESET_POINTS, curvePatch, curveWords, pointsFromStroke, readCurve, type CurvePreset, type EnergyCurve } from '@/lib/consult/day-curve'
import { haptic, springTransition } from '@/lib/consult/motion'
import { useDrag, type DragPoint } from '../useDrag'
import { Tile, radioArrows } from '../controls'
import type { SceneProps } from './registry'

/**
 * Shape your day (plan Phase 7.4): energy from 06:00 to midnight, replacing
 * the battery. Draw it with a finger; then drag any point up or down to
 * fine-tune it. Five shapes sit under it for the keyboard, and in comfort
 * mode they're the way in (the curve shows the one picked, still).
 *
 * The afternoon level stays the 1–10 energy answer (`curvePatch`), so
 * everything that read the battery reads the curve the same way.
 */

/** A point is "grabbed" within this share of the width of it, and this many levels of it. */
const GRAB = 0.06
const GRAB_LEVELS = 1.5

const PRESETS: CurvePreset[] = ['steady', 'slow-starter', 'dip-3pm', 'second-wind', 'unsure']

/** x 0–100 across the hours, y 0–50 with full at the top. */
const px = (i: number) => (i / (CURVE_HOURS.length - 1)) * 100
const py = (level: number) => 46 - (level / CURVE_MAX) * 42
/** The pointer's height on the box (0–1) as the curve's own: 0 at full, 1 at empty, as drawn. */
const curveY = (y: number) => Math.min(1, Math.max(0, (y * 56 - 6) / 42))

/** A smooth line through the points (Catmull-Rom as cubic Béziers). */
function smooth(points: readonly number[]): string {
  const p = points.map((l, i) => [px(i), py(l)] as const)
  let d = `M${p[0][0]} ${p[0][1]}`
  for (let i = 0; i < p.length - 1; i++) {
    const [a, b, c, e] = [p[i - 1] ?? p[i], p[i], p[i + 1], p[i + 2] ?? p[i + 1]]
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6]
    const c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6]
    d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${c[0]} ${c[1].toFixed(2)}`
  }
  return d
}

export function DayCurve({ answers, onAnswer, onInteract, comfort }: SceneProps) {
  const curve = answers.energyCurve
  const points = curve?.points ?? null
  const stroke = useRef<{ mode: 'draw' | 'point'; index: number; samples: { x: number; y: number }[]; base: number[] | null } | null>(null)

  const write = useCallback((next: EnergyCurve) => onAnswer(curvePatch(next)), [onAnswer])

  const onMove = useCallback(
    (p: DragPoint, phase: 'start' | 'move') => {
      onInteract?.(p.x * 2 - 1)
      const y = curveY(p.y)
      if (phase === 'start') {
        // On a point of a curve already there: fine-tune that point. Anywhere else: draw.
        const index = Math.round(p.x * (CURVE_HOURS.length - 1))
        const near = points && Math.abs(p.x - index / (CURVE_HOURS.length - 1)) <= GRAB && Math.abs((1 - y) * CURVE_MAX - points[index]) <= GRAB_LEVELS
        stroke.current = near ? { mode: 'point', index, samples: [], base: points } : { mode: 'draw', index, samples: [], base: points }
      }
      const s = stroke.current
      if (!s) return
      if (s.mode === 'point' && s.base) {
        const level = Math.round((1 - y) * CURVE_MAX)
        if (level === s.base[s.index] && phase === 'move') return
        const next = [...s.base]
        next[s.index] = level
        s.base = next
        haptic('tick')
        write({ points: next, how: 'drawn', preset: null })
        return
      }
      s.samples.push({ x: p.x, y })
      write({ points: pointsFromStroke(s.samples, s.base), how: 'drawn', preset: null })
    },
    [points, write, onInteract],
  )
  const { ref, dragging, handlers } = useDrag<HTMLDivElement>({ onMove, onEnd: () => (stroke.current = null) })

  const shape = points ? readCurve(points) : null
  const dipIndex = shape?.dip ? CURVE_HOURS.indexOf((shape.dip.at / 60) as (typeof CURVE_HOURS)[number]) : -1
  const picked = curve?.how === 'preset' ? curve.preset : null

  // In comfort mode the shapes are the way in, so they come first; the curve shows the one picked.
  const shapes = (
    <div role="radiogroup" aria-label={comfort ? 'The shape most like your day' : 'Or pick the shape most like your day'} className={`grid ${comfort ? 'grid-cols-1' : 'grid-cols-2'}`} style={{ gap: 'var(--amp-space-2)' }} onKeyDown={(e) => radioArrows(e)}>
      {PRESETS.map((id) => (
        <Tile
          key={id}
          kind="radio"
          layout={comfort ? 'row' : 'compact'}
          label={PRESET_LABEL[id]}
          selected={picked === id}
          onSelect={() => write({ points: id === 'unsure' ? null : [...PRESET_POINTS[id]], how: 'preset', preset: id })}
        />
      ))}
    </div>
  )

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-4)' }}>
      {comfort && shapes}
      <div
        ref={comfort ? undefined : ref}
        {...(comfort ? {} : handlers)}
        role="img"
        aria-label={points ? `${curveWords(points)}. Draw again, or drag a point, to change it.` : curve?.preset === 'unsure' ? 'Not sure. Draw your day, or pick a shape below.' : 'Draw your energy from 6am to midnight, or pick a shape below.'}
        data-day-curve={points ? 'set' : 'empty'}
        className={`relative w-full select-none ${comfort ? '' : 'cursor-crosshair touch-none'}`}
        style={{ aspectRatio: '2 / 1', borderRadius: 'var(--amp-radius-tile)', border: 'var(--amp-hairline) solid var(--amp-edge-strong)', background: 'var(--amp-glass-solid)' }}
      >
        <svg viewBox="0 -2 100 56" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full" style={{ clipPath: 'inset(0 round var(--amp-radius-tile))' }}>
          {/* 06, 12, 18, 24 */}
          {[0, 3, 6, 9].map((i) => (
            <line key={i} x1={px(i)} x2={px(i)} y1="2" y2="48" stroke="var(--amp-edge)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
          ))}
          {points && (
            <>
              <path d={`${smooth(points)}L100 54L0 54Z`} fill="var(--amp-accent-fill)" />
              <path d={smooth(points)} fill="none" stroke="var(--amp-accent)" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ transition: dragging ? 'none' : springTransition('d') }} />
            </>
          )}
        </svg>
        {/* Points to fine-tune, and the dip, as round marks (not stretched with the chart). */}
        {points &&
          points.map((l, i) => (
            <span
              key={i}
              aria-hidden
              data-curve-point={CURVE_HOURS[i]}
              className="absolute"
              style={{
                left: `${px(i)}%`,
                top: `${((py(l) + 2) / 56) * 100}%`,
                width: i === dipIndex ? 'var(--amp-space-4)' : 'var(--amp-space-3)',
                height: i === dipIndex ? 'var(--amp-space-4)' : 'var(--amp-space-3)',
                transform: 'translate(-50%, -50%)',
                borderRadius: 'var(--amp-radius-pill)',
                background: i === dipIndex ? 'var(--amp-sun)' : 'var(--amp-ground)',
                border: `calc(var(--amp-hairline) * 2) solid ${i === dipIndex ? 'var(--amp-sun)' : 'var(--amp-accent)'}`,
                transition: dragging ? 'none' : springTransition('top'),
              }}
            />
          ))}
        {shape?.dip && (
          <span
            aria-hidden
            className="absolute uppercase"
            style={{ left: `${px(dipIndex)}%`, top: `${((py(points![dipIndex]) + 2) / 56) * 100}%`, transform: 'translate(-50%, 60%)', fontFamily: 'var(--amp-font-label)', fontSize: 'var(--amp-text-data)', color: 'var(--amp-sun)' }}
          >
            Dip
          </span>
        )}
        {!points && !comfort && (
          <span aria-hidden className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--amp-ink-3)', fontSize: 'var(--amp-text-meta)' }}>
            Draw with your finger, left to right
          </span>
        )}
      </div>
      <div aria-hidden className="flex justify-between" style={{ fontFamily: 'var(--amp-font-label)', fontSize: 'var(--amp-text-data)', color: 'var(--amp-ink-3)', marginTop: 'calc(var(--amp-space-3) * -1)' }}>
        <span>6am</span>
        <span>Noon</span>
        <span>6pm</span>
        <span>Midnight</span>
      </div>
      {!comfort && shapes}
    </div>
  )
}
