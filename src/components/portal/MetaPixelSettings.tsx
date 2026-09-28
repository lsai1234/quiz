'use client'

import { useEffect, useState } from 'react'
import { Badge, Button, Card, Checkbox, Input, Note } from '@/components/system'

/**
 * Connecting the Meta Pixel, in the Founders Hub.
 *
 * One field and one switch. What the Pixel then does — which events, and the
 * cookie question that has to come first — is fixed in code
 * (`lib/analytics/meta-pixel.ts`), so there is nothing here to get wrong beyond
 * pasting the right number.
 */

interface Settings {
  pixelId: string | null
  enabled: boolean
}

/** Our funnel moment → what Meta will show in Events Manager. */
const EVENTS: [string, string][] = [
  ['PageView', 'Every page, on the quiz, shop, bundles and checkout.'],
  ['StartQuiz (custom)', 'Someone starts the quiz or the Amp Consult.'],
  ['Lead', 'Someone finishes the quiz or the consult.'],
  ['ViewContent', 'Their stack is revealed, or a product is opened in the shop.'],
  ['AddToCart', 'A product goes into the basket.'],
  ['InitiateCheckout', 'They press checkout, on a stack, a bundle, a subscription or the shop basket.'],
  ['Purchase', 'A paid order is confirmed — with the order value, once per order.'],
]

const meta = {
  fontSize: 'var(--text-meta)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--ink-3)',
} as const

export function MetaPixelSettings() {
  const [saved, setSaved] = useState<Settings | null>(null)
  const [pixelId, setPixelId] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch('/api/portal/meta-pixel')
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Settings | null) => {
        if (!s) return
        setSaved(s)
        setPixelId(s.pixelId ?? '')
        setEnabled(s.pixelId ? s.enabled : true)
      })
      .catch(() => { /* renders empty rather than broken */ })
  }, [])

  async function save(next: Settings) {
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const res = await fetch('/api/portal/meta-pixel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'That did not save.')
        return
      }
      setSaved(json)
      setPixelId(json.pixelId ?? '')
      setDone(true)
    } catch {
      setError('Could not reach the hub. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const live = Boolean(saved?.pixelId && saved.enabled)

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <Card elevation={1} as="section">
        <form
          style={{ display: 'grid', gap: 'var(--space-3)' }}
          onSubmit={(e) => {
            e.preventDefault()
            void save({ pixelId: pixelId.trim() || null, enabled })
          }}
        >
          <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
            <Badge tone={live ? 'positive' : 'neutral'} dot>
              {saved === null ? 'Loading…' : live ? 'Live' : saved.pixelId ? 'Paused' : 'Not connected'}
            </Badge>
          </div>
          <Input
            label="Pixel ID"
            hint="Meta Events Manager → Data sources → your Pixel. It is the long number under its name."
            value={pixelId}
            onChange={(e) => { setPixelId(e.target.value); setError(null); setDone(false) }}
            placeholder="e.g. 1234567890123456"
            inputMode="numeric"
            maxLength={24}
          />
          <Checkbox
            label="Send events to Meta"
            hint="Untick to pause the Pixel without losing the ID."
            checked={enabled}
            onChange={(e) => { setEnabled(e.target.checked); setDone(false) }}
          />
          <div className="flex" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
            {saved?.pixelId && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void save({ pixelId: null, enabled: false })}
              >
                Disconnect
              </Button>
            )}
          </div>
          {error && <Note tone="critical" icon="alert-triangle" live="assertive">{error}</Note>}
          {done && !error && (
            <Note tone="positive" icon="check" live="polite">
              {live ? 'Saved. The Pixel is live for new page loads.' : 'Saved. Nothing is being sent to Meta.'}
            </Note>
          )}
        </form>
      </Card>

      <Note tone="info" icon="info">
        Visitors are asked, quietly. A few seconds in, a one-line &ldquo;Cookies for ads? OK
        &times;&rdquo; pill appears at the top of the screen — it blocks nothing and closing it counts as
        no. Until they answer, their visit is held on the page and sent the moment they tap OK, so
        asking late loses nothing. Anyone whose browser says Do Not Track is never asked. Expect Meta
        to see somewhat fewer visitors than your own funnel numbers — that is the law working, not the
        Pixel breaking.
      </Note>

      <section>
        <h2
          style={{
            fontSize: 'var(--text-micro)',
            fontWeight: 'var(--weight-strong)',
            fontFamily: 'var(--font-display)',
            letterSpacing: 'var(--tracking-eyebrow)',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            marginBottom: 'var(--space-2)',
          }}
        >
          What Meta receives
        </h2>
        <ul style={{ display: 'grid', gap: 'var(--space-2)', margin: 0, padding: 0, listStyle: 'none' }}>
          {EVENTS.map(([name, when]) => (
            <li key={name} style={meta}>
              <strong style={{ color: 'var(--ink-1)' }}>{name}</strong> — {when}
            </li>
          ))}
        </ul>
        <p style={{ ...meta, marginTop: 'var(--space-3)' }}>
          Never a quiz answer, anything from the safety screen, or an email address. The Pixel does
          not run in the Founders Hub, My Hub or the partner pages. To check it is working, open
          Events Manager → Test events, load the site, accept the cookie prompt and click through the
          quiz.
        </p>
      </section>
    </div>
  )
}
