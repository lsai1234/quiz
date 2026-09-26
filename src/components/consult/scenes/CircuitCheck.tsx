'use client'

import { useState } from 'react'
import { HEALTH_DATA_VERSION, TAILOR_CONSENT_VERSION } from '@/lib/legal/versions'
import { CIRCUIT_LABEL, SYMPTOM_LABEL } from '@/lib/consult/summary'
import type { CircuitAnswer, CircuitFlag, WeightSymptom } from '@/lib/consult/types'
import { stateTransition } from '@/lib/consult/motion'
import { Glyph } from '../Glyph'
import { WhatsThis } from '../WhatsThis'
import { Chip, Switch } from '../controls'
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
 * ── Weight-loss medication (plan v4, A3) ─────────────────────────────────────
 * Its own switch, arriving already on if they said so on the Weight loss
 * card. On its own it only keeps things out (fat burners, strong stimulants),
 * under the consent above. Switched on, it opens a second, separate tick —
 * "Use this to tailor my recommendations" — and only with that tick does a
 * symptom picker appear, and do the symptoms shape the stack.
 *
 * ── "None of these" ─────────────────────────────────────────────────────────
 * Its own switch, never inferred from an empty list, and exclusive: turning it
 * on clears the others, turning any other on clears it.
 */

export const CIRCUIT_FLAGS: CircuitFlag[] = ['pregnancy', 'blood-thinners', 'other-prescription', 'weight-meds', 'heart', 'kidney-liver', 'shellfish']

export const SYMPTOMS: WeightSymptom[] = ['low-appetite', 'nausea', 'constipation', 'tiredness']

const EMPTY: CircuitAnswer = { flags: [], none: false }

export function toggleFlag(answer: CircuitAnswer | null, flag: CircuitFlag): CircuitAnswer {
  const a = answer ?? EMPTY
  const flags = a.flags.includes(flag) ? a.flags.filter((f) => f !== flag) : [...a.flags, flag]
  return { flags, none: false }
}

export function toggleNone(answer: CircuitAnswer | null): CircuitAnswer {
  return answer?.none ? EMPTY : { flags: [], none: true }
}

/** Toggle a symptom; "None of these" is `[]` and clears the rest. */
export function toggleSymptom(symptoms: WeightSymptom[] | null, s: WeightSymptom | 'none'): WeightSymptom[] | null {
  if (s === 'none') return symptoms && symptoms.length === 0 ? null : []
  const current = symptoms ?? []
  const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s]
  return next.length ? next : null
}

/**
 * Opens under the weight-loss medication switch: the tailoring opt-in, then
 * the symptoms it covers. Plain and calm like the rest of the check.
 */
function WeightMedsDetail({
  tailored,
  symptoms,
  onTailor,
  onSymptoms,
}: {
  tailored: boolean
  symptoms: WeightSymptom[] | null
  onTailor: (yes: boolean) => void
  onSymptoms: (s: WeightSymptom[] | null) => void
}) {
  return (
    <div
      className="amp-anim-rise flex flex-col"
      style={{
        gap: 'var(--amp-space-3)',
        margin: 'var(--amp-space-2) 0 0 var(--amp-space-4)',
        padding: 'var(--amp-space-3) var(--amp-space-4)',
        borderLeft: 'calc(var(--amp-hairline) * 2) solid var(--amp-accent-line)',
      }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={tailored}
        onClick={() => onTailor(!tailored)}
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
            border: `var(--amp-hairline) solid ${tailored ? 'var(--amp-accent)' : 'var(--amp-ink-3)'}`,
            background: tailored ? 'var(--amp-accent)' : 'transparent',
            color: 'var(--amp-ink-on-accent)',
          }}
        >
          {tailored && <Glyph name="check" size={16} />}
        </span>
        <span style={{ fontSize: 'var(--amp-text-meta)', lineHeight: 'var(--amp-leading-body)', color: 'var(--amp-ink)' }}>
          Use this to tailor my recommendations. <span style={{ color: 'var(--amp-ink-2)' }}>Optional. Without it, it only keeps unsuitable products out.</span>
        </span>
      </button>
      {tailored && (
        <div className="amp-anim-rise flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
          <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink)' }}>Anything you’ve noticed since starting it?</p>
          <div role="group" aria-label="Since starting weight-loss medication" className="flex flex-wrap" style={{ gap: 'var(--amp-space-2)' }}>
            {SYMPTOMS.map((s) => (
              <Chip key={s} label={SYMPTOM_LABEL[s]} selected={Boolean(symptoms?.includes(s))} onToggle={() => onSymptoms(toggleSymptom(symptoms, s))} />
            ))}
            <Chip label="None of these" selected={symptoms !== null && symptoms.length === 0} onToggle={() => onSymptoms(toggleSymptom(symptoms, 'none'))} />
          </div>
        </div>
      )}
    </div>
  )
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
      {/* What the check is for — approved words only, never a question box. */}
      <span className="self-end" style={{ marginTop: 'calc(var(--amp-space-3) * -1)' }}>
        <WhatsThis term="circuit-check" />
      </span>
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
              onAnswer({ healthConsent: null, circuit: null, tailorConsent: null, symptoms: null })
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
        {CIRCUIT_FLAGS.map((flag) => {
          const on = Boolean(circuit?.flags.includes(flag))
          return (
            <li key={flag}>
              <Switch
                label={CIRCUIT_LABEL[flag]}
                sub={flag === 'weight-meds' && on && answers.goals.includes('weight') ? 'You mentioned this on the first screen.' : undefined}
                on={on}
                inert={!consented}
                onToggle={() =>
                  guard(() =>
                    onAnswer(
                      flag === 'weight-meds' && on
                        ? // Off: the tailoring it covered goes with it.
                          { circuit: toggleFlag(circuit, flag), tailorConsent: null, symptoms: null }
                        : { circuit: toggleFlag(circuit, flag) },
                    ),
                  )
                }
              />
              {flag === 'weight-meds' && on && consented && (
                <WeightMedsDetail
                  tailored={Boolean(answers.tailorConsent?.accepted)}
                  symptoms={answers.symptoms}
                  onTailor={(yes) =>
                    onAnswer(
                      yes
                        ? { tailorConsent: { accepted: true, version: TAILOR_CONSENT_VERSION, at: new Date().toISOString() } }
                        : { tailorConsent: null, symptoms: null },
                    )
                  }
                  onSymptoms={(symptoms) => onAnswer({ symptoms })}
                />
              )}
            </li>
          )
        })}
        <li>
          <Switch label="None of these" on={Boolean(circuit?.none)} inert={!consented} onToggle={() => guard(() => onAnswer({ circuit: toggleNone(circuit), tailorConsent: null, symptoms: null }))} />
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
