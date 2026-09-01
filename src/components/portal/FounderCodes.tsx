'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Input, Note } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import {
  FOUNDER_CODE_LABELS,
  type FounderCode,
  type FounderCodeKind,
  type FounderCodeState,
} from '@/lib/founder-codes/types'

/**
 * Founder codes, in the Founders Hub.
 *
 * ── What this screen is for ─────────────────────────────────────────────────
 * Buying from our own shop. Three things we actually want to do — send someone
 * a box for nothing, buy stock for ourselves at what it costs us, and buy one
 * cheap thing without a £15 basket — and until now all three meant either
 * paying full retail or reaching into the database.
 *
 * ── Why every code is single-use and dead in a day ──────────────────────────
 * Because one of them takes 100% off. A code that takes 100% off and lives
 * forever is a liability you cannot see: it sits in a WhatsApp thread, gets
 * forwarded, and the first time you find out is a £0.00 order from somebody you
 * have never heard of. 24 hours and one use is short enough that a leak has
 * almost nothing to leak, and generating another is one tap.
 *
 * The same shape for all three rather than a dial per kind, so there is one
 * rule to remember rather than three. The minimum-order code carries no money
 * off at all and could safely live longer — but "which of these expires?" is a
 * question worth never having to ask.
 */

interface Row extends FounderCode {
  state: FounderCodeState
}

const ORDER: FounderCodeKind[] = ['free', 'cost', 'unlock']

/** What each code is worth spelling out where it is being issued, not just named. */
const DETAIL: Record<FounderCodeKind, string[]> = {
  free: [
    'Every line at £0.00 and no delivery charge.',
    'Nothing is taken from a card — the order is raised as paid because there was nothing to pay.',
    'It still lands in the review queue. Free to us is not free of PowerBody.',
  ],
  cost: [
    'Products at what PowerBody charge us, including the VAT we cannot reclaim while we are unregistered.',
    'Delivery goes UP, to what PowerBody actually charge to ship the parcel — not our customer rate, which is often free.',
    'A product with no recorded supplier cost falls back to the modelled cost ratio, so it is an estimate rather than the invoice.',
  ],
  unlock: [
    'Ordinary prices, ordinary delivery. Nothing comes off.',
    'It only waives the minimum order, so a single cheap item can be bought on its own.',
  ],
}

const STATE_TONE: Record<FounderCodeState, 'positive' | 'neutral' | 'critical'> = {
  live: 'positive',
  used: 'neutral',
  expired: 'neutral',
  revoked: 'critical',
}

const STATE_LABEL: Record<FounderCodeState, string> = {
  live: 'Live',
  used: 'Used',
  expired: 'Expired',
  revoked: 'Cancelled',
}

