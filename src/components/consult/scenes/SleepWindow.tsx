'use client'

import { useCallback, useRef, type KeyboardEvent } from 'react'
import { clock, QUALITY_LABEL } from '@/lib/consult/summary'
import { sleepHours } from '@/lib/consult/reactions'
import type { SleepAnswer, SleepQuality } from '@/lib/consult/types'
import { haptic, springTransition } from '@/lib/consult/motion'
import { Segmented } from '../controls'
import { Glyph } from '../Glyph'
import { useDrag, type DragPoint } from '../useDrag'
import type { SceneProps } from './registry'

/**
 * The sleep window (build C6).
 *
 * Two handles on a night-sky bar from 20:00 to 12:00 the next day: bedtime on
 * the left, wake-up on the right, the hours between them counting live. Both
 * move in quarter hours and can't cross — there is always at least an hour
 * between them — so the hours shown are always a real night. Then how well
 * they sleep, in one tap.
 *
 * Each handle is its own slider for the keyboard (arrows move 15 minutes). On
 * touch, a press anywhere on the bar takes the nearer handle.
 */

/** The bar runs 20:00 → 12:00: sixteen hours, stored in minutes past 20:00. */
export const TRACK_START = 20 * 60
export const TRACK_SPAN = 16 * 60
export const STEP = 15
export const MIN_GAP = 60
const DEFAULT: SleepAnswer = { bed: 23 * 60, wake: 7 * 60, quality: null }
/** Three ticks, not six: at large text sizes six clock labels don't fit a phone. */
const TICKS = [20, 4, 12]

/** Clock minutes → position along the bar, in minutes from 20:00. */
export function toTrack(minutes: number): number {
  return (minutes - TRACK_START + 1440) % 1440
}

/** Position along the bar → clock minutes. */
export function fromTrack(t: number): number {
  return (t + TRACK_START) % 1440
}

function snap(t: number): number {
  return Math.round(t / STEP) * STEP
}

/**
 * Move one handle to `t` (bar minutes), keeping it on the bar, on the quarter
 * hour, and at least `MIN_GAP` from the other. Returns the new window.
 */
export function moveHandle(window: SleepAnswer, which: 'bed' | 'wake', t: number): SleepAnswer {
  const bed = toTrack(window.bed)
  const wake = toTrack(window.wake)
  if (which === 'bed') {
    const next = Math.max(0, Math.min(wake - MIN_GAP, snap(t)))
    return { ...window, bed: fromTrack(next) }
  }
  const next = Math.min(TRACK_SPAN, Math.max(bed + MIN_GAP, snap(t)))
  return { ...window, wake: fromTrack(next) }
}

const QUALITIES: SleepQuality[] = ['restful', 'ok', 'broken']

