'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Select, Input } from '@/components/system'
import { STARTER_TIERS, starterTierLabel } from '@/lib/partner-starter/rules'
import type { PartnerAgreement, PartnerStarter, StarterState, StarterTier } from '@/lib/partner-starter/types'

const money = (n: number) => `£${n.toFixed(2)}`
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

interface Row extends PartnerStarter {
  state: StarterState
  agreement: PartnerAgreement | null
}

const STATE_TONE: Record<StarterState, 'positive' | 'neutral' | 'critical' | 'attention'> = {
  unsigned: 'attention',
  ready: 'positive',
  used: 'neutral',
  expired: 'neutral',
  revoked: 'critical',
}

const STATE_LABEL: Record<StarterState, string> = {
  unsigned: 'Waiting on their signature',
  ready: 'Signed — ready to spend',
  used: 'Used',
  expired: 'Expired',
  revoked: 'Cancelled',
}

/**
 * A partner's free stack, in the Founders Hub.
 *
 * ── What this is for ────────────────────────────────────────────────────────
 * The outreach message promises a micro-influencer their own stack, free. This
 * is where that promise becomes a thing they can spend, and the record of what
 * they promised back.
 *
 * ── What issuing does and does not do ───────────────────────────────────────
 * It does NOT hand out a free box. It creates a code that buys nothing until
 * the partner has signed the agreement in their own account, which is what
 * makes issuing one a cheap and reversible act — and what makes the signature,
 * rather than the founder's click, the thing that spends the money.
 *
 * ── Why the signature is shown here ─────────────────────────────────────────
 * Because "what did they agree to post?" is asked months later, by somebody
 * chasing content that never appeared, and the answer has to be somewhere
 * findable. It is the whole reason the agreement is stored rather than emailed.
 */
export function StarterPanel({ partnerId }: { partnerId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [tier, setTier] = useState<StarterTier>('performance')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/partners/${partnerId}/starter`, { cache: 'no-store' })
      if (!res.ok) return
      const data: { starters: Row[] } = await res.json()
      setRows(data.starters)
    } catch {
      /* the panel renders empty rather than broken */
    }
  }, [partnerId])

  useEffect(() => { void load() }, [load])

  async function post(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/portal/partners/${partnerId}/starter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'That did not work.')
        return
      }
      setRows(data.starters ?? null)
      setNote('')
    } catch {
      setError('Could not reach the hub.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card as="section" solid className="mb-3">
      <h3 style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
        Their free stack
      </h3>
      <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
        Issuing a starter does not give anything away on its own. It appears in their account with the
        agreement attached, and only starts working once they have signed it. One live starter at a time.
      </p>

      {error && (
        <div role="status" style={{ marginBottom: 'var(--space-3)' }}>
          <Card tone="critical" padding="tight">
            <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--tone-critical)' }}>
              {error}
            </p>
          </Card>
        </div>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <Select
          label="Depth"
          value={tier}
          onChange={(e) => setTier(e.target.value as StarterTier)}
        >
          {STARTER_TIERS.map((t) => (
            <option key={t} value={t}>
              {starterTierLabel(t)}
            </option>
          ))}
        </Select>
        <Input
          label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Launch cohort, September"
          hint="Why this was issued. Yours only — the partner never sees it."
        />
        <div>
          <Button loading={busy} onClick={() => post({ tier, note })}>
            Issue a starter
          </Button>
        </div>
      </div>

      {rows?.length === 0 && (
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>None issued yet.</p>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        {rows?.map((row) => (
          <Card key={row.code} elevation={2} padding="tight">
            <div className="flex items-start justify-between" style={{ gap: 'var(--space-3)' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)', fontVariantNumeric: 'tabular-nums' }}>
                  {row.code}
                </p>
                <p style={{ fontSize: 'var(--text-micro)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
                  {starterTierLabel(row.tier)} · up to {money(row.goodsCap)} · expires {day(row.expiresAt)}
                  {row.note ? ` · ${row.note}` : ''}
                </p>
                {row.agreement && (
                  <p style={{ fontSize: 'var(--text-micro)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
                    Signed {day(row.agreement.signedAt)} by {row.agreement.signedName}
                    {row.agreement.handle ? ` (${row.agreement.handle})` : ''} · agreement {row.agreement.version}
                  </p>
                )}
              </div>
              <div className="flex items-center flex-shrink-0" style={{ gap: 'var(--space-2)' }}>
                <Badge tone={STATE_TONE[row.state]}>{STATE_LABEL[row.state]}</Badge>
                {(row.state === 'unsigned' || row.state === 'ready') && (
                  <Button size="sm" variant="secondary" loading={busy} onClick={() => post({ revoke: row.code })}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Card>
  )
}
