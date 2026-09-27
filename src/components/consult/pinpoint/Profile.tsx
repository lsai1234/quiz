'use client'

import { useState } from 'react'
import { CLAIMS } from '@/lib/consult/claims'
import type { HandoffPayload } from '@/lib/consult/handoff'
import { pinpointed } from '@/lib/consult/pinpoint/effects'
import { isOut, leads } from '@/lib/consult/pinpoint/leads'
import { keepOutLine } from '@/lib/consult/pinpoint/playback'
import type { ConsultAnswers } from '@/lib/consult/types'
import { consultFunnel, type GotYou } from '@/lib/analytics/consult'
import { Segmented } from '../controls'
import { PatternMap } from './parts'

/**
 * The profile on Fully charged (plan v5 §6): each pattern Pinpoint found, what
 * the stack does about it, what it kept out, what was ruled out, and one
 * optional tap, "Did Amp get you?".
 *
 * What the stack does is said in the product's name and the register's own
 * claim wording, never Amp's: the pattern is why the product is there, not a
 * promise about it.
 */

const mono = {
  fontFamily: 'var(--amp-font-label)',
  fontSize: 'var(--amp-text-data)',
  letterSpacing: 'var(--amp-tracking-data)',
} as const

const GOT_YOU: { value: GotYou; label: string }[] = [
  { value: 'spot-on', label: 'Spot on' },
  { value: 'mostly', label: 'Mostly' },
  { value: 'not-really', label: 'Not really' },
]

const THANKS: Record<GotYou, string> = {
  'spot-on': 'Good. That’s what the stack is built on.',
  mostly: 'Thanks. You can change any answer from your results.',
  'not-really': 'Thanks for saying. Change my answers from your results and I’ll look again.',
}

export function PinpointProfile({ answers, payload, titleOf }: { answers: ConsultAnswers; payload: HandoffPayload; titleOf: (id: string) => string }) {
  const found = pinpointed(answers)
  const out = leads(answers).filter((l) => isOut(l) && l.tested > 0)
  const [gotYou, setGotYou] = useState<GotYou | null>(null)
  if (!found.length && !out.length) return null

  return (
    <section className="flex flex-col amp-anim-rise" style={{ gap: 'var(--amp-space-3)' }} aria-label="What I pinpointed">
      <p className="uppercase" style={{ ...mono, color: 'var(--amp-accent)' }}>
        What I pinpointed
      </p>
      {found.length > 0 && <PatternMap answers={answers} leads={found} title={`Pinpointed: ${found.map((l) => l.pattern.name).join(', ')}`} />}
      {found.map((l) => {
        const skus = Object.entries(payload.because)
          .filter(([, ids]) => ids.includes(l.pattern.id))
          .map(([sku]) => sku)
        const kept = keepOutLine(l)
        return (
          <article
            key={l.pattern.id}
            data-pattern={l.pattern.id}
            style={{ padding: 'var(--amp-space-4)', borderRadius: 'var(--amp-radius-panel)', border: 'var(--amp-hairline) solid var(--amp-go-line)', background: 'var(--amp-go-fill)' }}
          >
            <p className="uppercase" style={{ ...mono, color: 'var(--amp-go)' }}>
              {l.state === 'yes' ? 'Pinpointed' : 'Partly'}
            </p>
            <h2 style={{ fontWeight: 'var(--amp-weight-bold)', fontSize: 'var(--amp-text-lead)', marginTop: 'var(--amp-space-1)' }}>{l.pattern.name}</h2>
            <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)', marginTop: 'var(--amp-space-1)' }}>{l.pattern.line}</p>
            <p className="uppercase" style={{ ...mono, color: 'var(--amp-ink-2)', marginTop: 'var(--amp-space-3)' }}>
              What your stack does
            </p>
            {skus.length ? (
              <ul className="flex flex-col" style={{ gap: 'var(--amp-space-2)', marginTop: 'var(--amp-space-2)' }}>
                {skus.map((sku) => {
                  const claim = CLAIMS[payload.claims[sku]?.[0] ?? '']
                  return (
                    <li key={sku}>
                      <p style={{ fontWeight: 'var(--amp-weight-bold)', fontSize: 'var(--amp-text-meta)' }}>{titleOf(sku)}</p>
                      {claim && <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>{claim.wording}.</p>}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)', marginTop: 'var(--amp-space-2)' }}>Nothing in the shop is right for this one yet.</p>
            )}
            {kept && <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-caution)', marginTop: 'var(--amp-space-3)' }}>{kept}</p>}
          </article>
        )
      })}
      {out.length > 0 && (
        <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
          Ruled out: {out.map((l) => l.pattern.name.charAt(0).toLowerCase() + l.pattern.name.slice(1)).join(', ')}.
        </p>
      )}
      {found.length > 0 && (
        <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
          <p style={{ fontWeight: 'var(--amp-weight-bold)' }}>Did Amp get you?</p>
          <Segmented
            label="Did Amp get you?"
            options={GOT_YOU}
            value={gotYou}
            onChange={(v) => {
              if (!gotYou) consultFunnel.gotYou({ answer: v, found: found.length })
              setGotYou(v)
            }}
          />
          {gotYou && (
            <p aria-live="polite" style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
              {THANKS[gotYou]}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
