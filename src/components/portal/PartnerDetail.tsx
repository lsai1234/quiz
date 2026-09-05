'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Checkbox, Input, Modal, ModalBody, ModalHeader, Select, Tabs, Textarea } from '@/components/system'
import { describePayout, describeTerms } from '@/lib/partners/terms'
import { StarterPanel } from './StarterPanel'
import type {
  CodeTerms,
  PartnerBalance,
  PartnerCode,
  PartnerCommission,
  PartnerPayout,
  PartnerRecord,
  PartnerTerms,
} from '@/lib/partners/types'

const money = (n: number) => `£${n.toFixed(2)}`


interface Props {
  record: PartnerRecord
  onClose: () => void
  onSaved: () => void
}

/** Whole percents in the UI, fractions in the data. */
const pctIn = (n: number) => Math.round(n * 1000) / 10
const pctOut = (n: number) => n / 100

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

/**
 * One partner, everything about them.
 *
 * Three separate things that a founder thinks of as one: the account (can they
 * trade at all), the code (what a follower gets off) and the terms (what the
 * partner earns). They are edited separately because they change for different
 * reasons and at different times — suspending someone is not the same act as
 * renegotiating their rate, and the terms change is the one that leaves a
 * permanent, dated, partner-visible record.
 */
export function PartnerDetail({ record, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<'code' | 'money' | 'terms' | 'history'>('code')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const { partner, codes, terms, termsHistory } = record

  async function post(body: Record<string, unknown>, done: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/portal/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: partner.id, ...body }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'That did not work.')
        return false
      }
      onSaved()
      setNotice(done)
      return true
    } catch {
      setError('Could not reach the hub.')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} size="lg" label={`${partner.name} — partner`}>
      <ModalHeader title={partner.name} subtitle={`${partner.status} · ${partner.email}`} />
      <ModalBody>
        {/* Announced when they appear: both report the outcome of an action the
            founder just took, and neither used to be. */}
        {error && (
          <div role="status" style={{ marginBottom: 'var(--space-3)' }}>
            <Card tone="critical" padding="tight">
              <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--tone-critical)' }}>
                {error}
              </p>
            </Card>
          </div>
        )}
        {notice && (
          <div role="status" style={{ marginBottom: 'var(--space-3)' }}>
            <Card tone="accent" padding="tight">
              <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--accent)' }}>
                {notice}
              </p>
            </Card>
          </div>
        )}

        {/* A real `Tabs`, unlike the hub's navigations: these switch panels
            inside one dialog rather than routing, so `role="tablist"` is the
            truth here. It brings arrow-key movement and Home/End with it. */}
        <Tabs
          label="Partner details"
          value={tab}
          onChange={(id) => { setTab(id as typeof tab); setError(null); setNotice(null) }}
          tabs={[
            {
              id: 'code',
              label: 'Code',
              content: (
                <>
                  <AccountPanel
                    status={partner.status}
                    busy={busy}
                    partnerId={partner.id}
                    onStatus={(status) => post({ action: 'status', status }, status === 'suspended' ? 'Suspended — their code stops working now.' : 'Reinstated.')}
                  />
                  {codes.map((code) => (
                    <CodePanel
                      key={code.code}
                      code={code}
                      busy={busy}
                      onSave={(patch) => post({ action: 'code', targetCode: code.code, codePatch: patch }, 'Code updated.')}
                    />
                  ))}
                  {/* Under the code rather than in a tab of its own: a founder
                      setting a partner up does both in the same sitting, and
                      the starter's own text quotes the code they just made. */}
                  <StarterPanel partnerId={partner.id} />
                </>
              ),
            },
            {
              id: 'money',
              label: 'Money',
              content: (
                <MoneyPanel
                  partnerId={partner.id}
                  busy={busy}
                  onSettle={(ignoreMinimum) =>
                    post({ action: 'settle', ignoreMinimum }, 'Payout raised. Mark it paid once the money has gone.')
                  }
                />
              ),
            },
            {
              id: 'terms',
              label: 'Their deal',
              content: (
                <TermsPanel
                  terms={terms}
                  busy={busy}
                  onSave={(next) => post({ action: 'terms', terms: next }, 'New terms recorded. The partner sees the reason.')}
                />
              ),
            },
            {
              id: 'history',
              label: `History (${termsHistory.length})`,
              content: <HistoryPanel history={termsHistory} />,
            },
          ]}
        />
      </ModalBody>
    </Modal>
  )
}

/**
 * A titled block inside a tab. Layout only — the local `Field`, `INPUT` and
 * `BTN` that used to live beside it are `Input`, `Select`, `Textarea` and
 * `Button` now, and the `Note` below is the one piece of prose styling left.
 */
