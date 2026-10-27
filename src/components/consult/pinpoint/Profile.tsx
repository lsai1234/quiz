'use client'

import { useState } from 'react'
import { isOut, leads } from '@/lib/consult/pinpoint/leads'
import type { ConsultAnswers } from '@/lib/consult/types'
import type { ConsultRead } from '@/lib/consult/read'
import { READ_COPY } from '@/lib/consult/read-copy'
import { pinpointed } from '@/lib/consult/pinpoint/effects'
import { consultFunnel, type GotYou } from '@/lib/analytics/consult'
import { Segmented } from '../controls'
import { ChargeProfileChart } from '../ChargeProfileChart'
import { PatternMap } from './parts'

/**
 * "Your read" on Fully charged (plan Phase 5): each pattern Pinpoint found,
 * its line, and the evidence in the person's own words; Amp's "found" line
 * when the AI wrote one; and one optional tap, "Did Amp get you?". With
 * nothing pinpointed, the charge profile and its words, as before.
 *
 * No products here. They appear once, on the results page, in the consult's
 * tiers, each with a reason the claims maps allow.
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

export function PinpointProfile({ answers, read }: { answers: ConsultAnswers; read: ConsultRead }) {
  const found = pinpointed(answers)
  const out = leads(answers).filter((l) => isOut(l) && l.tested > 0)
  const [gotYou, setGotYou] = useState<GotYou | null>(null)

  if (!read.patterns.length) {
    return (
      <section className="flex flex-col items-center amp-anim-rise" style={{ gap: 'var(--amp-space-3)' }} aria-label={READ_COPY.heading}>
        {read.profile && <ChargeProfileChart profile={read.profile} />}
        {read.words && (
          <p className="text-center" style={{ color: 'var(--amp-ink-2)', fontSize: 'var(--amp-text-lead)' }}>
            {read.words}
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="flex flex-col amp-anim-rise" style={{ gap: 'var(--amp-space-3)' }} aria-label={READ_COPY.heading}>
      {read.found && <p style={{ color: 'var(--amp-ink)' }}>{read.found}</p>}
      <PatternMap answers={answers} leads={found} title={`Pinpointed: ${read.patterns.map((p) => p.name).join(', ')}`} />
      {read.patterns.map((p) => (
        <article
          key={p.id}
          data-pattern={p.id}
          style={{ padding: 'var(--amp-space-4)', borderRadius: 'var(--amp-radius-panel)', border: 'var(--amp-hairline) solid var(--amp-go-line)', background: 'var(--amp-go-fill)' }}
        >
          <p className="uppercase" style={{ ...mono, color: 'var(--amp-go)' }}>
            {p.state === 'yes' ? READ_COPY.pinpointed : READ_COPY.partly}
          </p>
          <h2 style={{ fontWeight: 'var(--amp-weight-bold)', fontSize: 'var(--amp-text-lead)', marginTop: 'var(--amp-space-1)' }}>{p.name}</h2>
          <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)', marginTop: 'var(--amp-space-1)' }}>{p.line}</p>
          {p.evidence.length > 0 && (
            <>
              <p className="uppercase" style={{ ...mono, color: 'var(--amp-ink-2)', marginTop: 'var(--amp-space-3)' }}>
                {READ_COPY.youSaid}
              </p>
              <ul className="flex flex-col" style={{ gap: 'var(--amp-space-1)', marginTop: 'var(--amp-space-1)' }}>
                {p.evidence.map((e) => (
                  <li key={e} style={{ fontSize: 'var(--amp-text-meta)' }}>
                    “{e}”
                  </li>
                ))}
              </ul>
            </>
          )}
        </article>
      ))}
      {out.length > 0 && (
        <p style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
          Ruled out: {out.map((l) => l.pattern.name.charAt(0).toLowerCase() + l.pattern.name.slice(1)).join(', ')}.
        </p>
      )}
      <div className="flex flex-col" style={{ gap: 'var(--amp-space-2)' }}>
        <p style={{ fontWeight: 'var(--amp-weight-bold)' }}>Did Amp get you?</p>
        <Segmented
          label="Did Amp get you?"
          options={GOT_YOU}
          value={gotYou}
          onChange={(v) => {
            if (!gotYou) consultFunnel.gotYou({ answer: v, found: read.patterns.length })
            setGotYou(v)
          }}
        />
        {gotYou && (
          <p aria-live="polite" style={{ fontSize: 'var(--amp-text-meta)', color: 'var(--amp-ink-2)' }}>
            {THANKS[gotYou]}
          </p>
        )}
      </div>
    </section>
  )
}
