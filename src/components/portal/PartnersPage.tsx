'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PartnerDetail } from './PartnerDetail'
import { suggestCode } from '@/lib/partners/codes'
import { describeTerms } from '@/lib/partners/terms'
import { PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import type { PartnerKind, PartnerRecord } from '@/lib/partners/types'
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
  const [creating, setCreating] = useState<PartnerKind | null>(null)
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
      {/*
        Two buttons, not one button and a choice inside the form.

        They are different jobs with different consequences — one issues a free
        stack and an agreement to sign, the other issues a code and a rate — and
        which one a founder is doing is the first thing they know, before any
        field. A single "New" that revealed the difference three fields in is
        how somebody sends a box to a person who was never offered one.
      */}
      <div className="flex items-center justify-end gap-2 mb-3">
        {creating ? (
          /*
            One button while a form is open, not two with one of them saying
            "Cancel". Side by side, "Cancel" and "New partner" do not say which
            of the two the cancel belongs to — and the answer mattered, because
            one of them issues a free stack.
          */
          <Button size="sm" variant="secondary" onClick={() => setCreating(null)}>
            Cancel
          </Button>
        ) : (
          <>
            <Button size="sm" variant="secondary" icon="plus" onClick={() => setCreating('affiliate')}>
              New affiliate
            </Button>
            <Button size="sm" variant="primary" icon="plus" onClick={() => setCreating('influencer')}>
              New partner
            </Button>
          </>
        )}
      </div>
      {creating && (
        <CreatePartner
          kind={creating}
          taken={taken}
          onCreated={async (id) => {
            await load()
            setCreating(null)
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
                      {/* Named only where it differs. Everything without this
                          badge is the original programme, which is what the
                          screen is called and what most rows are. */}
                      {r.partner.kind === 'affiliate' && <Badge tone="info">Affiliate</Badge>}
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

/**
 * Creating either kind of account.
 *
 * One form, because the account, the code and the discount are the same three
 * questions for both. What differs is the DEAL: a partner goes on the standard
 * two-rate influencer terms and gets a free stack to claim, and an affiliate
 * goes on one rate the founder types here and gets neither.
 */
function CreatePartner({ kind, taken, onCreated }: { kind: PartnerKind; taken: string[]; onCreated: (id: string) => void }) {
  const affiliate = kind === 'affiliate'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [discount, setDiscount] = useState(String(Math.round(PRICING_CONFIG.partners.codeDiscountPct * 100)))
  /*
    Seeded from the programme's first-order rate rather than left blank.

    It is the number the business already pays for an introduction, so it is the
    honest starting point — and a blank field on the one setting that decides
    what somebody earns is an invitation to type anything.
  */
  const [commission, setCommission] = useState(String(Math.round(PRICING_CONFIG.partners.firstOrderPct * 100)))
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
          kind,
          name,
          email,
          discountPct: (Number(discount) || 0) / 100,
          ...(affiliate ? { commissionPct: (Number(commission) || 0) / 100 } : {}),
          code: code.trim() || undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? `Could not create that ${affiliate ? 'affiliate' : 'partner'}.`)
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
        {affiliate ? 'New affiliate' : 'New partner'}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Sarah Jones" />
        <Input label="Email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sarah@example.com" />
        <Input label="Follower discount" suffix="%" align="right" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        {affiliate && (
          <Input
            label="Their commission"
            suffix="%"
            align="right"
            inputMode="decimal"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            hint="Of the net on every order their code brings in."
          />
        )}
        <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={suggested || 'auto'} />
      </div>

      <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginBottom: 'var(--space-3)' }}>
        {suggested && !code.trim() ? <>Their code will be <strong className="text-[var(--ink-1)]">{suggested}</strong>. </> : null}
        It takes that much off the regular price of quiz stacks, session stacks and subscriptions — replacing the
        bundle deal or the first month of Subscribe &amp; Save, not stacking on top — and does nothing on
        single products from the shop.{' '}
        {affiliate ? (
          <>
            They earn {Math.round(Number(commission) || 0)}% of the net on every order it brings in, renewals
            included, for {PRICING_CONFIG.partners.renewalMonths} months from signup. No free stack and nothing
            to sign — the link you get next is their sign-in.
          </>
        ) : (
          <>
            They start on the standard deal — {describeTerms({
              firstOrderPct: PRICING_CONFIG.partners.firstOrderPct,
              renewalPct: PRICING_CONFIG.partners.renewalPct,
              renewalMonths: PRICING_CONFIG.partners.renewalMonths,
            })} Change it per partner once they exist.
          </>
        )}
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
        {affiliate ? 'Create affiliate & code' : 'Create partner & code'}
      </Button>
    </Card>
  )
}
