'use client'

import { useState } from 'react'
import { HEALTH_DATA_VERSION } from '@/lib/legal/versions'
import { CIRCUIT_LABEL } from '@/lib/consult/summary'
import type { CircuitAnswer, CircuitFlag } from '@/lib/consult/types'
import { stateTransition } from '@/lib/consult/motion'
import { Glyph } from '../Glyph'
import type { SceneProps } from './registry'

/**
 * The circuit check (build H2).
 *
 * The safety questions, as their own mode: the surface is in its calm
 * register (the root's `data-mode='calm'` dims the glow and softens the
 * accent), Amp goes still, and the controls are big plain switches. No jokes,
 * no reactions, and no AI anywhere near it — these words are fixed, and the
 * answers never leave the rules engine.
 *
 * ── Consent first ───────────────────────────────────────────────────────────
 * These answers are special category health data. The first line is the
 * explicit consent, in words, about this processing and nothing else — the
 * same notice and version as the quiz's safety screen. Until it is ticked the
 * switches are inert: not collected and ignored, not collected. Tapping one
 * says where the switch is instead of doing nothing.
 *
 * ── "None of these" ─────────────────────────────────────────────────────────
 * Its own switch, never inferred from an empty list, and exclusive: turning it
 * on clears the others, turning any other on clears it.
 */

export const CIRCUIT_FLAGS: CircuitFlag[] = ['pregnancy', 'blood-thinners', 'other-prescription', 'heart', 'kidney-liver', 'shellfish']

const EMPTY: CircuitAnswer = { flags: [], none: false }

export function toggleFlag(answer: CircuitAnswer | null, flag: CircuitFlag): CircuitAnswer {
  const a = answer ?? EMPTY
  const flags = a.flags.includes(flag) ? a.flags.filter((f) => f !== flag) : [...a.flags, flag]
  return { flags, none: false }
}

export function toggleNone(answer: CircuitAnswer | null): CircuitAnswer {
  return answer?.none ? EMPTY : { flags: [], none: true }
}

