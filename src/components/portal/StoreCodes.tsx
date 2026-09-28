'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Input, Note, Select } from '@/components/system'
import { Icon } from '@/components/ui/Icon'

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
 */

interface Row {
  code: string
  percent: number
  uses: number
  createdAt: string
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
      const data: { codes: Row[] } = await res.json()
      setCodes(data.codes)
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
        <h2 style={eyebrow}>Live codes</h2>
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
                      </span>
                    </span>
                    <Badge tone="positive" dot>Live</Badge>
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
      </div>
    </div>
  )
}
