'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PartnerDetail } from './PartnerDetail'
import { suggestCode } from '@/lib/partners/codes'
import { describeTerms } from '@/lib/partners/terms'
import { PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import type { PartnerRecord } from '@/lib/partners/types'
import type { PartnerPerformance } from '@/lib/partners/performance'
import type { PartnerBalance } from '@/lib/partners/types'
import { Badge, Button, Card, Input } from '@/components/system'


/** Partner status → the system's semantic tone. `Badge` owns the colours. */
const STATUS_TONE: Record<string, 'positive' | 'attention' | 'critical'> = {
  active: 'positive',
  invited: 'attention',
  suspended: 'critical',
}

interface PerfRow { partnerId: string; codes: PartnerPerformance[]; balance?: PartnerBalance }

/** One partner's codes added together. */
function totals(rows: PartnerPerformance[] | undefined) {
  if (!rows?.length) return null
  return rows.reduce(
    (t, r) => ({
      orders: t.orders + r.orders,
      revenue: Math.round((t.revenue + r.revenue) * 100) / 100,
      subscriptions: t.subscriptions + r.subscriptions,
      reversed: t.reversed + r.reversed,
    }),
    { orders: 0, revenue: 0, subscriptions: 0, reversed: 0 },
  )
}

/**
 * Partners — the influencer programme, from the founders' side.
 *
 * Creating a partner makes three things at once: the account, their code, and
 * the deal they are on. All three, because a partner with no code cannot bring
 * in an order and a partner with no terms row has no answer to "what am I on" —
 * which is the question the programme has to be able to answer at any moment,
 * including to them.
 */
export function PartnersPage() {
  const [records, setRecords] = useState<PartnerRecord[] | null>(null)
  const [performance, setPerformance] = useState<PerfRow[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/partners', { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      setRecords(d.partners ?? [])
      setPerformance(d.performance ?? [])
    } catch {
      setRecords([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const taken = useMemo(() => (records ?? []).flatMap((r) => r.codes.map((c) => c.code)), [records])
  const filtered = useMemo(() => {
    const rs = records ?? []
    if (!query.trim()) return rs
    const q = query.toLowerCase()
    return rs.filter((r) =>
      r.partner.name.toLowerCase().includes(q) ||
      r.partner.email.toLowerCase().includes(q) ||
      r.codes.some((c) => c.code.toLowerCase().includes(q)),
    )
  }, [records, query])

  const selected = (records ?? []).find((r) => r.partner.id === open) ?? null

  return (
    <div>
      <div className="flex items-center justify-end gap-3 mb-3">
        <Button
          size="sm"
          variant={creating ? 'secondary' : 'primary'}
          icon={creating ? undefined : 'plus'}
          aria-expanded={creating}
          onClick={() => setCreating((c) => !c)}
        >
          {creating ? 'Cancel' : 'New partner'}
        </Button>
      </div>
      {creating && (
        <CreatePartner
          taken={taken}
          onCreated={async (id) => {
            await load()
            setCreating(false)
            setOpen(id)
          }}
        />
      )}

      {records && records.length > 3 && (
        <div className="mb-3">
          <Input
            label="Search partners"
            compact
            className="w-full"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or code…"
          />
        </div>
      )}

      {records === null ? (
        <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)', padding: 'var(--space-8) 0' }}>
          {records.length === 0 ? 'No partners yet. Create one to generate their code.' : 'Nobody matches.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const code = r.codes[0]
            return (
              <Card key={r.partner.id} solid interactive padding="none">
              <Button
                variant="ghost"
                fullWidth
                className="text-left justify-between"
                iconRight="chevron-right"
                aria-label={`Manage ${r.partner.name}`}
                onClick={() => setOpen(r.partner.id)}
              >
                <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      {/* The status was a bare coloured dot — nothing a screen
                          reader could reach, and nothing anyone could name. */}
                      <Badge tone={STATUS_TONE[r.partner.status] ?? 'neutral'} dot>
                        {r.partner.status}
                      </Badge>
                      <span className="truncate" style={{ fontSize: 'var(--text-body-sm)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
                        {r.partner.name}
                      </span>
                      {code && <Badge tone="accent">{code.code}</Badge>}
                    </span>
                    <span className="block truncate" style={{ fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-body)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
                      {code ? `${Math.round(code.discountPct * 100)}% off` : 'no code'} · {describeTerms(r.terms)}
                    </span>
                    {(() => {
                      const perf = performance.find((p) => p.partnerId === r.partner.id)
                      const t = totals(perf?.codes)
                      const owed = perf?.balance
                      if (!t) return null
                      return (
                        <span className="block" style={{ fontSize: 'var(--text-meta)', marginTop: 'var(--space-1)', color: t.orders > 0 ? 'var(--accent)' : 'var(--ink-3)' }}>
                          {t.orders === 0
                            ? 'No orders yet'
                            : `${t.orders} order${t.orders === 1 ? '' : 's'} · £${t.revenue.toFixed(2)}` +
                              (t.subscriptions > 0 ? ` · ${t.subscriptions} subscribed` : '') +
                              (t.reversed > 0 ? ` · ${t.reversed} refunded` : '')}
                          {/* Owed is a different question from brought in — only
                              money past the return window is actually payable. */}
                          {owed && owed.payableNow > 0 && (
                            <span style={{ color: 'var(--tone-positive)' }}> · £{owed.payableNow.toFixed(2)} owed</span>
                          )}
                          {owed && owed.payableNow === 0 && owed.accrued > 0 && (
                            <span style={{ color: 'var(--ink-3)' }}> · £{owed.accrued.toFixed(2)} in the window</span>
                          )}
                        </span>
                      )
                    })()}
                </span>
              </Button>
              </Card>
            )
          })}
        </div>
      )}

      {selected && (
        <PartnerDetail
          record={selected}
          onClose={() => setOpen(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

function CreatePartner({ taken, onCreated }: { taken: string[]; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [discount, setDiscount] = useState(String(Math.round(PRICING_CONFIG.partners.codeDiscountPct * 100)))
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Shown live so a founder can see the code before committing to it — it goes
  // on someone's story and cannot quietly change afterwards.
  const suggested = useMemo(
    () => (name.trim() ? suggestCode(name, (Number(discount) || 0) / 100, taken) : ''),
    [name, discount, taken],
  )

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name,
          email,
          discountPct: (Number(discount) || 0) / 100,
          code: code.trim() || undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'Could not create that partner.')
        return
      }
      onCreated(d.partner.partner.id)
    } catch {
      setError('Could not reach the hub.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card elevation={2} className="mb-4">
      <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)', marginBottom: 'var(--space-3)' }}>
        New partner
      </p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Sarah Jones" />
        <Input label="Email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sarah@example.com" />
        <Input label="Follower discount" suffix="%" align="right" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={suggested || 'auto'} />
      </div>

      <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginBottom: 'var(--space-3)' }}>
        {suggested && !code.trim() ? <>Their code will be <strong className="text-[var(--ink-1)]">{suggested}</strong>. </> : null}
        It takes that much off the regular price of stacks, curated bundles and subscriptions — replacing the
        bundle deal or the first month of Subscribe &amp; Save, not stacking on top — and does nothing on
        single products from the shop.{' '}
        They start on the standard deal — {describeTerms({
          firstOrderPct: PRICING_CONFIG.partners.firstOrderPct,
          renewalPct: PRICING_CONFIG.partners.renewalPct,
          renewalMonths: PRICING_CONFIG.partners.renewalMonths,
        })} Change it per partner once they exist.
      </p>

      {error && (
        <div className="mb-3">
          <Card tone="critical" padding="tight">
            <p role="status" style={{ fontSize: 'var(--text-body-sm)', color: 'var(--tone-critical)' }}>
              {error}
            </p>
          </Card>
        </div>
      )}

      <Button variant="primary" size="sm" loading={busy} disabled={!name.trim() || !email.trim()} onClick={create}>
        Create partner & code
      </Button>
    </Card>
  )
}