export function CircuitCheck({ answers, onAnswer, onDecline }: SceneProps) {
  const consented = Boolean(answers.healthConsent?.accepted)
  const circuit = answers.circuit
  const [asking, setAsking] = useState(false)

  function guard(apply: () => void) {
    if (!consented) {
      setAsking(true)
      return
    }
    apply()
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-3)' }}>
      {/* Consent. */}
      <div
        style={{
          padding: 'var(--amp-space-3) var(--amp-space-4)',
          borderRadius: 'var(--amp-radius-tile)',
          border: `var(--amp-hairline) solid ${asking && !consented ? 'var(--amp-accent)' : 'var(--amp-edge)'}`,
          background: asking && !consented ? 'var(--amp-accent-fill)' : 'var(--amp-glass-solid)',
          transition: stateTransition('border-color', 'background-color'),
        }}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={consented}
          onClick={() => {
            if (consented) {
              // Withdrawn: the answers it covered go with it.
              onAnswer({ healthConsent: null, circuit: null })
            } else {
              setAsking(false)
              onAnswer({ healthConsent: { accepted: true, version: HEALTH_DATA_VERSION, at: new Date().toISOString() } })
            }
          }}
          className="flex w-full items-start text-left"
          style={{ gap: 'var(--amp-space-3)', minHeight: 'var(--amp-target)' }}
        >
          <span
            aria-hidden
            className="flex shrink-0 items-center justify-center"
            style={{
              marginTop: 'var(--amp-hairline)',
              width: 'var(--amp-space-6)',
              height: 'var(--amp-space-6)',
              borderRadius: 'var(--amp-space-2)',
              border: `var(--amp-hairline) solid ${consented ? 'var(--amp-accent)' : 'var(--amp-ink-3)'}`,
              background: consented ? 'var(--amp-accent)' : 'transparent',
              color: 'var(--amp-ink-on-accent)',
            }}
          >
            {consented && <Glyph name="check" size={16} />}
          </span>
          <span style={{ fontSize: 'var(--amp-text-meta)', lineHeight: 'var(--amp-leading-body)', color: 'var(--amp-ink)' }}>
            Use my answers here to keep unsuitable products out. It&apos;s health information, so only with my say-so: never
            shared, never used for marketing, never sent to AI.
          </span>
        </button>
        <p style={{ marginTop: 'var(--amp-space-1)', paddingLeft: 'calc(var(--amp-space-6) + var(--amp-space-3))', fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
          <a href="/legal/health-data" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--amp-accent)', textDecoration: 'underline' }}>
            The detail
          </a>
          {' · '}
          <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--amp-accent)', textDecoration: 'underline' }}>
            Privacy notice
          </a>
        </p>
      </div>

      <div aria-live="polite" style={{ minHeight: asking && !consented ? undefined : 0 }}>
        {asking && !consented && (
          <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-accent)' }}>Tick the line above first, then these switch on.</p>
        )}
      </div>

      <ul className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }} aria-label="Safety questions">
        {CIRCUIT_FLAGS.map((flag) => (
          <li key={flag}>
            <Switch
              label={CIRCUIT_LABEL[flag]}
              on={Boolean(circuit?.flags.includes(flag))}
              inert={!consented}
              onToggle={() => guard(() => onAnswer({ circuit: toggleFlag(circuit, flag) }))}
            />
          </li>
        ))}
        <li>
          <Switch label="None of these" on={Boolean(circuit?.none)} inert={!consented} onToggle={() => guard(() => onAnswer({ circuit: toggleNone(circuit) }))} />
        </li>
      </ul>

      {onDecline && (
        <button
          type="button"
          onClick={onDecline}
          className="self-center underline"
          style={{ minHeight: 'var(--amp-target)', fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)', textUnderlineOffset: 'var(--amp-space-1)' }}
        >
          I’d rather not answer these
        </button>
      )}
    </div>
  )
}

/** A big plain switch row. `inert` looks off-limits but still takes the tap, to explain itself. */
function Switch({ label, on, inert, onToggle }: { label: string; on: boolean; inert: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={inert || undefined}
      onClick={onToggle}
      className="flex w-full items-center justify-between text-left"
      style={{
        gap: 'var(--amp-space-3)',
        minHeight: 'calc(var(--amp-target) + var(--amp-space-2))',
        padding: 'var(--amp-space-2) var(--amp-space-4)',
        borderRadius: 'var(--amp-radius-tile)',
        border: `var(--amp-hairline) solid ${on ? 'var(--amp-accent)' : 'var(--amp-edge)'}`,
        background: 'var(--amp-glass-solid)',
        color: 'var(--amp-ink)',
        opacity: inert ? 0.5 : 1,
        fontSize: 'var(--amp-text-body)',
        transition: stateTransition('border-color', 'opacity'),
      }}
    >
      <span>{label}</span>
      <span
        aria-hidden
        className="relative shrink-0"
        style={{
          width: 'calc(var(--amp-space-10) + var(--amp-space-2))',
          height: 'var(--amp-space-6)',
          borderRadius: 'var(--amp-radius-pill)',
          background: on ? 'var(--amp-accent)' : 'var(--amp-edge-strong)',
          transition: stateTransition('background-color'),
        }}
      >
        <span
          className="absolute top-1/2 -translate-y-1/2"
          style={{
            left: on ? 'calc(100% - var(--amp-space-5) - var(--amp-hairline) * 2)' : 'calc(var(--amp-hairline) * 2)',
            width: 'var(--amp-space-5)',
            height: 'var(--amp-space-5)',
            borderRadius: 'var(--amp-radius-pill)',
            background: on ? 'var(--amp-ground)' : 'var(--amp-ink-3)',
            transition: stateTransition('left', 'background-color'),
          }}
        />
      </span>
    </button>
  )
}
