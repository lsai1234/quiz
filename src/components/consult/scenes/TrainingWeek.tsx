'use client'

import { journeyOf, type Journey } from '@/lib/consult/journey'
import { useState, type CSSProperties } from 'react'
import { DAY_LABEL, INTENSITY_LABEL } from '@/lib/consult/summary'
import type { Intensity } from '@/lib/consult/types'
import {
  ACTIVITIES,
  NO_SESSIONS,
  REST_DAYS,
  countsByType,
  sessionsLabel,
  sessionsPerWeek,
  type Activity,
  type TrainingAnswer,
} from '@/lib/consult/training'
import { haptic, stateTransition } from '@/lib/consult/motion'
import { Glyph, type GlyphName } from '../Glyph'
import { Chip, Segmented } from '../controls'
import { WhatsThis } from '../WhatsThis'
import type { SceneProps } from './registry'

/**
 * The training week (build C4, reworked in plan v4).
 *
 * Two ways in, because weeks aren't all the same:
 *
 *   Same most weeks  Seven day tiles. Tap a day, then what you do on it —
 *                    gym, cardio, sport, or more than one (gym in the
 *                    morning, five-a-side at night).
 *   It varies        No fixed days: roughly how many sessions of each kind in
 *                    a typical week, thinking back over the last month.
 *
 * Gym is volt, cardio calm, sport go; rest is the plain glass. "No training
 * right now" answers the scene without tapping anything else.
 */

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

const MAX_A_WEEK = 14

/** Add or remove one activity on one day. */
export function toggleActivity(t: TrainingAnswer | null, day: number, activity: Activity): TrainingAnswer {
  const base: TrainingAnswer = t ?? { mode: 'days', days: REST_DAYS.map(() => []), average: { ...NO_SESSIONS } }
  const days = base.days.map((d, i) => {
    if (i !== day) return d
    const next = d.includes(activity) ? d.filter((a) => a !== activity) : [...d, activity]
    return ACTIVITIES.filter((a) => next.includes(a))
  })
  return { ...base, mode: 'days', days }
}

/** Switch between "same most weeks" and "it varies", carrying the count across. */
export function switchMode(t: TrainingAnswer | null, mode: TrainingAnswer['mode']): TrainingAnswer | null {
  if (!t) return mode === 'days' ? null : { mode, days: REST_DAYS.map(() => []), average: { ...NO_SESSIONS } }
  if (t.mode === mode) return t
  // Days → average: start the counters from the week they tapped in.
  if (mode === 'average') return { ...t, mode, average: countsByType(t) }
  return { ...t, mode }
}

/** The week in words, for the live line under the tiles. */
export function trainingSummary(t: TrainingAnswer, names: Record<Activity, string> = DAY_LABEL): string {
  const n = sessionsPerWeek(t)
  if (n === 0) return 'No training right now'
  const by = countsByType(t)
  const parts = ACTIVITIES.filter((a) => by[a] > 0).map((a) => `${sessionsLabel(by[a])} ${names[a]}`)
  const lead = t.mode === 'average' ? `About ${sessionsLabel(n)} a week` : `${sessionsLabel(n)} ${n === 1 ? 'session' : 'sessions'}`
  return [lead, ...parts].join(' · ')
}

