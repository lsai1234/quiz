'use client'

import type { CaffeineAnswer } from '@/lib/consult/types'
import { caffeineCount } from '@/lib/consult/reactions'
import { haptic, staggerStyle } from '@/lib/consult/motion'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { Glyph, type GlyphName } from '../Glyph'
import { Chip, Hint } from '../controls'
import type { SceneProps } from './registry'

/**
 * The cup counter (build C8).
 *
 * Tap to stack coffees, teas and energy drinks. The day's count shows twice:
 * as a big number, and as a row of cups you can see growing. It feeds the
 * stimulant rules — four or more a day and nothing with caffeine goes in the
 * stack, which the scene says out loud so it isn't a surprise later.
 *
 * Energy drinks are the one drink in the warm caution tone: they are the one
 * that carries meaning (the most caffeine per serving).
 */

export const STIMULANT_LIMIT = 4
/** Beyond this it stops adding cups: the count is the point, not the tally. */
export const MAX_PER_DRINK = 8

const DRINKS: { key: keyof CaffeineAnswer; label: string; icon: GlyphName; tone: string }[] = [
  { key: 'coffee', label: 'Coffee', icon: 'cup', tone: 'var(--amp-accent)' },
  { key: 'tea', label: 'Tea', icon: 'tea', tone: 'var(--amp-calm)' },
  { key: 'energy', label: 'Energy drink', icon: 'can', tone: 'var(--amp-caution)' },
]

const NONE: CaffeineAnswer = { coffee: 0, tea: 0, energy: 0 }

export function CupCounter({ answers, onAnswer }: SceneProps) {
  const reduced = useReducedMotion()
  const value = answers.caffeine ?? NONE
  const total = caffeineCount(value)
  const answered = answers.caffeine !== null

  function change(key: keyof CaffeineAnswer, delta: number) {
    const next = Math.max(0, Math.min(MAX_PER_DRINK, value[key] + delta))
    if (next === value[key] && answered) return
    haptic('tick')
    onAnswer({ caffeine: { ...value, [key]: next } })
  }

  const cups = DRINKS.flatMap((d) => Array.from({ length: value[d.key] }, (_, i) => ({ ...d, n: i })))

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--amp-space-5)' }}>
      <div className="flex flex-col items-center" aria-live="polite">
        <span
          style={{
            fontFamily: 'var(--amp-font-display)',
            fontWeight: 'var(--amp-weight-heavy)',
            fontSize: 'var(--amp-text-hero)',
            lineHeight: 1,
            color: answered ? 'var(--amp-ink)' : 'var(--amp-ink-3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {total}
        </span>
        <span className="uppercase" style={{ fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-data)', letterSpacing: 'var(--amp-tracking-data)', color: 'var(--amp-ink-3)' }}>
          {total === 1 ? 'drink a day' : 'drinks a day'}
        </span>
      </div>

      {/* The stack, as cups. */}
      <div aria-hidden className="flex flex-wrap items-end justify-center" style={{ gap: 'var(--amp-space-1)', minHeight: 'var(--amp-space-10)', maxWidth: '100%' }}>
        {cups.length === 0 ? (
          <span style={{ color: 'var(--amp-ink-3)' }}>
            <Glyph name="cup" size={32} />
          </span>
        ) : (
          cups.map((c, i) => (
            <span key={`${c.key}-${c.n}`} className="amp-anim-rise" style={{ color: c.tone, ...staggerStyle(0, reduced) }} data-cup={c.key}>
              <Glyph name={c.icon} size={i < 12 ? 32 : 24} />
            </span>
          ))
        )}
      </div>

      <ul className="flex w-full flex-col" style={{ gap: 'var(--amp-space-2)' }}>
        {DRINKS.map((d) => (
          <li
            key={d.key}
            className="flex items-center"
            style={{
              gap: 'var(--amp-space-3)',
              padding: 'var(--amp-space-2) var(--amp-space-2) var(--amp-space-2) var(--amp-space-4)',
              borderRadius: 'var(--amp-radius-tile)',
              background: 'var(--amp-glass-solid)',
              border: 'var(--amp-hairline) solid var(--amp-edge)',
            }}
          >
            <span style={{ color: d.tone }}>
              <Glyph name={d.icon} size={22} />
            </span>
            <span className="flex-1" style={{ fontWeight: 'var(--amp-weight-medium)' }}>
              {d.label}
            </span>
            <Stepper label={d.label} count={value[d.key]} onMinus={() => change(d.key, -1)} onPlus={() => change(d.key, 1)} />
          </li>
        ))}
      </ul>

      <div aria-live="polite" className="flex flex-col items-center" style={{ gap: 'var(--amp-space-3)' }}>
        {total >= STIMULANT_LIMIT ? (
          <Hint tone="caution">That&apos;s plenty. I&apos;ll keep anything with caffeine out.</Hint>
        ) : (
          <Chip label="None" selected={answered && total === 0} onToggle={() => onAnswer({ caffeine: answered && total === 0 ? null : NONE })} />
        )}
      </div>
    </div>
  )
}

function Stepper({ label, count, onMinus, onPlus }: { label: string; count: number; onMinus: () => void; onPlus: () => void }) {
  const button = (kind: 'minus' | 'plus', onClick: () => void, disabled: boolean) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${kind === 'plus' ? 'Add' : 'Remove'} ${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label.toLowerCase()}`}
      className="amp-press flex items-center justify-center"
      style={{
        width: 'var(--amp-target)',
        height: 'var(--amp-target)',
        borderRadius: 'var(--amp-radius-pill)',
        border: `var(--amp-hairline) solid ${kind === 'plus' ? 'var(--amp-accent-line)' : 'var(--amp-edge-strong)'}`,
        color: kind === 'plus' ? 'var(--amp-accent)' : 'var(--amp-ink-2)',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Glyph name={kind} size={18} />
    </button>
  )
  return (
    <span className="flex items-center" style={{ gap: 'var(--amp-space-2)' }}>
      {button('minus', onMinus, count === 0)}
      <span
        aria-live="polite"
        aria-label={`${count} ${label.toLowerCase()}${count === 1 ? '' : 's'}`}
        style={{ minWidth: 'var(--amp-space-5)', textAlign: 'center', fontFamily: 'var(--amp-font-mono)', fontSize: 'var(--amp-text-lead)', fontVariantNumeric: 'tabular-nums' }}
      >
        {count}
      </span>
      {button('plus', onPlus, count >= MAX_PER_DRINK)}
    </span>
  )
}
