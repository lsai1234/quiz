'use client'

import { useState } from 'react'
import { HEALTH_DATA_VERSION, TAILOR_CONSENT_VERSION } from '@/lib/legal/versions'
import { CIRCUIT_LABEL, SYMPTOM_LABEL } from '@/lib/consult/summary'
import type { CircuitAnswer, CircuitFlag, WeightSymptom } from '@/lib/consult/types'
import { stateTransition } from '@/lib/consult/motion'
import { Glyph } from '../Glyph'
import { WhatsThis } from '../WhatsThis'
import { Chip } from '../controls'
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

/** The list, grouped so it reads at a glance rather than as seven switches. */
const GROUPS: { label: string; flags: CircuitFlag[] }[] = [
  { label: 'Pregnancy', flags: ['pregnancy'] },
  { label: 'Medicines', flags: ['blood-thinners', 'weight-meds', 'other-prescription'] },
  { label: 'Conditions', flags: ['heart', 'kidney-liver'] },
  { label: 'Allergy', flags: ['shellfish'] },
]

/** Shorter words for the at-a-glance list; the ticked answer keeps its full label. */
const SHORT: Record<CircuitFlag, string> = {
  pregnancy: 'Pregnant, breastfeeding or trying',
  'blood-thinners': 'Blood thinners',
  'weight-meds': 'Weight-loss medication',
  'other-prescription': 'Other prescriptions',
  heart: 'Heart or blood pressure',
  'kidney-liver': 'Kidney or liver',
  shellfish: 'Shellfish',
}

const mono = {
  fontFamily: 'var(--amp-font-mono)',
  fontSize: 'var(--amp-text-data)',
  letterSpacing: 'var(--amp-tracking-data)',
  color: 'var(--amp-ink-3)',
} as const

function Box({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center"
      style={{
        width: 'var(--amp-space-6)',
        height: 'var(--amp-space-6)',
        borderRadius: 'var(--amp-space-2)',
        border: `var(--amp-hairline) solid ${on ? 'var(--amp-accent)' : 'var(--amp-ink-3)'}`,
        background: on ? 'var(--amp-accent)' : 'transparent',
        color: 'var(--amp-ink-on-accent)',
        transition: stateTransition('background-color', 'border-color'),
      }}
    >
      {on && <Glyph name="check" size={16} />}
    </span>
  )
}

/** One of the two answers: None of these, or Yes. */
function Answer({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className="amp-press flex items-center justify-center text-center"
      style={{
        gap: 'var(--amp-space-2)',
        minHeight: 'var(--amp-target)',
        padding: 'var(--amp-space-2) var(--amp-space-3)',
        borderRadius: 'var(--amp-radius-tile)',
        border: `var(--amp-hairline) solid ${on ? 'var(--amp-accent)' : 'var(--amp-edge-strong)'}`,
        background: on ? 'var(--amp-accent-fill)' : 'var(--amp-glass-solid)',
        color: 'var(--amp-ink)',
        fontWeight: 'var(--amp-weight-bold)',
        transition: stateTransition('background-color', 'border-color'),
      }}
    >
      {on && (
        <span aria-hidden style={{ color: 'var(--amp-accent)', display: 'inline-flex' }}>
          <Glyph name="check" size={16} />
        </span>
      )}
      {label}
    </button>
  )
}

/**
 * One question, two answers. Most people have none of these, so the list is
 * shown to read, not to work through: "None of these" is one tap. Only "Yes"
 * turns it into boxes to tick. The consent is the same words as ever, just
 * above the answers it covers.
 */