function Group({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card elevation={2} className="mb-3">
      <p
        style={{
          fontSize: 'var(--text-body-sm)',
          fontWeight: 'var(--weight-display)',
          fontFamily: 'var(--font-display)',
          color: 'var(--ink-1)',
        }}
      >
        {title}
      </p>
      {desc && (
        <p
          style={{
            fontSize: 'var(--text-meta)',
            lineHeight: 'var(--leading-snug)',
            color: 'var(--ink-3)',
            marginTop: 'var(--space-1)',
            marginBottom: 'var(--space-3)',
          }}
        >
          {desc}
        </p>
      )}
      {children}
    </Card>
  )
}

/** The quiet line under a control that is not a field's own hint. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 'var(--text-meta)',
        lineHeight: 'var(--leading-snug)',
        color: 'var(--ink-3)',
        marginTop: 'var(--space-2)',
      }}
    >
      {children}
    </p>
  )
}

function AccountPanel({
  status,
  busy,
  partnerId,
  onStatus,
}: {
  status: PartnerRecord['partner']['status']
  busy: boolean
  partnerId: string
  onStatus: (s: 'active' | 'suspended') => void
}) {
  return (
    <Group
      title="Account"
      desc={
        status === 'invited'
          ? 'Created but never signed in — they hold no password yet. Their code still works.'
          : status === 'suspended'
            ? 'Suspended. Their code is refused at checkout, no new commission accrues, and they are signed out.'
            : 'Active.'
      }
    >
      <div className="flex flex-wrap gap-2 mb-3">
        {status === 'suspended' ? (
          <Button variant="primary" size="sm" loading={busy} onClick={() => onStatus('active')}>
            Reinstate
          </Button>
        ) : (
          // Destructive rather than secondary-in-red: it signs them out, refuses
          // their code at checkout and stops commission accruing.
          <Button variant="destructive" size="sm" loading={busy} onClick={() => onStatus('suspended')}>
            Suspend
          </Button>
        )}
      </div>
      <InviteLink partnerId={partnerId} isNew={status === 'invited'} />
    </Group>
  )
}

/**
 * Mint a single-use link for a partner to set their password.
 *
 * Shown once and never recoverable — the store keeps only a hash, so nobody
 * including us can read an outstanding invite back out of the database. Losing
 * it means issuing another, which is the right trade: an invite that could be
 * looked up later would be a standing key to somebody's account.
 */
function InviteLink({ partnerId, isNew }: { partnerId: string; isNew: boolean }) {
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function mint() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite', id: partnerId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error ?? 'Could not create a link.')
        return
      }
      /*
        `/partner/claim`, not `/partner/set-password`.

        One link, whatever state the partner is in. If they have a starter
        waiting it opens on the agreement — the shortest true path to what the
        outreach message promised, with no password in front of it. If they have
        not, or have already claimed, that page offers setting a password, which
        is what this link used to do. A founder never has to work out which of
        two links to send, and cannot send the wrong one.
      */
      setLink(`${window.location.origin}/partner/claim?token=${encodeURIComponent(d.token)}`)
    } catch {
      setError('Could not reach the hub.')
    } finally {
      setBusy(false)
    }
  }

  if (!link) {
    return (
      <div>
        <Button variant="secondary" size="sm" loading={busy} onClick={mint}>
          {isNew ? 'Create sign-in link' : 'Create a password-reset link'}
        </Button>
        {error && (
          <p role="status" style={{ fontSize: 'var(--text-meta)', color: 'var(--tone-critical)', marginTop: 'var(--space-2)' }}>
            {error}
          </p>
        )}
        <Note>
          Send it to them yourself. It expires in 7 days, and opens straight on their agreement — they do not
          need a password to claim their stack.
        </Note>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-end gap-2">
        <Input
          label="Send them this — you won’t see it again"
          className="flex-1"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          variant="primary"
          icon={copied ? 'check' : 'link'}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              /* clipboard blocked — the field is selectable, which is the fallback */
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <Note>Only a hash is stored, so this cannot be looked up later — if it goes missing, issue another.</Note>
    </div>
  )
}

