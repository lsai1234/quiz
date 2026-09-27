'use client'

import { sceneDef } from '@/lib/consult/flow'
import { summarise } from '@/lib/consult/summary'
import type { ConsultAnswers, SceneId } from '@/lib/consult/types'
import { pinpointed } from '@/lib/consult/pinpoint/effects'
import { isOut, leads } from '@/lib/consult/pinpoint/leads'
import { hunchEvidence } from '@/lib/consult/pinpoint/playback'
import { needsRecheck, withStep } from '@/lib/consult/pinpoint/screen'
import type { PatternId } from '@/lib/consult/pinpoint/types'
import { Glyph } from '../Glyph'
import { QuietLink } from '../controls'
import { Plain } from '../pinpoint/parts'

/**
 * Every answer on one screen, as a card you can tap to change.
 * Nothing has been decided yet, and the screen says so.
 */

interface Props {
  scenes: SceneId[]
  answers: ConsultAnswers
  onEdit: (scene: SceneId) => void
  /** "Not quite?" on a pinpointed pattern (plan v5). */
  onAnswer?: (patch: Partial<ConsultAnswers>) => void
  /** Speed run and Deep charge: "Want me to pinpoint it?". */
  onUpgrade?: () => void
  /** A pinpointed pattern whose answers have changed: ask about it again. */
  onRecheck?: (pattern: PatternId) => void
}

/** Pinpoint's screens are summed up by what they found, not listed one by one. */
const PINPOINT: SceneId[] = ['follow-move', 'follow-rest', 'follow-fuel', 'pinpoint']

const mono = {
  fontFamily: 'var(--amp-font-label)',
  fontSize: 'var(--amp-text-data)',
  letterSpacing: 'var(--amp-tracking-data)',
} as const

