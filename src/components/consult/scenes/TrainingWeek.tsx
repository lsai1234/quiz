'use client'

import type { CSSProperties } from 'react'
import { DAY_LABEL, INTENSITY_LABEL } from '@/lib/consult/summary'
import type { DayType, Intensity } from '@/lib/consult/types'
import { haptic, stateTransition } from '@/lib/consult/motion'
import { Glyph, type GlyphName } from '../Glyph'
import { Chip, Segmented } from '../controls'
import { WhatsThis } from '../WhatsThis'
import type { SceneProps } from './registry'

/**
 * The training week (build C4).
 *
 * Seven day tiles. Each tap cycles rest → gym → cardio → sport → rest, and a
 * live summary counts the week as you go. Sessions, type and spread in a few
 * taps — a whole week in well under ten seconds.
 *
 * Gym is volt, cardio calm, sport go; rest is the plain glass. "No training
 * right now" answers the scene as seven rest days without tapping any.
 */

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export const CYCLE: DayType[] = ['rest', 'gym', 'cardio', 'sport']
const REST_WEEK: DayType[] = ['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest']

export function cycleDay(day: DayType): DayType {
  return CYCLE[(CYCLE.indexOf(day) + 1) % CYCLE.length]
}

export function weekSummary(week: DayType[]): string {
  const n = week.filter((d) => d !== 'rest').length
  if (n === 0) return 'Rest week'
  const parts = (['gym', 'cardio', 'sport'] as const)
    .map((t) => [t, week.filter((d) => d === t).length] as const)
    .filter(([, c]) => c > 0)
    .map(([t, c]) => `${c} ${DAY_LABEL[t]}`)
  return [`${n} ${n === 1 ? 'session' : 'sessions'}`, ...parts].join(' · ')
}

const LOOK: Record<DayType, { icon: GlyphName; style: CSSProperties; label: string }> = {
  rest: {
    icon: 'minus',
    label: 'var(--amp-ink-3)',
    style: { background: 'var(--amp-glass-solid)', border: 'var(--amp-hairline) solid var(--amp-edge)', color: 'var(--amp-ink-3)' },
  },
  gym: {
    icon: 'gym',
    label: 'var(--amp-ink-on-accent)',
    style: {
      background: 'var(--amp-volt)',
      border: 'var(--amp-hairline) solid transparent',
      color: 'var(--amp-ink-on-accent)',
      boxShadow: '0 0 20px -6px var(--amp-volt-glow)',
    },
  },
  cardio: {
    icon: 'cardio',
    label: 'var(--amp-calm)',
    style: { background: 'var(--amp-calm-fill)', border: 'var(--amp-hairline) solid var(--amp-calm)', color: 'var(--amp-calm)' },
  },
  sport: {
    icon: 'sport',
    label: 'var(--amp-go)',
    style: { background: 'var(--amp-go-fill)', border: 'var(--amp-hairline) solid var(--amp-go)', color: 'var(--amp-go)' },
  },
}

const INTENSITIES: Intensity[] = ['easy', 'steady', 'hard']