function CodePanel({ code, busy, onSave }: { code: PartnerCode; busy: boolean; onSave: (patch: { discountPct?: number; terms?: CodeTerms; status?: 'active' | 'paused' | 'expired' }) => void }) {
  const [discount, setDiscount] = useState(String(pctIn(code.discountPct)))
  const [status, setStatus] = useState(code.status)
  const [t, setT] = useState<CodeTerms>({ ...code.terms })

  const setTerms = (patch: Partial<CodeTerms>) => setT((p) => ({ ...p, ...patch }))
  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v))

  return (
    <Group title={code.code} desc={`Used ${code.terms.uses} time${code.terms.uses === 1 ? '' : 's'}. Created ${code.createdAt.slice(0, 10)}.`}>
      <ShareLink code={code.code} />

      <div className="space-y-3">
        <Input
          label="Discount"
          suffix="%"
          align="right"
          inputMode="decimal"
          hint="What a follower gets off the regular price. It REPLACES the bundle deal or the first month of Subscribe & Save rather than stacking on top, and works on stacks, bundles and subscriptions only — not on single products from the shop. Set it below those rates and the code simply does nothing extra."
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />

        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as PartnerCode['status'])}>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="expired">Expired</option>
        </Select>

        <Checkbox
          label={
            <>
              <span style={{ fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>First order only.</span> Leave
              this on unless you mean it — without it the code is a permanent site-wide discount the moment it reaches a
              deal site.
            </>
          }
          checked={t.firstOrderOnly}
          onChange={(e) => setTerms({ firstOrderOnly: e.target.checked })}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Max uses"
            align="right"
            inputMode="numeric"
            hint="Blank = uncapped."
            value={t.maxUses ?? ''}
            onChange={(e) => setTerms({ maxUses: num(e.target.value) })}
          />
          <Input
            label="Min spend"
            prefix="£"
            align="right"
            inputMode="decimal"
            hint="Blank = none."
            value={t.minSpend ?? ''}
            onChange={(e) => setTerms({ minSpend: num(e.target.value) })}
          />
          <Input
            label="Starts"
            type="date"
            value={toDateInput(t.startsAt)}
            onChange={(e) => setTerms({ startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
          />
          <Input
            label="Ends"
            type="date"
            value={toDateInput(t.endsAt)}
            onChange={(e) => setTerms({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
          />
        </div>

        <Button variant="primary" size="sm" loading={busy} onClick={() => onSave({ discountPct: pctOut(Number(discount) || 0), status, terms: t })}>
          Save code
        </Button>
      </div>
    </Group>
  )
}

/**
 * The link a partner actually posts.
 *
 * A code typed at checkout works, but expecting someone's followers to remember
 * it three screens later is where attribution goes missing. `?ref=` banks it in
 * a cookie on arrival (see `middleware.ts`) and the basket applies it by itself.
 */
function ShareLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  // Read at render rather than hard-coded: the hub runs on preview domains too,
  // and a link to the wrong host is worse than no link.
  const url = typeof window === 'undefined' ? `/?ref=${code}` : `${window.location.origin}/?ref=${code}`

  return (
    <div className="mb-3">
      <div className="flex items-end gap-2">
        <Input
          label="Their link"
          className="flex-1"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          variant="secondary"
          icon={copied ? 'check' : 'link'}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              /* clipboard blocked — the field is selectable, which is the fallback */
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {/* The 30 days is the LINK's memory — how long a browser holds the
          referral — not how long the code works. Read the other way round it
          says a partner's deal expires in a month. */}
      <Note>
        Anyone following this gets the code applied at checkout without typing it. Their browser remembers it for 30
        days. The code itself does not expire — it works while the partner is active, unless you cap or end it above.
      </Note>
    </div>
  )
}

function TermsPanel({ terms, busy, onSave }: { terms: PartnerTerms; busy: boolean; onSave: (next: Record<string, unknown>) => void }) {
  const [first, setFirst] = useState(String(pctIn(terms.firstOrderPct)))
  const [renewal, setRenewal] = useState(String(pctIn(terms.renewalPct)))
  const [months, setMonths] = useState(String(terms.renewalMonths))
  const [payout, setPayout] = useState({ ...terms.payout })
  // "Now" is deliberately not a pre-filled date field. A date picker resolves to
  // midnight and a datetime picker drops the seconds, so a change meant to apply
  // immediately can land *before* the row it is replacing — and then it is
  // superseded on arrival and quietly changes nothing. Asking which one you mean
  // removes the whole class of mistake.
  const [when, setWhen] = useState<'now' | 'date'>('now')
  const [on, setOn] = useState('')
  const [note, setNote] = useState('')

  return (
    <>
      <Group title="In force now" desc={`Since ${terms.effectiveFrom.slice(0, 10)}${terms.createdBy ? `, set by ${terms.createdBy}` : ''}.`}>
        <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-1)' }}>
          {describeTerms(terms)}
        </p>
        <Note>{describePayout(terms.payout)}</Note>
      </Group>

      <Group
        title="Change the deal"
        desc="This writes a new dated row rather than editing this one. The old terms stay readable, and the partner sees both the change and the reason."
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Input label="First order" suffix="%" align="right" inputMode="decimal" value={first} onChange={(e) => setFirst(e.target.value)} />
            <Input label="Renewal" suffix="%" align="right" inputMode="decimal" value={renewal} onChange={(e) => setRenewal(e.target.value)} />
            <Input label="For" suffix="months" align="right" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Payout cadence"
              value={payout.cadence}
              onChange={(e) => setPayout({ ...payout, cadence: e.target.value as 'monthly' | 'quarterly' })}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </Select>
            <Input
              label="Minimum payout"
              prefix="£"
              align="right"
              inputMode="decimal"
              hint="Below this the balance carries forward."
              value={payout.minimum}
              onChange={(e) => setPayout({ ...payout, minimum: Number(e.target.value) || 0 })}
            />
          </div>

          <Checkbox
            label="We raise the invoice for them (self-billed)"
            checked={payout.selfBilled}
            onChange={(e) => setPayout({ ...payout, selfBilled: e.target.checked })}
          />
          <Checkbox
            label="VAT-registered — their commission costs 20% more than the rate says"
            checked={payout.chargesVat}
            onChange={(e) => setPayout({ ...payout, chargesVat: e.target.checked })}
          />

          {/* A `<fieldset>`, not a label with buttons in it: two mutually
              exclusive choices need a name of their own, and a `<button>` inside
              a `<label>` is invalid markup that hands clicks to the wrong
              control. `aria-pressed` is what tells a screen reader which of the
              two is currently chosen. */}
          <fieldset>
            <legend
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
              Takes effect
            </legend>
            <div className="flex gap-2">
              {(['now', 'date'] as const).map((w) => (
                <Button
                  key={w}
                  size="sm"
                  variant={when === w ? 'primary' : 'secondary'}
                  aria-pressed={when === w}
                  onClick={() => setWhen(w)}
                >
                  {w === 'now' ? 'Immediately' : 'On a date'}
                </Button>
              ))}
            </div>
            {when === 'date' && (
              <div style={{ marginTop: 'var(--space-2)' }}>
                <Input label="Effective date" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
              </div>
            )}
            <Note>
              Cannot start before commission already earned at the current rate, or before the terms already recorded.
            </Note>
          </fieldset>

          <Textarea
            label="Reason"
            hint="Required. The partner reads this in their account."
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Negotiated up for the January campaign."
          />

        <Button
          variant="primary"
          size="sm"
          loading={busy}
          disabled={!note.trim() || (when === 'date' && !on)}
          onClick={() =>
            onSave({
              firstOrderPct: pctOut(Number(first) || 0),
              renewalPct: pctOut(Number(renewal) || 0),
              renewalMonths: Number(months) || 0,
              payout,
              // Resolved at the moment of saving, so "immediately" is genuinely
              // after everything already recorded.
              effectiveFrom: when === 'now' ? new Date().toISOString() : new Date(on).toISOString(),
              note,
            })
          }
        >
          Record new terms
        </Button>
        </div>
      </Group>
    </>
  )
}

/**
 * What a partner has earned, and how settled it is.
 *
 * The split is the whole point. Money brought in is not money owed: an accrual
 * inside the return window can still be refunded away, so only `confirmed` is
 * ever presented as payable. Reversals are shown rather than netted off in
 * silence — a founder asking "why is this smaller than last month" deserves the
 * answer on the same screen.
 */
function MoneyPanel({
  partnerId,
  busy,
  onSettle,
}: {
  partnerId: string
  busy: boolean
  onSettle: (ignoreMinimum: boolean) => Promise<boolean>
}) {
  const [data, setData] = useState<{
    balance: PartnerBalance
    commissions: PartnerCommission[]
    payouts: PartnerPayout[]
  } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/partners/${partnerId}`, { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setData({ balance: d.balance, commissions: d.commissions ?? [], payouts: d.payouts ?? [] })
    } catch {
      /* the panel simply stays on its loading line */
    }
  }, [partnerId])

  useEffect(() => { void load() }, [load])

  if (!data) return <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>Loading…</p>

  const { balance, commissions, payouts } = data

  return (
    <>
      <Group
        title="Owed"
        desc="Only money past the return window is payable. Anything newer could still be refunded away."
      >
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Figure label="Payable now" value={balance.payableNow} tone={balance.payableNow > 0 ? 'var(--accent)' : undefined} />
          <Figure label="In the window" value={balance.accrued} />
          <Figure label="Paid to date" value={balance.paid} />
          <Figure label="Reversed" value={balance.reversed} tone={balance.reversed > 0 ? 'var(--tone-critical)' : undefined} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={balance.payableNow <= 0}
            onClick={async () => { if (await onSettle(false)) await load() }}
          >
            Raise a payout
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            disabled={balance.payableNow <= 0}
            onClick={async () => { if (await onSettle(true)) await load() }}
            title="Pay it even though it is under their agreed minimum"
          >
            Ignore the minimum
          </Button>
        </div>
      </Group>

      <Group title={`Payouts (${payouts.length})`} desc="Raised here; marked paid once the money has actually gone.">
        {payouts.length === 0 ? (
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>None yet.</p>
        ) : (
          <div className="space-y-1.5">
            {payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2" style={{ fontSize: 'var(--text-meta)' }}>
                <span style={{ color: 'var(--ink-2)' }}>{p.period} · {money(p.amount)}</span>
                <Badge tone={p.state === 'paid' ? 'positive' : 'attention'}>
                  {p.state === 'paid' ? 'paid' : 'due'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Group>

      <Group title={`Commissions (${commissions.length})`} desc="The rate stored is the one that applied on the day, not today's.">
        {commissions.length === 0 ? (
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>Nothing earned yet.</p>
        ) : (
          <div className="space-y-1.5">
            {commissions.slice(0, 40).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2" style={{ fontSize: 'var(--text-meta)' }}>
                <span className="truncate" style={{ color: 'var(--ink-2)' }}>
                  {c.createdAt.slice(0, 10)} · {c.kind} · {Math.round(c.rate * 100)}% of {money(c.netBasis)}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span
                    style={{
                      fontWeight: 'var(--weight-strong)',
                      color: c.state === 'reversed' ? 'var(--tone-critical)' : 'var(--ink-1)',
                      textDecoration: c.state === 'reversed' ? 'line-through' : undefined,
                    }}
                  >
                    {money(c.amount)}
                  </span>
                  <span style={{ color: 'var(--ink-3)' }}>{c.state}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Group>
    </>
  )
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card padding="tight">
      <p
        style={{
          fontSize: 'var(--text-micro)',
          fontWeight: 'var(--weight-strong)',
          fontFamily: 'var(--font-display)',
          letterSpacing: 'var(--tracking-eyebrow)',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 'var(--text-body-sm)',
          fontWeight: 'var(--weight-display)',
          fontFamily: 'var(--font-display)',
          fontVariantNumeric: 'tabular-nums',
          color: tone ?? 'var(--ink-1)',
        }}
      >
        {money(value)}
      </p>
    </Card>
  )
}

function HistoryPanel({ history }: { history: PartnerTerms[] }) {
  // Two changes on one day are common — a rate agreed and then corrected — and
  // a list of identical dates is unreadable. Show the time only when it is what
  // tells two rows apart.
  const sameDay = (iso: string) => history.filter((h) => h.effectiveFrom.slice(0, 10) === iso.slice(0, 10)).length > 1
  const when = (iso: string) => (sameDay(iso) ? iso.slice(0, 16).replace('T', ' ') : iso.slice(0, 10))

  return (
    <div className="space-y-2">
      <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' }}>
        Every deal this partner has been on, newest first. Nothing here is ever edited or removed — it is what we told a
        counterparty, and they can read the same list.
      </p>
      {history.map((t, i) => (
        <Card key={t.id} elevation={2}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <p
              style={{
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-display)',
                fontFamily: 'var(--font-display)',
                color: 'var(--ink-1)',
              }}
            >
              From {when(t.effectiveFrom)}
            </p>
            {i === 0 && new Date(t.effectiveFrom) <= new Date() && <Badge tone="accent">In force</Badge>}
            {i === 0 && new Date(t.effectiveFrom) > new Date() && <Badge tone="attention">Starts later</Badge>}
          </div>
          <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-1)' }}>
            {describeTerms(t)}
          </p>
          <Note>{describePayout(t.payout)}</Note>
          {t.note && (
            <p
              style={{
                fontSize: 'var(--text-meta)',
                lineHeight: 'var(--leading-snug)',
                color: 'var(--ink-3)',
                fontStyle: 'italic',
                marginTop: 'var(--space-2)',
              }}
            >
              “{t.note}”
            </p>
          )}
          {t.createdBy && (
            <p style={{ fontSize: 'var(--text-micro)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
              — {t.createdBy}
            </p>
          )}
        </Card>
      ))}
    </div>
  )
}