/** What Amp pinpointed, each with what it's going on and a way to say it's wrong. */
function Pinpointed({ answers, onAnswer, onRecheck }: { answers: ConsultAnswers; onAnswer?: Props['onAnswer']; onRecheck?: Props['onRecheck'] }) {
  const found = pinpointed(answers)
  const out = leads(answers).filter((l) => isOut(l) && l.tested > 0)
  if (!found.length && !out.length) return null
  return (
    <section aria-labelledby="pinpointed" className="flex flex-col" style={{ gap: 'var(--amp-space-2)', marginBottom: 'var(--amp-space-4)' }}>
      <p id="pinpointed" className="uppercase" style={{ ...mono, color: 'var(--amp-accent)' }}>
        What I pinpointed
      </p>
      {found.map((l) => {
        const recheck = needsRecheck(answers, l.pattern.id)
        return (
        <div
          key={l.pattern.id}
          data-pattern={l.pattern.id}
          data-recheck={recheck || undefined}
          style={{
            padding: 'var(--amp-space-3) var(--amp-space-4)',
            borderRadius: 'var(--amp-radius-tile)',
            border: `var(--amp-hairline) solid ${recheck ? 'var(--amp-caution-line)' : 'var(--amp-go-line)'}`,
            background: recheck ? 'var(--amp-caution-fill)' : 'var(--amp-go-fill)',
          }}
        >
          <p style={{ fontWeight: 'var(--amp-weight-bold)' }}>
            {l.pattern.name}
            {l.state === 'partly' && <span style={{ fontWeight: 'var(--amp-weight-medium)', color: 'var(--amp-ink-2)' }}> · partly</span>}
          </p>
          {recheck && (
            <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-caution)', marginTop: 'var(--amp-space-1)' }}>
              You’ve changed an answer this rested on. Worth one more look.
            </p>
          )}
          <ul className="flex flex-wrap" style={{ gap: 'var(--amp-space-1)', marginTop: 'var(--amp-space-2)' }} aria-label={`Why ${l.pattern.name}`}>
            {hunchEvidence(l).map((e) => (
              <li key={e} style={{ padding: 'var(--amp-space-1) var(--amp-space-2)', borderRadius: 'var(--amp-radius-chip)', border: 'var(--amp-hairline) solid var(--amp-edge-strong)', fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
                {e}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap" style={{ gap: 'var(--amp-space-1) var(--amp-space-4)' }}>
            {recheck && onRecheck && <QuietLink onClick={() => onRecheck(l.pattern.id)}>Recheck</QuietLink>}
            {onAnswer && (
              <QuietLink onClick={() => onAnswer({ pinpoint: withStep(answers, { kind: 'verdict', pattern: l.pattern.id, verdict: 'no', stage: 'pinpoint' }) })}>
                Not quite? Take it out
              </QuietLink>
            )}
          </div>
        </div>
        )
      })}
      {out.length > 0 && (
        <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
          Ruled out: {out.map((l) => l.pattern.name.charAt(0).toLowerCase() + l.pattern.name.slice(1)).join(', ')}
        </p>
      )}
    </section>
  )
}

/** Speed run and Deep charge: the offer to pinpoint it, keeping every answer (plan v5 §3). */
function Upgrade({ answers, onUpgrade }: { answers: ConsultAnswers; onUpgrade: () => void }) {
  return (
    <section
      aria-labelledby="upgrade"
      className="flex flex-col"
      style={{
        gap: 'var(--amp-space-2)',
        marginBottom: 'var(--amp-space-4)',
        padding: 'var(--amp-space-4)',
        borderRadius: 'var(--amp-radius-panel)',
        border: 'var(--amp-hairline) solid var(--amp-accent-line)',
        background: 'var(--amp-accent-fill)',
      }}
    >
      <p className="uppercase" style={{ ...mono, color: 'var(--amp-accent)' }}>
        Recommended
      </p>
      <p id="upgrade" style={{ fontWeight: 'var(--amp-weight-bold)', fontSize: 'var(--amp-text-lead)' }}>
        Want me to pinpoint it?
      </p>
      <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
        {answers.route === 'speed'
          ? 'You took the quick way. A few more minutes and I’ll work out what’s actually behind it. Every answer so far stays.'
          : 'Two people who both say they’re tired can need different things. A few quick questions and I’ll work out which you are. Every answer stays.'}
      </p>
      {/* A second choice, not the screen's main one: "Looks right" still is. */}
      <Plain onClick={onUpgrade}>Pinpoint it</Plain>
    </section>
  )
}

export function ReviewScene({ scenes, answers, onEdit, onAnswer, onUpgrade, onRecheck }: Props) {
  // The safety check comes before the review (plan v4), so its answers are
  // here too, and editing them goes back through the check itself.
  const reviewable = scenes.filter((id) => id !== 'review' && !PINPOINT.includes(id))
  return (
    <>
      {onUpgrade && <Upgrade answers={answers} onUpgrade={onUpgrade} />}
      <Pinpointed answers={answers} onAnswer={onAnswer} onRecheck={onRecheck} />
    <ul className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
      {reviewable.map((id) => {
        const def = sceneDef(id)
        const note = answers.notes[id]
        // A note can be the whole answer (batch 4): say it back either way.
        const value = [summarise(id, answers), note && `Told Amp: ${note}`].filter(Boolean).join(' · ')
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onEdit(id)}
              aria-label={`${def.label}: ${value || 'not answered'}. Change`}
              className="amp-press flex w-full items-center text-left"
              style={{
                gap: 'var(--amp-space-3)',
                minHeight: 'var(--amp-target)',
                padding: 'var(--amp-space-3) var(--amp-space-4)',
                borderRadius: 'var(--amp-radius-tile)',
                background: 'var(--amp-glass-solid)',
                border: 'var(--amp-hairline) solid var(--amp-edge)',
              }}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className="uppercase"
                  style={{
                    fontFamily: 'var(--amp-font-label)',
                    fontSize: 'var(--amp-text-data)',
                    letterSpacing: 'var(--amp-tracking-data)',
                    color: 'var(--amp-ink-3)',
                  }}
                >
                  {def.label}
                </span>
                <span style={{ marginTop: 'var(--amp-space-1)', fontSize: 'var(--amp-text-body)', color: 'var(--amp-ink)' }}>
                  {value || '—'}
                </span>
              </span>
              <span className="flex items-center" style={{ gap: 'var(--amp-space-1)', color: 'var(--amp-accent)', fontSize: 'var(--amp-text-meta)' }}>
                <Glyph name="edit" size={16} />
                Edit
              </span>
            </button>
          </li>
        )
      })}
    </ul>
    </>
  )
}
