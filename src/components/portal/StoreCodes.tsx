'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Input, Note, Select } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import { addDays, describeDeadline, londonDate, shortDay } from '@/lib/store-codes/deadline'

/**
 * Store discount codes, in the Founders Hub.
 *
 * A name and a percentage. The code works for anyone, on anything, until it is
 * deleted — quiz stacks, bundles, subscriptions and single products from the
 * shop (see `lib/store-codes` for why they share the partner-code path).
 *
 * Only ever one code per order. The code's rate replaces the bundle, subscribe
 * & save or intro discount the order would otherwise get — whichever is deeper
 * wins, they never add together.
 *
 * A code can be given a day it ends, and one code at a time can be advertised on
 * the results page, which says the day it is valid until. The checkout refuses
 * the code after that day, so the date the customer is shown is the one that
 * applies. There is no countdown: the end can be moved here, so it is not final.
 */

interface Row {
  code: string
  percent: number
  uses: number
  createdAt: string
  endsAt: string | null
  ended: boolean
  atCheckout: boolean
}

interface Daily {
  enabled: boolean
  today: { code: string; endsAt: string } | null
  upcoming: Array<{ date: string; code: string }>
  lastDay: string
}

/** How far ahead the end-day picker reaches. A longer campaign can run with no end. */
const END_DAYS = 14

/**
 * The days a code can be set to end on, London's, from today. Each ends at the
 * midnight closing it — the value is the day, the server turns it into a time.
 */
function endChoices(current: string | null, now = new Date()): Array<{ value: string; label: string }> {
  const today = londonDate(now)
  const days = Array.from({ length: END_DAYS }, (_, i) => addDays(today, i))
  const choices = [
    { value: 'none', label: 'No end date' },
    ...days.map((d, i) => ({
      value: d,
      label: i === 0 ? 'Ends tonight at midnight' : i === 1 ? 'Ends tomorrow at midnight' : `Ends ${shortDay(d)} at midnight`,
    })),
  ]
  // An end already set further out (or in the past) still shows as itself.
  if (current && !days.includes(current)) {
    choices.push({ value: current, label: `Ends ${shortDay(current)} at midnight` })
  }
  return choices
}

/** The London day a stored end closes — a midnight belongs to the day before it. */
function endDay(endsAt: string | null): string | null {
  return endsAt ? londonDate(new Date(endsAt).getTime() - 1) : null
}

const PERCENTS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]

const eyebrow = {
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-strong)',
  fontFamily: 'var(--font-display)',
  letterSpacing: 'var(--tracking-eyebrow)',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  marginBottom: 'var(--space-2)',
} as const

const meta = {
  fontSize: 'var(--text-meta)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--ink-3)',
} as const