const LOOK: Record<Activity | 'rest', { icon: GlyphName; style: CSSProperties; label: string }> = {
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

/**
 * What the activities are called, by journey (batch 5). Short words fit a day
 * tile; the chips have room to say what counts. For an active ager a walk,
 * a swim or an afternoon in the garden is the week's activity, and calling it
 * "cardio" and "sport" would say this consult isn't for them.
 */
export function activityWords(journey: Journey): { short: Record<Activity, string>; long: Record<Activity, string> } {
  if (journey === 'ager')
    return {
      short: { gym: 'Gym', cardio: 'Walk', sport: 'Active' },
      long: { gym: 'Gym or a class', cardio: 'Walk, swim or cycle', sport: 'Gardening, golf, dancing' },
    }
  if (journey === 'weight')
    return { short: DAY_LABEL, long: { gym: 'Gym or a class', cardio: 'Walk, run or cycle', sport: 'Sport' } }
  return { short: DAY_LABEL, long: DAY_LABEL }
}

export function TrainingWeek({ scene, answers, onAnswer, onInteract, comfort, ai }: SceneProps) {
  const t = answers.training
  const mode = t?.mode ?? 'days'
  const days = t?.days ?? REST_DAYS
  const answered = t !== null
  const restWeek = answered && sessionsPerWeek(t) === 0
  // The day being set, in "same most weeks". Nothing is chosen until tapped.
  const [editing, setEditing] = useState<number | null>(null)
  const words = activityWords(journeyOf(answers))
  const dayWords = (d: Activity[]) => (d.length === 0 ? 'Rest' : d.map((a) => words.short[a]).join(' and '))

  const write = (next: TrainingAnswer | null) => onAnswer({ training: next })

  function pickDay(i: number) {
    haptic('tick')
    onInteract?.((i - 3) / 3)
    setEditing(i)
  }

  function toggle(i: number, a: Activity) {
    haptic('tick')
    write(toggleActivity(t, i, a))
  }

  function step(a: Activity, delta: number) {
    const base = t && t.mode === 'average' ? t : switchMode(t, 'average')!
    const value = Math.max(0, Math.min(MAX_A_WEEK, base.average[a] + delta))
    haptic('tick')
    write({ ...base, average: { ...base.average, [a]: value } })
  }

  const modeSwitch = (
    <Segmented
      label="Is your training the same most weeks?"
      options={[
        { value: 'days', label: 'Same most weeks' },
        { value: 'average', label: 'It varies' },
      ]}
      value={mode}
      onChange={(m) => {
        setEditing(null)
        write(switchMode(t, m))
      }}
    />
  )

  // The performance detail (C12): how hard the sessions are, once there are
  // some. The same block in every layout.
  const detail =
    scene.detail && answered && !restWeek ? (
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

  const summary = (
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
      {answered ? trainingSummary(t, words.short) : mode === 'days' ? 'Tap a day to start' : 'Set a typical week'}
    </p>
  )

  const noTraining = (
    <Chip
      label="No training right now"
      selected={restWeek}
      onToggle={() => {
        setEditing(null)
        write(restWeek ? null : { mode: 'days', days: REST_DAYS.map(() => []), average: { ...NO_SESSIONS } })
      }}
    />
  )

  /* ── It varies: sessions a week, on average ─────────────────────────── */
  if (mode === 'average') {
    const avg = t?.average ?? NO_SESSIONS
    return (
      <div className="flex w-full flex-col" style={{ gap: 'var(--amp-space-4)' }}>
        {modeSwitch}
        <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>Think back over the last month: about how many a week, on average?</p>
        <ul className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }} aria-label="Sessions in a typical week">
          {ACTIVITIES.map((a) => (
            <li
              key={a}
              className="flex items-center justify-between"
              style={{
                gap: 'var(--amp-space-3)',
                padding: 'var(--amp-space-2) var(--amp-space-3)',
                borderRadius: 'var(--amp-radius-tile)',
                border: 'var(--amp-hairline) solid var(--amp-edge)',
                background: 'var(--amp-glass-solid)',
              }}
            >
              <span className="flex items-center" style={{ gap: 'var(--amp-space-2)', color: LOOK[a].label === 'var(--amp-ink-on-accent)' ? 'var(--amp-volt)' : LOOK[a].label }}>
                <Glyph name={LOOK[a].icon} size={20} />
                <span style={{ color: 'var(--amp-ink)', fontWeight: 'var(--amp-weight-medium)' }}>{words.long[a]}</span>
              </span>
              <span className="flex items-center" style={{ gap: 'var(--amp-space-2)' }}>
                <StepButton label={`Fewer ${words.short[a].toLowerCase()} sessions`} icon="minus" onClick={() => step(a, -1)} disabled={avg[a] <= 0} />
                <span
                  aria-live="polite"
                  aria-label={`${sessionsLabel(avg[a])} ${words.short[a].toLowerCase()} a week`}
                  className="text-center"
                  style={{ minWidth: 'var(--amp-space-10)', fontFamily: 'var(--amp-font-display)', fontWeight: 'var(--amp-weight-heavy)', fontSize: 'var(--amp-text-title)' }}
                >
                  {sessionsLabel(avg[a])}
                </span>
                <StepButton label={`More ${words.short[a].toLowerCase()} sessions`} icon="plus" onClick={() => step(a, 1)} disabled={avg[a] >= MAX_A_WEEK} />
              </span>
            </li>
          ))}
        </ul>
        {summary}
        <div className="flex justify-center">{noTraining}</div>
        {detail}
      </div>
    )
  }

  /* ── Same most weeks: day by day ─────────────────────────────────────── */
  const editor =
    editing !== null ? (
      <div
        className="amp-anim-rise flex w-full flex-col"
        style={{ gap: 'var(--amp-space-2)', padding: 'var(--amp-space-3)', borderRadius: 'var(--amp-radius-tile)', border: 'var(--amp-hairline) solid var(--amp-accent-line)', background: 'var(--amp-glass-solid)' }}
      >
        <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
          <strong style={{ color: 'var(--amp-ink)' }}>{DAYS[editing]}</strong>: tap all that apply
        </p>
        <div role="group" aria-label={`${DAYS[editing]}: what you do`} className="flex flex-wrap" style={{ gap: 'var(--amp-space-2)' }}>
          {ACTIVITIES.map((a) => (
            <Chip key={a} label={words.long[a]} icon={LOOK[a].icon} selected={days[editing].includes(a)} onToggle={() => toggle(editing, a)} />
          ))}
        </div>
      </div>
    ) : null

  // Comfort mode (C14): every day laid out as a row of big choices.
  if (comfort) {
    return (
      <div className="flex flex-col" style={{ gap: 'var(--amp-space-3)' }}>
        {modeSwitch}
        {DAYS.map((name, i) => (
          <div key={name} className="flex flex-col" style={{ gap: 'var(--amp-space-1)' }}>
            <span style={{ fontWeight: 'var(--amp-weight-medium)' }}>{name}</span>
            <div role="group" aria-label={name} className="flex flex-wrap" style={{ gap: 'var(--amp-space-2)' }}>
              {ACTIVITIES.map((a) => (
                <Chip key={a} label={words.long[a]} icon={LOOK[a].icon} selected={days[i].includes(a)} onToggle={() => toggle(i, a)} />
              ))}
            </div>
          </div>
        ))}
        {summary}
        <div className="flex justify-center">{noTraining}</div>
        {detail}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--amp-space-4)' }}>
      {modeSwitch}
      <div role="group" aria-label="Your training week" className="grid w-full grid-cols-7" style={{ gap: 'var(--amp-space-1)' }}>
        {days.map((day, i) => {
          const look = LOOK[day[0] ?? 'rest']
          const on = editing === i
          return (
            <button
              key={DAYS[i]}
              type="button"
              onClick={() => pickDay(i)}
              aria-label={`${DAYS[i]}: ${dayWords(day)}. Tap to change.`}
              aria-pressed={on}
              className="amp-press amp-day relative flex flex-col items-center justify-between"
              style={{
                ...look.style,
                minHeight: 'calc(var(--amp-target) * 2)',
                padding: 'var(--amp-space-2) 0',
                borderRadius: 'var(--amp-radius-tile)',
                outline: on ? 'calc(var(--amp-hairline) * 2) solid var(--amp-accent)' : 'none',
                outlineOffset: 'calc(var(--amp-hairline) * 2)',
                transition: stateTransition('background-color', 'border-color', 'color', 'box-shadow'),
              }}
            >
              <span aria-hidden style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', color: day[0] === 'gym' ? 'var(--amp-ink-on-accent)' : 'var(--amp-ink-2)' }}>
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
                {day.length > 1 ? `+${day.length - 1}` : day[0] ? words.short[day[0]] : DAY_LABEL.rest}
              </span>
            </button>
          )
        })}
      </div>
      {editor}
      {summary}
      {noTraining}
      {detail}
    </div>
  )
}

function StepButton({ label, icon, onClick, disabled }: { label: string; icon: 'minus' | 'plus'; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="amp-press flex items-center justify-center"
      style={{
        width: 'var(--amp-target)',
        height: 'var(--amp-target)',
        borderRadius: 'var(--amp-radius-pill)',
        border: 'var(--amp-hairline) solid var(--amp-accent-line)',
        color: 'var(--amp-accent)',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Glyph name={icon} size={18} />
    </button>
  )
}
