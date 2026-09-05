'use client'

import { useEffect, useState } from 'react'
import { Badge, Button, Card, Checkbox, Input, Note } from '@/components/system'
import type { Deliverable, StarterState } from '@/lib/partner-starter/types'

interface Starter {
  code: string | null
  tier: string
  tierLabel: string
  goodsCap: number
  expiresAt: string
  state: StarterState
}

interface Agreement {
  version: string
  text: string
  deliverables: Deliverable[]
  signedAt: string | null
  signedName: string | null
}

const money = (n: number) => `£${n.toFixed(2)}`
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * A partner's own stack, free — and the agreement that turns it on.
 *
 * ── Why the signature is here and not in an email ───────────────────────────
 * Because the free box and the promise it is given for are the same
 * transaction, and separating them makes one of the two optional. A code sent
 * by email is spendable the moment it arrives; an agreement emailed alongside
 * it is a PDF somebody means to get round to. Here the code does not exist on
 * screen until the name is typed, which is the smallest possible version of
 * "signed first".
 *
 * ── Why the whole agreement is on the page ──────────────────────────────────
 * Not a link, not a modal, not a scroll box with a tick under it. It is a page
 * of plain text and it is short on purpose — a document nobody read is weak
 * evidence whatever it says, and the ones people actually read are the ones
 * that fit on the screen they are already looking at.
 *
 * ── Why it renders nothing when there is no starter ─────────────────────────
 * Most partners will not have one at any given moment, and a permanent empty
 * "your free stack" panel teaches everybody to ignore the place the real offer
 * eventually appears.
 */
export function StarterStack() {
  const [starter, setStarter] = useState<Starter | null>(null)
  const [agreement, setAgreement] = useState<Agreement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/partner/starter', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unauthorised'))))
      .then((d: { starter: Starter | null; agreement?: Agreement }) => {
        setStarter(d.starter)
        setAgreement(d.agreement ?? null)
      })
      .catch(() => {
        /* The panel simply does not appear. Nothing else on the page depends
           on it, and an error box about a stack they may not have been offered
           is noise. */
      })
      .finally(() => setLoaded(true))
  }, [])

  if (!loaded || !starter || !agreement) return null

  async function sign() {
    if (!starter || !agreement) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/partner/starter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedName: name, handle, version: agreement.version }),
      })
      const data: { ok?: boolean; code?: string; signedAt?: string; error?: string; staleVersion?: boolean } =
        await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'That didn’t go through. Try again.')
        // The wording changed under them. Reloading is the honest fix: what
        // they are looking at is not what they would be signing.
        if (data.staleVersion) setTimeout(() => window.location.reload(), 2500)
        return
      }
      setStarter({ ...starter, code: data.code ?? null, state: 'ready' })
      setAgreement({ ...agreement, signedAt: data.signedAt ?? new Date().toISOString(), signedName: name })
    } catch {
      setError('Couldn’t reach us just then. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const signed = starter.state === 'ready'

  return (
    <Card as="section" solid className="mb-4">
      <div className="flex items-start justify-between" style={{ gap: 'var(--space-3)' }}>
        <div style={{ minWidth: 0 }}>
          <h2
            style={{
              fontSize: 'var(--text-body-sm)',
              fontWeight: 'var(--weight-display)',
              fontFamily: 'var(--font-display)',
              color: 'var(--ink-1)',
            }}
          >
            Your {starter.tierLabel} stack, on us
          </h2>
          <p
            style={{
              fontSize: 'var(--text-meta)',
              lineHeight: 'var(--leading-snug)',
              color: 'var(--ink-3)',
              marginTop: 'var(--space-1)',
            }}
          >
            Take the quiz, build your stack, and this covers it — up to {money(starter.goodsCap)} of products
            and the delivery. Nothing to pay, no card needed. Yours until {day(starter.expiresAt)}.
          </p>
        </div>
        <Badge tone={signed ? 'positive' : 'neutral'}>{signed ? 'Ready' : 'Sign to unlock'}</Badge>
      </div>

      {signed ? (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Note tone="positive">
            Signed {agreement.signedAt ? day(agreement.signedAt) : ''} as {agreement.signedName}. Here is your
            code — take the quiz, then enter it in the discount box on your results.
          </Note>
          <div className="flex items-center" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <code
              style={{
                flex: 1,
                minWidth: 0,
                padding: 'var(--space-3)',
                borderRadius: 'var(--r-control)',
                background: 'var(--surface-2)',
                border: '1px solid var(--edge)',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 'var(--text-body-sm)',
                letterSpacing: 'var(--tracking-eyebrow)',
                color: 'var(--ink-1)',
                overflowX: 'auto',
              }}
            >
              {starter.code}
            </code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (!starter.code) return
                navigator.clipboard
                  ?.writeText(starter.code)
                  .then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  })
                  .catch(() => {
                    /* clipboard blocked — the code is selectable, which is the fallback */
                  })
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Button size="sm" iconRight="arrow-right" onClick={() => { window.location.href = '/' }}>
              Take the quiz
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <p
            style={{
              fontSize: 'var(--text-micro)',
              fontWeight: 'var(--weight-strong)',
              letterSpacing: 'var(--tracking-eyebrow)',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              marginBottom: 'var(--space-2)',
            }}
          >
            What you’re agreeing to
          </p>
          <ul style={{ display: 'grid', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            {agreement.deliverables.map((d) => (
              <li
                key={d.id}
                style={{
                  fontSize: 'var(--text-meta)',
                  lineHeight: 'var(--leading-snug)',
                  color: 'var(--ink-2)',
                }}
              >
                {d.text}
              </li>
            ))}
          </ul>

          {/* The document itself, in full. Scrollable rather than truncated —
              a "read more" on the thing being signed is the one place a fold
              is not acceptable. */}
          <pre
            style={{
              maxHeight: '18rem',
              overflowY: 'auto',
              padding: 'var(--space-3)',
              borderRadius: 'var(--r-card)',
              background: 'var(--surface-2)',
              border: '1px solid var(--edge)',
              fontSize: 'var(--text-micro)',
              lineHeight: 'var(--leading-relaxed)',
              color: 'var(--ink-2)',
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {agreement.text}
          </pre>

          <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <Input
              label="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Morgan"
              autoComplete="name"
            />
            <Input
              label="Where you'll post"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@yourhandle"
              hint="The account the content is going on, so we know where to look for it."
            />
            <Checkbox
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              label="I've read the agreement above and I'm signing it."
            />
          </div>

          {error && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Note tone="critical">{error}</Note>
            </div>
          )}

          <div style={{ marginTop: 'var(--space-4)' }}>
            <Button onClick={sign} loading={busy} disabled={!agreed || name.trim().length < 3}>
              Sign and unlock my stack
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
