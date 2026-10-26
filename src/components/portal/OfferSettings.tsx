'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Checkbox, Input, Note, Segmented } from '@/components/system'
import { ProductPicker } from './ProductPicker'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { HERO_CHECK_LABEL, STACK_LEVELS, type BonusSettings, type HeroStatus } from '@/lib/offer/settings'
import { LEVEL_NAME } from '@/lib/offer/bonus-economics'
import type { OfferView } from '@/lib/offer/view'
import { productHref } from '@/lib/portal/product-links'

/**
 * Settings → Offer (plan Phase 2).
 *
 *   Hero products  The switch, and every product a founder has started
 *                  approving as a hero, with what it is still missing. The
 *                  checks themselves live on each product's page.
 *   Free bonus     The switch, the pool, its rules, and what each pool product
 *                  would cost us on three example stacks — with a proposed
 *                  minimum and floor worked out from those numbers.
 *
 * Both switches are off by default. Until the selection is built (Phase 3)
 * nothing on either quiz reads any of this; even then, a switch on with no
 * approved hero or an empty pool changes nothing.
 */

const money = (n: number | null | undefined) => (n == null ? '—' : `£${n.toFixed(2)}`)
const pct = (n: number) => `${Math.round(n * 100)}%`

const STATUS: Record<HeroStatus, { label: string; tone: 'positive' | 'attention' | 'neutral' }> = {
  approved: { label: 'Approved', tone: 'positive' },
  incomplete: { label: 'Checks missing', tone: 'attention' },
  off: { label: 'Not a hero', tone: 'neutral' },
}

const HEADING = {
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-strong)',
  fontFamily: 'var(--font-display)',
  color: 'var(--ink-1)',
} as const
const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' } as const
const BODY = { fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-2)' } as const

export function OfferSettings() {
  const [view, setView] = useState<OfferView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/portal/offer')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('read failed'))))
      .then((v: OfferView) => setView(v))
      .catch(() => setError('Could not load the offer settings. Reload the page to try again.'))
  }, [])

  const save = useCallback(async (body: { heroEnabled?: boolean; bonus?: Partial<BonusSettings> }) => {
    setSaving(true)
    try {
      const res = await fetch('/api/portal/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'save failed')
      setView(data as OfferView)
      setError(null)
    } catch (err) {
      setError(`That did not save. Nothing has changed. ${err instanceof Error && err.message !== 'save failed' ? err.message : 'Try again.'}`)
    } finally {
      setSaving(false)
    }
  }, [])

  if (error && !view) return <Note tone="critical" icon="alert-triangle">{error}</Note>
  if (!view) return <Note tone="neutral" icon="clock">Reading the offer settings…</Note>

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      {error && (
        <Note tone="critical" icon="alert-triangle" live="assertive">
          {error}
        </Note>
      )}
      <HeroCard view={view} saving={saving} onSwitch={(on) => save({ heroEnabled: on })} />
      <BonusCard view={view} saving={saving} onSave={(bonus) => save({ bonus })} />
    </div>
  )
}

/* ── Hero products ──────────────────────────────────────────────────────── */