export function SleepWindow({ answers, onAnswer, onInteract, comfort }: SceneProps) {
  const value = answers.sleep ?? DEFAULT
  const answered = answers.sleep !== null
  const grabbed = useRef<'bed' | 'wake'>('bed')
  const bedT = toTrack(value.bed)
  const wakeT = toTrack(value.wake)

  const write = useCallback(
    (next: SleepAnswer) => {
      if (next.bed !== value.bed || next.wake !== value.wake) haptic('tick')
      onAnswer({ sleep: next })
    },
    [onAnswer, value.bed, value.wake],
  )

  const onMove = useCallback(
    (p: DragPoint, phase: 'start' | 'move') => {
      const t = p.x * TRACK_SPAN
      if (phase === 'start') grabbed.current = Math.abs(t - bedT) <= Math.abs(t - wakeT) ? 'bed' : 'wake'
      onInteract?.(p.x * 2 - 1)
      write(moveHandle(value, grabbed.current, t))
    },
    [bedT, wakeT, value, write, onInteract],
  )
  const { ref, dragging, handlers } = useDrag<HTMLDivElement>({ onMove })

  function onKey(which: 'bed' | 'wake') {
    return (e: KeyboardEvent<HTMLDivElement>) => {
      const at = which === 'bed' ? bedT : wakeT
      const map: Record<string, number> = {
        ArrowRight: at + STEP,
        ArrowUp: at + STEP,
        ArrowLeft: at - STEP,
        ArrowDown: at - STEP,
        PageUp: at + 60,
        PageDown: at - 60,
      }
      if (!(e.key in map)) return
      e.preventDefault()
      write(moveHandle(value, which, map[e.key]))
    }
  }

  const hours = sleepHours(value)

  const quality = (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)', marginTop: 'var(--amp-space-2)' }}>
      <p className="uppercase" style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-3)' }}>
        How well do you sleep?
      </p>
      <Segmented
        label="How well do you sleep?"
        options={QUALITIES.map((q) => ({ value: q, label: QUALITY_LABEL[q] }))}
        value={value.quality}
        onChange={(q) => onAnswer({ sleep: { ...value, quality: q } })}
      />
    </div>
  )

  // Comfort mode (C14): no drag. Two big steppers, half an hour a press.
  if (comfort) {
    const row = (which: 'bed' | 'wake', label: string) => {
      const t = which === 'bed' ? bedT : wakeT
      return (
        <div
          className="flex flex-wrap items-center justify-between"
          style={{ gap: 'var(--amp-space-2) var(--amp-space-3)', padding: 'var(--amp-space-3) var(--amp-space-4)', borderRadius: 'var(--amp-radius-tile)', background: 'var(--amp-glass-solid)', border: 'var(--amp-hairline) solid var(--amp-edge)' }}
        >
          <span style={{ fontWeight: 'var(--amp-weight-medium)' }}>{label}</span>
          <span className="flex flex-1 items-center justify-end" style={{ gap: 'var(--amp-space-3)' }}>
            <BigStep label={`${label} earlier`} icon="minus" onClick={() => write(moveHandle(value, which, t - 30))} />
            <span style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-lead)', minWidth: 'calc(var(--amp-space-10) + var(--amp-space-6))', textAlign: 'center' }}>
              {clock(which === 'bed' ? value.bed : value.wake)}
            </span>
            <BigStep label={`${label} later`} icon="plus" onClick={() => write(moveHandle(value, which, t + 30))} />
          </span>
        </div>
      )
    }
    return (
      <div className="flex flex-col" style={{ gap: 'var(--amp-space-3)' }}>
        <p aria-live="polite" className="text-center" style={{ fontFamily: 'var(--amp-font-display)', fontWeight: 'var(--amp-weight-heavy)', fontSize: 'var(--amp-text-question)', color: answered ? 'var(--amp-ink)' : 'var(--amp-ink-3)' }}>
          {hours} hours
        </p>
        {row('bed', 'Bedtime')}
        {row('wake', 'Wake-up')}
        {quality}
      </div>
    )
  }
  const pct = (t: number) => `${(t / TRACK_SPAN) * 100}%`
  const move = dragging ? 'none' : springTransition('left', 'right')

  const handle = (which: 'bed' | 'wake') => {
    const t = which === 'bed' ? bedT : wakeT
    const label = which === 'bed' ? 'Bedtime' : 'Wake-up'
    return (
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={TRACK_SPAN}
        aria-valuenow={t}
        aria-valuetext={clock(which === 'bed' ? value.bed : value.wake)}
        onKeyDown={onKey(which)}
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          left: pct(t),
          width: 'calc(var(--amp-space-10) + var(--amp-space-1))',
          height: 'calc(var(--amp-target) * 1.9)',
          borderRadius: 'var(--amp-radius-tile)',
          background: answered ? 'var(--amp-calm)' : 'var(--amp-ink-3)',
          boxShadow: answered ? '0 0 24px -4px var(--amp-calm-glow)' : 'none',
          transition: move,
        }}
      />
    )
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-4)' }}>
      <div className="flex flex-col items-center" aria-live="polite">
        <p className="flex items-baseline" style={{ gap: 'var(--amp-space-2)' }}>
          <span
            style={{
              fontFamily: 'var(--amp-font-display)',
              fontWeight: 'var(--amp-weight-heavy)',
              fontSize: 'var(--amp-text-hero)',
              lineHeight: 1,
              color: answered ? 'var(--amp-ink)' : 'var(--amp-ink-3)',
            }}
          >
            {hours}
          </span>
          <span className="uppercase" style={{ fontFamily: 'var(--amp-font-display)', fontWeight: 'var(--amp-weight-bold)', fontSize: 'var(--amp-text-title)', color: 'var(--amp-ink-3)' }}>
            hours
          </span>
        </p>
        <p style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-body)', color: 'var(--amp-calm)' }}>
          {clock(value.bed)} → {clock(value.wake)}
        </p>
      </div>

      <div
        ref={ref}
        {...handlers}
        className="relative w-full cursor-pointer touch-none select-none"
        style={{
          height: 'calc(var(--amp-target) * 2.2)',
          borderRadius: 'var(--amp-radius-tile)',
          border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
          // Night deepening then lifting towards morning.
          background: 'linear-gradient(to right, var(--amp-volt-fill), var(--amp-glass-solid) 30%, var(--amp-glass-solid) 70%, var(--amp-calm-fill))',
        }}
      >
        {/* Stars. */}
        {[12, 31, 47, 63, 82].map((x, i) => (
          <span
            key={x}
            aria-hidden
            className="absolute"
            style={{
              left: `${x}%`,
              top: `${[28, 64, 40, 72, 34][i]}%`,
              width: 'calc(var(--amp-hairline) * 2)',
              height: 'calc(var(--amp-hairline) * 2)',
              borderRadius: 'var(--amp-radius-pill)',
              background: 'var(--amp-ink-3)',
            }}
          />
        ))}
        {/* The window. */}
        <div
          aria-hidden
          className="absolute"
          style={{
            left: pct(bedT),
            right: `calc(100% - ${pct(wakeT)})`,
            top: '14%',
            bottom: '14%',
            background: answered ? 'var(--amp-calm-fill)' : 'var(--amp-edge)',
            borderTop: `var(--amp-hairline) solid ${answered ? 'var(--amp-calm)' : 'var(--amp-edge-strong)'}`,
            borderBottom: `var(--amp-hairline) solid ${answered ? 'var(--amp-calm)' : 'var(--amp-edge-strong)'}`,
            transition: move,
          }}
        />
        {handle('bed')}
        {handle('wake')}
      </div>

      <div aria-hidden className="flex justify-between" style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', color: 'var(--amp-ink-3)' }}>
        {TICKS.map((h) => (
          <span key={h}>{String(h).padStart(2, '0')}:00</span>
        ))}
      </div>

      {quality}
    </div>
  )
}

function BigStep({ label, icon, onClick }: { label: string; icon: 'plus' | 'minus'; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="amp-press flex items-center justify-center"
      style={{ width: 'var(--amp-target)', height: 'var(--amp-target)', borderRadius: 'var(--amp-radius-pill)', border: 'var(--amp-hairline) solid var(--amp-accent-line)', color: 'var(--amp-accent)' }}
    >
      <Glyph name={icon} size={20} />
    </button>
  )
}