export function StoreCodes() {
  const [codes, setCodes] = useState<Row[] | null>(null)
  const [daily, setDaily] = useState<Daily | null>(null)
  const [name, setName] = useState('')
  const [percent, setPercent] = useState(10)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  /** The code waiting on a second tap to delete — one tap should not end a campaign. */
  const [confirming, setConfirming] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/store-codes')
      if (!res.ok) return
      const data: { codes: Row[]; daily?: Daily } = await res.json()
      setCodes(data.codes)
      setDaily(data.daily ?? null)
    } catch {
      /* the screen renders empty rather than broken */
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function post(body: Record<string, unknown>, key: string): Promise<boolean> {
    setBusy(key)
    setError(null)
    try {
      const res = await fetch('/api/portal/store-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'That did not work.')
        return false
      }
      setCodes(json.codes)
      setDaily(json.daily ?? null)
      return true
    } catch {
      setError('Could not reach the hub. Try again.')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function create() {
    if (await post({ action: 'create', name, percent }, 'create')) setName('')
  }

  async function remove(code: string) {
    setConfirming(null)
    await post({ action: 'delete', code }, code)
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000)
    } catch {
      // The code is on screen in full and can be read off it.
    }
  }

  const preview = name.trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '')

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      {/* ── Today's code ── */}
      {daily && (
        <Card elevation={1} as="section">
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <div className="flex items-center" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <span className="min-w-0 flex-1">
                <span className="block" style={{ ...eyebrow, marginBottom: 'var(--space-1)' }}>Daily code at checkout</span>
                {daily.today ? (
                  <span
                    className="block"
                    style={{ fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}
                  >
                    Today: {daily.today.code}
                  </span>
                ) : (
                  <span className="block" style={meta}>The schedule ran to {shortDay(daily.lastDay)}. Nothing is shown today.</span>
                )}
                {daily.today && (
                  <span className="block" style={{ ...meta, marginTop: 'var(--space-1)' }}>
                    25% off · expires {describeDeadline(daily.today.endsAt)}
                  </span>
                )}
              </span>
              {daily.enabled ? <Badge tone="accent">At checkout</Badge> : <Badge tone="neutral">Off</Badge>}
              <Button
                size="sm"
                variant={daily.enabled ? 'ghost' : 'secondary'}
                disabled={busy !== null}
                onClick={() => void post({ action: 'daily', enabled: !daily.enabled }, 'daily')}
              >
                {daily.enabled ? 'Turn off' : 'Turn on'}
              </Button>
            </div>
            {daily.upcoming.length > 0 && (
              <p style={meta}>
                Next: {daily.upcoming.map((d) => `${shortDay(d.date)} ${d.code}`).join(' · ')}
              </p>
            )}
            <p style={meta}>
              Off unless turned on here, and no new daily codes are made. While it is off, checkout refuses
              every daily code, including those already made, typed or from a link. While it is on, a code
              made before works on its own day, until {shortDay(daily.lastDay)}, and the results page shows
              today’s and the day it is valid until, in place of a code chosen with “Show at checkout” below.
            </p>
          </div>
        </Card>
      )}

      {/* ── Making one ── */}
      <Card elevation={1} as="section">
        <form
          style={{ display: 'grid', gap: 'var(--space-3)' }}
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <Input
            label="Code name"
            hint="What customers type at checkout. Letters, numbers and dashes — it is saved in capitals."
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null) }}
            placeholder="e.g. SUMMER15"
            maxLength={24}
            autoCapitalize="characters"
          />
          <Select
            label="Percentage off"
            value={String(percent)}
            onChange={(e) => setPercent(Number(e.target.value))}
          >
            {PERCENTS.map((p) => (
              <option key={p} value={p}>{p}% off</option>
            ))}
          </Select>
          <div>
            <Button type="submit" size="sm" icon="plus" disabled={busy !== null || preview.length < 3}>
              {busy === 'create' ? 'Adding…' : preview ? `Add ${preview}` : 'Add code'}
            </Button>
          </div>
          {error && <Note tone="critical" icon="alert-triangle" live="assertive">{error}</Note>}
        </form>
      </Card>

      {/* ── Live codes ── */}
      <section>
        <h2 style={eyebrow}>Your codes</h2>
        {!codes || codes.length === 0 ? (
          <p style={meta}>{codes === null ? 'Loading…' : 'No store codes yet. Add one above.'}</p>
        ) : (
          <ul style={{ display: 'grid', gap: 'var(--space-2)', margin: 0, padding: 0, listStyle: 'none' }}>
            {codes.map((c) => (
              <li key={c.code}>
                <Card elevation={1} padding="tight">
                  <div className="flex items-center" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
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
                        {c.code}
                      </span>
                      <span className="block" style={{ ...meta, marginTop: 'var(--space-1)' }}>
                        {c.percent}% off · used {c.uses} time{c.uses === 1 ? '' : 's'}
                        {c.endsAt && (c.ended
                          ? ` · ended ${shortDay(endDay(c.endsAt)!)}`
                          : ` · ends ${describeDeadline(c.endsAt)}`)}
                      </span>
                    </span>
                    {c.atCheckout && !c.ended && <Badge tone="accent">At checkout</Badge>}
                    {c.ended ? <Badge tone="neutral">Ended</Badge> : <Badge tone="positive" dot>Live</Badge>}
                    <Button size="sm" variant="ghost" icon="link" onClick={() => void copy(c.code)}>
                      {copied === c.code ? 'Copied' : 'Copy'}
                    </Button>
                    {confirming === c.code ? (
                      <>
                        <Button
                          size="sm"
                          variant="destructive"
                          icon="trash"
                          disabled={busy !== null}
                          onClick={() => void remove(c.code)}
                        >
                          {busy === c.code ? 'Deleting…' : 'Delete'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                          Keep
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="trash"
                        disabled={busy !== null}
                        onClick={() => setConfirming(c.code)}
                        aria-label={`Delete ${c.code}`}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                  <div
                    className="flex items-end"
                    style={{ gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}
                  >
                    <Select
                      label={`When ${c.code} ends`}
                      hideLabel
                      compact
                      className="min-w-0 flex-1"
                      value={endDay(c.endsAt) ?? 'none'}
                      disabled={busy !== null}
                      onChange={(e) => void post({ action: 'set-end', code: c.code, ends: e.target.value }, `end:${c.code}`)}
                    >
                      {endChoices(endDay(c.endsAt)).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                    {c.atCheckout ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => void post({ action: 'promote', code: null }, `promo:${c.code}`)}
                      >
                        Stop showing at checkout
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon="bolt"
                        disabled={busy !== null || c.ended}
                        onClick={() => void post({ action: 'promote', code: c.code }, `promo:${c.code}`)}
                      >
                        Show at checkout
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <p style={meta}>
          <Icon name="info" size={14} className="inline-block" /> One code per order, always. A code
          replaces the bundle, subscribe &amp; save or intro discount rather than adding to it — the
          customer gets whichever is bigger. Nothing is ever sold below the margin floor, so on a very
          thin product the saving can be less than the headline percentage.
        </p>
        <p style={meta}>
          Codes work on everything — quiz stacks, bundles, subscriptions and single products from the
          shop. A link ending <strong>?ref=YOURCODE</strong> applies the code
          automatically, which is handy for ads.
        </p>
        <p style={meta}>
          <strong>Show at checkout</strong> puts one code on the results page, revealed as people
          scroll to the price, with an Apply button. If the code has an end, the card says the day
          it is valid until, and the code stops working at the end of that day. There is no countdown
          and no “limited time”: an end date can be moved here, so it is not a final deadline, and
          a timer may only count to one that is.
        </p>
      </div>
    </div>
  )
}