function HeroCard({ view, saving, onSwitch }: { view: OfferView; saving: boolean; onSwitch: (on: boolean) => void }) {
  const { settings, heroes, active } = view
  return (
    <Card elevation={1}>
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={HEADING}>Hero products</h2>
          <p style={{ ...META, marginTop: 'var(--space-1)' }}>
            The core offer: one less obvious product, the best fit for each person, from the products below that have every check done.
            Off, the core offer is today&apos;s top pick, labelled &ldquo;Your top pick&rdquo;.
          </p>
        </div>
        <Segmented
          label="Hero products"
          columns={2}
          value={settings.heroEnabled ? 'on' : 'off'}
          onChange={(v) => !saving && onSwitch(v === 'on')}
          options={[
            { value: 'off', label: 'Off', sub: 'Today’s top pick' },
            { value: 'on', label: 'On', sub: 'Approved heroes only' },
          ]}
        />
        {settings.heroEnabled && active.heroes.length === 0 && (
          <Note tone="attention" icon="info">
            On, but no product is approved yet, so nothing changes: the core offer stays the top pick.
          </Note>
        )}

        <div>
          <h3 style={{ ...BODY, fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
            Heroes and their checks ({heroes.filter((h) => h.status === 'approved').length} approved)
          </h3>
          <p style={{ ...META, marginTop: 'var(--space-1)' }}>
            A product becomes a hero from its own page: Products → the product → Hero. It only takes effect once every check is recorded.{' '}
            <a href="/api/portal/offer/review-rows" className="system-focus" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
              Download review rows
            </a>{' '}
            (every hero and the bonus terms, in the review pack&apos;s columns).
          </p>
        </div>
        {heroes.length === 0 ? (
          <p style={BODY}>No product has been put forward as a hero yet.</p>
        ) : (
          <ul style={{ display: 'grid', gap: 'var(--space-2)' }} aria-label="Hero products">
            {heroes.map((h) => (
              <li key={h.productId}>
                <Card elevation={1} solid padding="tight">
                  <div className="flex items-start justify-between flex-wrap" style={{ gap: 'var(--space-2)' }}>
                    <div className="min-w-0">
                      <Link href={productHref(h.productId)} className="system-focus" style={{ ...BODY, color: 'var(--ink-1)', fontWeight: 'var(--weight-strong)' }}>
                        {h.title}
                      </Link>
                      <p style={META}>
                        {h.swapGroup ?? 'Not in the catalogue'}
                        {h.approval.checkedBy && ` · checked by ${h.approval.checkedBy}${h.approval.checkedAt ? ` on ${h.approval.checkedAt}` : ''}`}
                      </p>
                      {h.missing.length > 0 && (
                        <p style={{ ...META, marginTop: 'var(--space-1)' }}>Missing: {h.missing.map((m) => HERO_CHECK_LABEL[m]).join(' · ')}</p>
                      )}
                    </div>
                    <Badge tone={STATUS[h.status].tone}>{STATUS[h.status].label}</Badge>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

/* ── Free bonus ─────────────────────────────────────────────────────────── */

function BonusCard({ view, saving, onSave }: { view: OfferView; saving: boolean; onSave: (bonus: Partial<BonusSettings>) => void }) {
  const { bonus } = view.settings
  const { economics } = view
  const [draft, setDraft] = useState(() => ({
    minSubtotal: String(bonus.minSubtotal),
    floorPounds: String(bonus.floorPounds),
    floorPct: String(Math.round(bonus.floorPct * 100)),
  }))
  const [picking, setPicking] = useState(false)
  useEffect(() => {
    setDraft({ minSubtotal: String(bonus.minSubtotal), floorPounds: String(bonus.floorPounds), floorPct: String(Math.round(bonus.floorPct * 100)) })
  }, [bonus.minSubtotal, bonus.floorPounds, bonus.floorPct])

  const numbersChanged =
    Number(draft.minSubtotal) !== bonus.minSubtotal ||
    Number(draft.floorPounds) !== bonus.floorPounds ||
    Number(draft.floorPct) !== Math.round(bonus.floorPct * 100)
  const saveNumbers = () =>
    onSave({ minSubtotal: Number(draft.minSubtotal) || 0, floorPounds: Number(draft.floorPounds) || 0, floorPct: (Number(draft.floorPct) || 0) / 100 })

  const inPool = new Set(bonus.pool)
  const titleOf = new Map(view.products.map((p) => [p.id, p.title]))
  const proposal = economics.proposal

  return (
    <Card elevation={1}>
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={HEADING}>Free bonus</h2>
          <p style={{ ...META, marginTop: 'var(--space-1)' }}>
            A free product with the full stack, picked for each person from the pool below. Stacks only, never the hero on its own, and never at a
            higher stack price, a smaller saving or an extra delivery charge.
          </p>
        </div>
        <Segmented
          label="Free bonus"
          columns={2}
          value={bonus.enabled ? 'on' : 'off'}
          onChange={(v) => !saving && onSave({ enabled: v === 'on' })}
          options={[
            { value: 'off', label: 'Off', sub: 'No bonus anywhere' },
            { value: 'on', label: 'On', sub: 'From the pool, where it qualifies' },
          ]}
        />
        {bonus.enabled && view.active.bonusPool.length === 0 && (
          <Note tone="attention" icon="info">On, but the pool is empty, so nothing changes: no stack gets a bonus.</Note>
        )}

        <section style={{ display: 'grid', gap: 'var(--space-3)' }} aria-labelledby="bonus-rules">
          <h3 id="bonus-rules" style={{ ...BODY, fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>Rules</h3>
          <div className="grid sm:grid-cols-3" style={{ gap: 'var(--space-3)' }}>
            <Input label="Minimum stack subtotal" prefix="£" type="number" inputMode="decimal" value={draft.minSubtotal}
              hint="Before any discount." onChange={(e) => setDraft({ ...draft, minSubtotal: e.target.value })} />
            <Input label="Margin floor (£ per order)" prefix="£" type="number" inputMode="decimal" value={draft.floorPounds}
              hint="What the order keeps after every cost, bonus included." onChange={(e) => setDraft({ ...draft, floorPounds: e.target.value })} />
            <Input label="And at least (% of net revenue)" suffix="%" type="number" inputMode="decimal" value={draft.floorPct}
              hint="The larger of the two floors applies." onChange={(e) => setDraft({ ...draft, floorPct: e.target.value })} />
          </div>
          <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
            <Button size="sm" disabled={!numbersChanged || saving} loading={saving && numbersChanged} onClick={saveNumbers}>
              Save these
            </Button>
            {proposal && (
              <Button
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => setDraft({ minSubtotal: String(proposal.minSubtotal), floorPounds: String(proposal.floorPounds), floorPct: String(Math.round(proposal.floorPct * 100)) })}
              >
                Use the proposal (£{proposal.minSubtotal}, £{proposal.floorPounds} / {pct(proposal.floorPct)})
              </Button>
            )}
          </div>
          {proposal ? (
            <p style={META}>Proposed from the numbers below: {proposal.why}</p>
          ) : (
            <p style={META}>Add products to the pool to see a proposed minimum and floor.</p>
          )}
          <Checkbox
            label="First order only, one per customer"
            checked={bonus.firstOrderOnly}
            disabled={saving}
            onChange={(e) => onSave({ firstOrderOnly: e.target.checked })}
          />
          <fieldset style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <legend style={{ ...META, marginBottom: 'var(--space-1)' }}>Which stacks qualify</legend>
            {STACK_LEVELS.map((level) => (
              <Checkbox
                key={level}
                label={LEVEL_NAME[level]}
                checked={bonus.tiers.includes(level)}
                disabled={saving}
                onChange={(e) => onSave({ tiers: e.target.checked ? [...bonus.tiers, level] : bonus.tiers.filter((t) => t !== level) })}
              />
            ))}
          </fieldset>
          <Segmented
            label="With a discount code"
            columns={2}
            value={bonus.codes}
            onChange={(v) => !saving && onSave({ codes: v })}
            options={[
              { value: 'better-of', label: 'Whichever is worth more', sub: 'The receipt says which' },
              { value: 'code-cancels-bonus', label: 'A code replaces it', sub: 'Any code, no bonus' },
            ]}
          />
        </section>

        <section style={{ display: 'grid', gap: 'var(--space-3)' }} aria-labelledby="bonus-pool">
          <div className="flex items-center justify-between flex-wrap" style={{ gap: 'var(--space-2)' }}>
            <h3 id="bonus-pool" style={{ ...BODY, fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
              The pool ({bonus.pool.length})
            </h3>
            <Button size="sm" variant="secondary" icon="plus" disabled={saving} onClick={() => setPicking(true)}>
              Add a product
            </Button>
          </div>
          {economics.missingFromCatalogue.length > 0 && (
            <Note tone="attention" icon="alert-triangle">
              Not in the catalogue any more, so never offered: {economics.missingFromCatalogue.join(', ')}.
            </Note>
          )}
          {bonus.pool.length === 0 ? (
            <p style={BODY}>The pool is empty. Add the products a stack could come with.</p>
          ) : (
            <PoolTable view={view} titleOf={titleOf} saving={saving} onRemove={(id) => onSave({ pool: bonus.pool.filter((x) => x !== id) })} />
          )}
          <ExampleStacks view={view} />
        </section>
      </div>
      {picking && (
        <ProductPicker
          label="Add a product to the bonus pool"
          products={view.products.map((p) => ({ ...p, stackSlots: p.stackSlot ? [p.stackSlot] : [] }) as unknown as CatalogueProduct)}
          disabledIds={inPool}
          onPick={(p) => {
            setPicking(false)
            onSave({ pool: [...bonus.pool, p.id] })
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </Card>
  )
}

function PoolTable({ view, titleOf, saving, onRemove }: { view: OfferView; titleOf: Map<string, string>; saving: boolean; onRemove: (id: string) => void }) {
  const { economics } = view
  const rowById = new Map(economics.rows.map((r) => [r.item.id, r]))
  return (
    <ul style={{ display: 'grid', gap: 'var(--space-2)' }} aria-label="Bonus pool">
      {view.settings.bonus.pool.map((id) => {
        const row = rowById.get(id)
        return (
          <li key={id}>
            <Card elevation={1} solid padding="tight">
              <div className="flex items-start justify-between flex-wrap" style={{ gap: 'var(--space-2)' }}>
                <div className="min-w-0">
                  <p style={{ ...BODY, color: 'var(--ink-1)', fontWeight: 'var(--weight-strong)' }}>{titleOf.get(id) ?? id}</p>
                  {row && (
                    <p style={META}>
                      List price {money(row.item.price)} · costs us{' '}
                      {row.costToUs == null ? 'an estimate (no PowerBody cost on file)' : `${money(row.costToUs)} ${economics.costsIncludeVat ? 'inc VAT' : 'ex VAT'}`}
                    </p>
                  )}
                </div>
                <Button size="sm" variant="ghost" icon="x" disabled={saving} onClick={() => onRemove(id)}>
                  Remove
                </Button>
              </div>
              {row && row.stacks.length > 0 && (
                <dl className="grid sm:grid-cols-3" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                  {row.stacks.map((s) => (
                    <div key={s.level}>
                      <dt style={META}>
                        {LEVEL_NAME[s.level]} · {money(s.without.subtotal)}
                      </dt>
                      <dd style={BODY}>
                        Keeps {money(s.without.contribution)} ({pct(s.without.marginPct)}) → {money(s.with.contribution)} ({pct(s.with.marginPct)}) with it
                      </dd>
                      <dd>
                        <Badge tone={s.qualifies ? 'positive' : 'neutral'}>
                          {s.qualifies ? 'Would be offered' : !s.meetsMinimum ? 'Under the minimum' : !s.clearsFloor ? 'Below the floor' : 'Not offered'}
                        </Badge>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </Card>
          </li>
        )
      })}
    </ul>
  )
}

function ExampleStacks({ view }: { view: OfferView }) {
  const { stacks, costsIncludeVat } = view.economics
  if (stacks.length === 0) return <p style={META}>Not enough products in stock to build the example stacks.</p>
  return (
    <div style={META}>
      <p>
        The example stacks, from the live catalogue (one product per slot, highest recommendation priority first), priced as a one-off with
        its bundle tier and delivery. Costs are PowerBody&apos;s, {costsIncludeVat ? 'VAT included' : 'ex VAT'}; “keeps” is after goods, both
        sides of delivery, card fees and returns.
      </p>
      <ul style={{ marginTop: 'var(--space-1)' }}>
        {stacks.map((s) => (
          <li key={s.level}>
            {s.name}, {money(s.margin.subtotal)}: {s.items.map((i) => i.title).join(', ')}. Keeps {money(s.margin.contribution)} ({pct(s.margin.marginPct)})
            {s.estimated ? ' — some costs estimated' : ''}.
          </li>
        ))}
      </ul>
    </div>
  )
}
