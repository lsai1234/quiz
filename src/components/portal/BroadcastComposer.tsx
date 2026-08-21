'use client'

import { useState } from 'react'
import { Button, Card, Input, Note, Textarea } from '@/components/system'

/**
 * Writing and sending a campaign.
 *
 * The shape of this panel is an argument about safety. Sending is the only
 * thing in the hub that cannot be undone — an email is gone the moment it goes
 * — so the primary action is **Check who this goes to**, not Send. Send appears
 * only after the check has answered with a number, and it says the number.
 *
 * Nothing here needs an unsubscribe field: every campaign carries one in its
 * footer and in its headers, because the sender adds it rather than the author
 * remembering to.
 */

interface Result {
  campaignId: string
  eligible: number
  queued: number
  sent: number
  skipped: number
  failed: number
  capped: boolean
}

export function BroadcastComposer() {
  const [heading, setHeading] = useState('')
  const [body, setBody] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [checked, setChecked] = useState<Result | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = heading.trim().length >= 3 && body.trim().length >= 10

  async function run(dryRun: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/audience/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heading, body, ctaLabel, ctaUrl, dryRun }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'That did not send.')
        return
      }
      if (dryRun) setChecked(data as Result)
      else {
        setResult(data as Result)
        setChecked(null)
      }
    } catch {
      setError('Could not reach the server. Nothing has been sent.')
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <Card elevation={1} solid padding="normal">
        <h3 className="text-sm font-black mb-2" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
          Sent
        </h3>
        <p className="text-sm text-[var(--ink-2)]">
          {result.sent} of {result.eligible} went out.
          {result.skipped > 0 && ` ${result.skipped} were skipped — they opted out while it was sending.`}
          {result.failed > 0 && ` ${result.failed} failed and are in Emails, with the reason.`}
          {result.capped && ' The rest are over today’s sending limit — run it again tomorrow to finish.'}
        </p>
        <p className="text-[11px] text-[var(--ink-3)] mt-2">Campaign {result.campaignId}</p>
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => { setResult(null); setHeading(''); setBody('') }}>
            Write another
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card elevation={1} solid padding="normal">
      <h3 className="text-sm font-black mb-3" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>
        Send a campaign
      </h3>

      <div className="space-y-3">
        <Input
          label="Subject"
          value={heading}
          onChange={(e) => { setHeading(e.target.value); setChecked(null) }}
          placeholder="Three things worth knowing about creatine"
        />
        <Textarea
          label="Message"
          hint="A blank line starts a new paragraph."
          rows={7}
          value={body}
          onChange={(e) => { setBody(e.target.value); setChecked(null) }}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Button label" hint="Optional" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
          <Input label="Button link" hint="Optional" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} />
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <Note tone="critical">{error}</Note>
        </div>
      )}

      {checked && (
        <div className="mt-3">
          <Note tone="info">
            {checked.eligible === 0
              ? 'Nobody on the list has opted in yet, so this would go to no one.'
              : `This goes to ${checked.eligible} ${checked.eligible === 1 ? 'person' : 'people'} — everyone who has opted in and not since stopped.${checked.capped ? ' Today’s limit means the first batch only.' : ''}`}
          </Note>
        </div>
      )}

      <div className="flex items-center gap-3 mt-4">
        <Button variant="secondary" size="sm" disabled={!ready || busy} onClick={() => run(true)}>
          {busy && !checked ? 'Checking…' : 'Check who this goes to'}
        </Button>
        {checked && checked.eligible > 0 && (
          <Button variant="primary" size="sm" disabled={busy} onClick={() => run(false)}>
            {busy ? 'Sending…' : `Send to ${checked.eligible}`}
          </Button>
        )}
      </div>

      <p className="text-[11px] text-[var(--ink-3)] mt-3">
        Every campaign carries a one-click unsubscribe, in the footer and in the headers mailbox
        providers read. Anyone who opts out is gone from the next one automatically.
      </p>
    </Card>
  )
}