/** "in 7 hours", "in 12 minutes", or "now" — a countdown nobody has to subtract. */
function timeLeft(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return 'now'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.round(minutes / 60)
  return `in ${hours} hour${hours === 1 ? '' : 's'}`
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function FounderCodes() {
  const [codes, setCodes] = useState<Row[] | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<FounderCodeKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Row | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  /**
   * Ticks once a minute so the countdowns stay true.
   *
   * A code that says "in 3 hours" for the next three hours is worse than no
   * countdown at all — the whole reason the figure is on screen is that these
   * expire while you are looking at them.
   */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/founder-codes')
      if (!res.ok) return
      const data: { codes: Row[] } = await res.json()
      setCodes(data.codes)
    } catch {
      /* the screen renders empty rather than broken */
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function post(body: Record<string, unknown>, kind: FounderCodeKind | null) {
    setBusy(kind)
    setError(null)
    try {
      const res = await fetch('/api/portal/founder-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'That did not work.')
        return
      }
      setCodes(json.codes)
      if (json.created) {
        setCreated(json.created)
        setNote('')
      }
    } catch {
      setError('Could not reach the hub. Try again.')
    } finally {
      setBusy(null)
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000)
    } catch {
      // Clipboard permission is not a failure worth a banner — the code is on
      // screen in full and can be read off it.
    }
  }

  const live = (codes ?? []).filter((c) => c.state === 'live')
  const past = (codes ?? []).filter((c) => c.state !== 'live')

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <Note tone="attention" icon="alert-triangle">
        These are ours, not customers&rsquo;. Anyone holding one can spend it — a{' '}
        <strong>{FOUNDER_CODE_LABELS.free.title.toLowerCase()}</strong> code makes an order cost
        nothing. Every code works once and expires 24 hours after it is made.
      </Note>

      {/* ── Issuing ── */}
      <section style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <Input
          label="What is it for?"
          hint="Optional, and only ever seen here — it is what tells you in a week why a free order exists."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. photography samples for the launch shoot"
          maxLength={200}
        />

        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {ORDER.map((kind) => (
            <Card key={kind} elevation={1} padding="tight" as="section">
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                <h3
                  style={{
                    fontSize: 'var(--text-body)',
                    fontWeight: 'var(--weight-strong)',
                    fontFamily: 'var(--font-display)',
                    color: 'var(--ink-1)',
                  }}
                >
                  {FOUNDER_CODE_LABELS[kind].title}
                </h3>
                <ul style={{ display: 'grid', gap: 'var(--space-1)', margin: 0, padding: 0, listStyle: 'none' }}>
                  {DETAIL[kind].map((line) => (
                    <li
                      key={line}
                      style={{
                        fontSize: 'var(--text-meta)',
                        lineHeight: 'var(--leading-snug)',
                        color: 'var(--ink-3)',
                      }}
                    >
                      {line}
                    </li>
                  ))}
                </ul>
                <div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="plus"
                    disabled={busy !== null}
                    onClick={() => void post({ action: 'generate', kind, note }, kind)}
                  >
                    {busy === kind ? 'Generating…' : 'Generate a code'}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {error && <Note tone="critical" icon="alert-triangle" live="assertive">{error}</Note>}
      </section>

      {/* ── The code that was just made ──
          Shown large and on its own, because this is the one moment the string
          matters and the one screen it can be read from. */}
      {created && (
        <Card elevation={2} tone="accent" glow="accent">
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
              {FOUNDER_CODE_LABELS[created.kind].title} · one use · expires {shortDate(created.expiresAt)}
            </p>
            <p
              style={{
                fontSize: 'var(--text-display)',
                fontWeight: 'var(--weight-display)',
                fontFamily: 'var(--font-display)',
                letterSpacing: 'var(--tracking-display)',
                color: 'var(--ink-1)',
                wordBreak: 'break-all',
              }}
            >
              {created.code}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Button size="sm" icon="link" onClick={() => void copy(created.code)}>
                {copied === created.code ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
                Done
              </Button>
            </div>
            <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' }}>
              Enter it in the basket at <strong>/shop</strong> — the box is there whatever the basket is
              worth, including under the minimum.
            </p>
          </div>
        </Card>
      )}

      {/* ── Live codes ── */}
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
          Live now
        </h2>
        {live.length === 0 ? (
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
            {codes === null ? 'Loading…' : 'Nothing outstanding. Every code issued has been used, cancelled or has expired.'}
          </p>
        ) : (
          <ul style={{ display: 'grid', gap: 'var(--space-2)', margin: 0, padding: 0, listStyle: 'none' }}>
            {live.map((code) => (
              <li key={code.code}>
                <Card elevation={1} padding="tight">
                  <div
                    className="flex items-center"
                    style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className="block"
                        style={{
                          fontSize: 'var(--text-body)',
                          fontWeight: 'var(--weight-strong)',
                          fontFamily: 'var(--font-display)',
                          color: 'var(--ink-1)',
                          wordBreak: 'break-all',
                        }}
                      >
                        {code.code}
                      </span>
                      <span
                        className="block"
                        style={{
                          fontSize: 'var(--text-meta)',
                          lineHeight: 'var(--leading-snug)',
                          color: 'var(--ink-3)',
                          marginTop: 'var(--space-1)',
                        }}
                      >
                        {FOUNDER_CODE_LABELS[code.kind].title} · expires {timeLeft(code.expiresAt, now)}
                        {code.note ? ` · ${code.note}` : ''}
                      </span>
                    </span>
                    <Badge tone="positive" dot>Live</Badge>
                    <Button size="sm" variant="ghost" icon="link" onClick={() => void copy(code.code)}>
                      {copied === code.code ? 'Copied' : 'Copy'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      disabled={busy !== null}
                      onClick={() => void post({ action: 'revoke', code: code.code }, null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── History ──
          Kept, and kept visible: a code that made an order free is a thing you
          want to be able to point at afterwards, next to which order spent it. */}
      {past.length > 0 && (
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
            Already spent
          </h2>
          <ul style={{ display: 'grid', gap: 'var(--space-1)', margin: 0, padding: 0, listStyle: 'none' }}>
            {past.map((code) => (
              <li
                key={code.code}
                className="flex items-center"
                style={{
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) 0',
                  borderBottom: '1px solid var(--edge)',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--text-meta)',
                    color: 'var(--ink-2)',
                    wordBreak: 'break-all',
                  }}
                  className="min-w-0 flex-1"
                >
                  {code.code}
                  <span style={{ color: 'var(--ink-3)' }}>
                    {' · '}
                    {FOUNDER_CODE_LABELS[code.kind].title}
                    {code.orderId ? ' · order raised' : ''}
                    {code.createdBy ? ` · ${code.createdBy}` : ''}
                    {` · ${shortDate(code.createdAt)}`}
                  </span>
                </span>
                <Badge tone={STATE_TONE[code.state]}>{STATE_LABEL[code.state]}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' }}>
        <Icon name="info" size={14} className="inline-block" /> A founder code never earns a partner
        commission and never touches a subscription — it applies to one-off orders from the shop and
        the quiz, and nothing else.
      </p>
    </div>
  )
}