export function CircuitCheck({ answers, onAnswer, onDecline }: SceneProps) {
  const consented = Boolean(answers.healthConsent?.accepted)
  const circuit = answers.circuit
  const [asking, setAsking] = useState(false)
  const [yes, setYes] = useState(Boolean(circuit?.flags.length))
  const some = yes || Boolean(circuit?.flags.length)
  /** An answer tapped before the consent tick: held here, never recorded, until they tick it. */
  const [pending, setPending] = useState<'none' | 'yes' | null>(null)

  function guard(apply: () => void) {
    if (!consented) {
      setAsking(true)
      return
    }
    apply()
  }

  function chooseNone() {
    setYes(false)
    onAnswer({ circuit: circuit?.none ? { flags: [], none: false } : { flags: [], none: true }, tailorConsent: null, symptoms: null })
  }
  function chooseYes() {
    setYes(true)
    if (circuit?.none) onAnswer({ circuit: { flags: [], none: false } })
  }
  function choose(which: 'none' | 'yes') {
    if (!consented) {
      setPending(which)
      setAsking(true)
      document.getElementById('circuit-consent')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      return
    }
    if (which === 'none') chooseNone()
    else chooseYes()
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--amp-space-3)' }}>
      <div
        style={{
          padding: 'var(--amp-space-4)',
          borderRadius: 'var(--amp-radius-panel)',
          border: 'var(--amp-hairline) solid var(--amp-edge)',
          background: 'var(--amp-glass-solid)',
        }}
      >
        <div className="flex items-start justify-between" style={{ gap: 'var(--amp-space-2)', marginBottom: 'var(--amp-space-3)' }}>
          <p id="circuit-q" style={{ fontWeight: 'var(--amp-weight-bold)' }}>
            {some ? 'Tick the ones that apply' : 'Does any of this apply to you?'}
          </p>
          {/* What the check is for — approved words only, never a question box. */}
          <WhatsThis term="circuit-check" />
        </div>
        {some ? (
          <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }} role="group" aria-label="Safety questions">
            {GROUPS.map((g) => (
              <div key={g.label} className="flex flex-col">
                <p className="uppercase" style={mono}>
                  {g.label}
                </p>
                {g.flags.map((flag) => {
                  const on = Boolean(circuit?.flags.includes(flag))
                  return (
                    <div key={flag}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-disabled={!consented || undefined}
                        onClick={() =>
                          guard(() =>
                            onAnswer(
                              flag === 'weight-meds' && on
                                ? // Off: the tailoring it covered goes with it.
                                  { circuit: toggleFlag(circuit, flag), tailorConsent: null, symptoms: null }
                                : { circuit: toggleFlag(circuit, flag) },
                            ),
                          )
                        }
                        className="flex w-full items-center text-left"
                        style={{ gap: 'var(--amp-space-3)', minHeight: 'var(--amp-target)', color: 'var(--amp-ink)' }}
                      >
                        <Box on={on} />
                        <span className="flex min-w-0 flex-col">
                          <span>{CIRCUIT_LABEL[flag]}</span>
                          {flag === 'weight-meds' && on && answers.goals.includes('weight') && (
                            <span style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>You mentioned this on the first screen.</span>
                          )}
                        </span>
                      </button>
                      {flag === 'weight-meds' && on && consented && (
                        <WeightMedsDetail
                          tailored={Boolean(answers.tailorConsent?.accepted)}
                          symptoms={answers.symptoms}
                          onTailor={(t) =>
                            onAnswer(
                              t
                                ? { tailorConsent: { accepted: true, version: TAILOR_CONSENT_VERSION, at: new Date().toISOString() } }
                                : { tailorConsent: null, symptoms: null },
                            )
                          }
                          onSymptoms={(symptoms) => onAnswer({ symptoms })}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <ul className="flex flex-wrap" style={{ gap: 'var(--amp-space-2)' }} aria-label="Safety questions">
            {GROUPS.flatMap((g) => g.flags).map((f) => (
              <li
                key={f}
                style={{
                  padding: 'var(--amp-space-1) var(--amp-space-3)',
                  borderRadius: 'var(--amp-radius-pill)',
                  border: 'var(--amp-hairline) solid var(--amp-edge-strong)',
                  fontSize: 'var(--amp-text-meta)',
                  color: 'var(--amp-ink)',
                }}
              >
                {SHORT[f]}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div role="radiogroup" aria-labelledby="circuit-q" className="grid grid-cols-2" style={{ gap: 'var(--amp-space-2)' }}>
        <Answer
          label="None of these"
          on={Boolean(circuit?.none) || pending === 'none'}
          onClick={() => choose('none')}
        />
        <Answer
          label="Yes, some do"
          on={some || pending === 'yes'}
          onClick={() => choose('yes')}
        />
      </div>

      {/* Consent: the approved words, under the answer it covers. An answer
          tapped first waits for it, and is recorded the moment it's ticked. */}
      <div
        id="circuit-consent"
        style={{
          padding: 'var(--amp-space-2) var(--amp-space-3)',
          borderRadius: 'var(--amp-radius-tile)',
          border: `var(--amp-hairline) solid ${asking && !consented ? 'var(--amp-accent)' : 'transparent'}`,
          background: asking && !consented ? 'var(--amp-accent-fill)' : 'transparent',
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
              setYes(false)
              onAnswer({ healthConsent: null, circuit: null, tailorConsent: null, symptoms: null })
            } else {
              setAsking(false)
              onAnswer({ healthConsent: { accepted: true, version: HEALTH_DATA_VERSION, at: new Date().toISOString() } })
              if (pending === 'none') onAnswer({ circuit: { flags: [], none: true }, tailorConsent: null, symptoms: null })
              if (pending === 'yes') setYes(true)
              setPending(null)
            }
          }}
          className="flex w-full items-start text-left"
          style={{ gap: 'var(--amp-space-3)', minHeight: 'var(--amp-target)' }}
        >
          <Box on={consented} />
          <span style={{ fontSize: 'var(--amp-text-meta)', lineHeight: 'var(--amp-leading-body)', color: 'var(--amp-ink)' }}>
            Use my answers here to keep unsuitable products out.{' '}
            <span style={{ color: 'var(--amp-ink-2)' }}>
              It&apos;s health information, so only with my say-so: never shared, never used for marketing, never sent to AI.
            </span>
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
        <div aria-live="polite">
          {asking && !consented && (
            <p style={{ marginTop: 'var(--amp-space-1)', paddingLeft: 'calc(var(--amp-space-6) + var(--amp-space-3))', fontSize: 'var(--amp-text-meta)', color: 'var(--amp-accent)' }}>
              Tick this, so I can use your answer.
            </p>
          )}
        </div>
      </div>

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
