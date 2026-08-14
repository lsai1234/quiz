'use client'

import { useEffect, useState } from 'react'
import { IconButton } from '@/components/ui/IconButton'
import type { ConsentStanding } from '@/lib/legal/campaign'

const ACCENT = '#00D4FF'

interface Notice {
  headline: string
  body: string[]
}

interface Payload {
  standing: ConsentStanding
  notice: Notice | null
  documents: { id: string; version: string; title: string }[]
}

/**
 * "Our terms have changed" — in the hub, not in the way.
 *
 * Deliberately dismissible and deliberately not a wall. A member who declines
 * carries on under the terms they already accepted and everything they pay for
 * keeps working; that is what makes the acceptance worth having. A consent given
 * to get past a blocking modal is not much of a consent, and a service withheld
 * over terms someone is entitled to refuse is coercion with a compliance label
 * on it.
 *
 * So: what changed, in plain words, with the option to do nothing.
 */
export function ReconsentNotice() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch('/api/hub/consent')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPayload(d))
      .catch(() => {})
  }, [])

  if (!payload?.notice || dismissed || done) return null

  const terms = payload.documents.find((d) => d.id === 'terms')
  const disclaimer = payload.documents.find((d) => d.id === 'disclaimer')

  async function accept() {
    if (!terms || !disclaimer) return
    setSaving(true)
    const res = await fetch('/api/hub/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accepted: true, termsVersion: terms.version, disclaimerVersion: disclaimer.version }),
    })
    setSaving(false)
    if (res.ok) setDone(true)
  }

  return (
    <div
      className="rounded-2xl p-4 mb-4"
      style={{
        background: `color-mix(in srgb, ${ACCENT} 6%, transparent)`,
        border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
          {payload.notice.headline}
        </p>
        <IconButton icon="x" label="Dismiss" size="sm" onClick={() => setDismissed(true)} className="-mr-1 -mt-1" />
      </div>

      {payload.notice.body.map((line) => (
        <p key={line.slice(0, 24)} className="text-xs text-[var(--color-text-2)] mt-2 leading-relaxed">
          {line}
        </p>
      ))}

      <div className="flex gap-2 mt-3 flex-wrap">
        <button
          onClick={accept}
          disabled={saving}
          className="px-4 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all disabled:opacity-60"
          style={{ background: ACCENT, color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
        >
          {saving ? 'One moment…' : 'I’ve read these — accept'}
        </button>
        <a
          href="/legal/terms"
          className="px-4 py-2.5 rounded-xl text-xs font-bold border border-[var(--color-border)] text-[var(--color-text-2)]"
        >
          Read the terms
        </a>
        {/* Saying this out loud is the point. A member who does not know they can
            decline has not really been given a choice. */}
        <button onClick={() => setDismissed(true)} className="text-xs text-[var(--color-muted)] underline px-1">
          Not now — nothing changes
        </button>
      </div>
    </div>
  )
}