export function TrainingWeek({ scene, answers, onAnswer, onInteract, comfort, ai }: SceneProps) {
  const week = answers.week ?? REST_WEEK
  const answered = answers.week !== null
  const allRest = answered && week.every((d) => d === 'rest')

  function tap(i: number) {
    const next = [...week]
    next[i] = cycleDay(week[i])
    haptic('tick')
    onInteract?.((i - 3) / 3)
    onAnswer({ week: next })
  }

  // The performance detail (C12): how hard the sessions are, once there are
  // some. The same block in both layouts.
  const detail = scene.detail && answered && !allRest ? (
    <div className="flex w-full flex-col amp-anim-rise" style={{ gap: 'var(--amp-space-2)' }}>
          <div className="flex items-center justify-between">
            <p className="uppercase" style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-3)' }}>
              How hard do most sessions feel?
            </p>
            <WhatsThis term="intensity" questions={ai} />
          </div>
          <Segmented
            label="How hard do most sessions feel?"
            options={INTENSITIES.map((i) => ({ value: i, label: INTENSITY_LABEL[i] }))}
            value={answers.intensity}
            onChange={(i) => onAnswer({ intensity: i })}
          />
        </div>
  ) : null

  // Comfort mode (C14): no cycling to learn. Each day is a row with its four
  // choices laid out.
  if (comfort) {
    return (
      <div className="flex flex-col" style={{ gap: 'var(--amp-space-3)' }}>
        {DAYS.map((name, i) => (
          <div key={name} className="flex flex-col" style={{ gap: 'var(--amp-space-1)' }}>
            <span style={{ fontWeight: 'var(--amp-weight-medium)' }}>{name}</span>
            <Segmented
              label={name}
              options={CYCLE.map((d) => ({ value: d, label: DAY_LABEL[d] }))}
              value={answered ? week[i] : null}
              onChange={(d) => {
                const next = [...week]
                next[i] = d
                onAnswer({ week: next })
              }}
            />
          </div>
        ))}
        <p aria-live="polite" className="text-center uppercase" style={{ fontFamily: 'var(--amp-font-display)', fontWeight: 'var(--amp-weight-heavy)', fontSize: 'var(--amp-text-title)' }}>
          {answered ? weekSummary(week) : ''}
        </p>
        {detail}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--amp-space-5)' }}>
      <div role="group" aria-label="Your training week" className="grid w-full grid-cols-7" style={{ gap: 'var(--amp-space-1)' }}>
        {week.map((day, i) => {
          const look = LOOK[day]
          return (
            <button
              key={DAYS[i]}
              type="button"
              onClick={() => tap(i)}
              aria-label={`${DAYS[i]}: ${DAY_LABEL[day]}. Tap to change.`}
              className="amp-press amp-day flex flex-col items-center justify-between"
              style={{
                ...look.style,
                minHeight: 'calc(var(--amp-target) * 2.4)',
                padding: 'var(--amp-space-3) 0',
                borderRadius: 'var(--amp-radius-tile)',
                transition: stateTransition('background-color', 'border-color', 'color', 'box-shadow'),
              }}
            >
              <span aria-hidden style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', color: day === 'gym' ? 'var(--amp-ink-on-accent)' : 'var(--amp-ink-2)' }}>
                {DAYS[i][0]}
              </span>
              <Glyph name={look.icon} size={20} />
              <span
                aria-hidden
                className="amp-day-label uppercase"
                style={{
                  fontFamily: 'var(--amp-font-mono)',
                  fontSize: 'calc(var(--amp-text-data) * 0.85)',
                  letterSpacing: 'var(--amp-tracking-data-tight)',
                  fontWeight: 'var(--amp-weight-bold)',
                  color: look.label,
                }}
              >
                {DAY_LABEL[day]}
              </span>
            </button>
          )
        })}
      </div>

      <p
        aria-live="polite"
        className="text-center uppercase"
        style={{
          fontFamily: 'var(--amp-font-display)',
          fontWeight: 'var(--amp-weight-heavy)',
          fontSize: 'var(--amp-text-title)',
          lineHeight: 'var(--amp-leading-tight)',
          color: answered ? 'var(--amp-ink)' : 'var(--amp-ink-3)',
        }}
      >
        {answered ? weekSummary(week) : 'Tap the days you train'}
      </p>

      <div aria-hidden className="flex items-center" style={{ gap: 'var(--amp-space-4)', fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
        {(['gym', 'cardio', 'sport'] as const).map((t) => (
          <span key={t} className="inline-flex items-center" style={{ gap: 'var(--amp-space-1)' }}>
            <span style={{ width: 'var(--amp-space-3)', height: 'var(--amp-space-3)', borderRadius: 'var(--amp-space-1)', background: t === 'gym' ? 'var(--amp-volt)' : t === 'cardio' ? 'var(--amp-calm)' : 'var(--amp-go)' }} />
            {DAY_LABEL[t]}
          </span>
        ))}
      </div>

      <Chip label="No training right now" selected={allRest} onToggle={() => onAnswer({ week: allRest ? null : REST_WEEK })} />

      {detail}
    </div>
  )
}
