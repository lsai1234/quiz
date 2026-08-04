'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatGBP, type PricingConfig, type DiscountTier, type DeliveryService } from '@/lib/stack-blueprint/pricing'
import { goodPriceFor, auditProductPrice, worstCaseSubscriptionRate, supplierAccountCheck } from '@/lib/pricing/good-price'
import { unitEconomics } from '@/lib/pricing/unit-economics'
import { quoteDelivery, freeDeliveryImpact, ZONE_LABELS } from '@/lib/pricing/delivery'
import { Waterfall } from '@/components/portal/pricing/Waterfall'
import { RateCard } from '@/components/portal/pricing/RateCard'
import { VatPanel } from '@/components/portal/pricing/VatPanel'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { Budget, StackLevel } from '@/lib/types'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'
const RED = '#f87171'

const LEVELS: StackLevel[] = ['essentials', 'performance', 'complete']
const LEVEL_LABEL: Record<StackLevel, string> = {
  essentials: 'Essentials (smallest)',
  performance: 'Performance (middle)',
  complete: 'Complete (largest)',
}
const BUDGETS: Budget[] = ['under-30', '30-50', '50-80', '80-plus']

const pct = (n: number) => Math.round(n * 1000) / 10
const money = (n: number) => `£${n.toFixed(2)}`

type Tab = 'model' | 'catalogue' | 'vat' | 'rules'

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: 'model', label: 'The model', blurb: 'What a product costs us and what to sell it for.' },
  { id: 'catalogue', label: 'Every product', blurb: 'The same maths run over everything we sell.' },
  { id: 'vat', label: 'VAT', blurb: 'Where we stand on registration, and what it would cost.' },
  { id: 'rules', label: 'The rules', blurb: 'Every setting the model reads.' },
]

export default function PricingPage() {
  const [draft, setDraft] = useState<PricingConfig | null>(null)
  const [saved, setSavedConfig] = useState<PricingConfig | null>(null)
  const [catalogue, setCatalogue] = useState<CatalogueProduct[]>([])
  const [saving, setSaving] = useState(false)
  const [savedFlag, setSavedFlag] = useState(false)
  const [tab, setTab] = useState<Tab>('model')

  // The worked example.
  const [assetPrice, setAssetPrice] = useState(10)
  const [grams, setGrams] = useState(1150)
  const [shipEvery, setShipEvery] = useState(1)
  const [priceOverride, setPriceOverride] = useState<number | null>(null)
  const [scenarioId, setScenarioId] = useState(2)

  useEffect(() => {
    fetch('/api/portal/pricing').then((r) => r.json()).then((d) => { setDraft(d.current); setSavedConfig(d.current) }).catch(() => {})
    fetch('/api/catalogue').then((r) => r.json()).then((d) => setCatalogue(d.products ?? [])).catch(() => {})
  }, [])

  const good = useMemo(
    () => (draft ? goodPriceFor({ assetPrice, grams, shipEveryMonths: shipEvery, listPrice: priceOverride ?? undefined }, draft) : null),
    [draft, assetPrice, grams, shipEvery, priceOverride],
  )

  const audit = useMemo(() => {
    if (!draft || catalogue.length === 0) return null
    const rows = catalogue.map((p) => auditProductPrice(p, draft))
    return {
      rows: [...rows].sort((a, b) => (a.scenarios[2].marginPct ?? 0) - (b.scenarios[2].marginPct ?? 0)),
      losing: rows.filter((r) => !r.scenarios[2].profitable).length,
      belowTarget: rows.filter((r) => r.scenarios[2].profitable && r.scenarios[2].marginPct < draft.goodPricing.targetMarginPct).length,
      missingWeight: rows.filter((r) => r.weightEstimated).length,
      missingCost: rows.filter((r) => r.costEstimated).length,
    }
  }, [draft, catalogue])

  // Everything the catalogue implies about keeping the PowerBody account.
  const account = useMemo(() => {
    if (!draft || catalogue.length === 0) return null
    const avgPrice = catalogue.reduce((s, p) => s + p.basePrice, 0) / catalogue.length
    const costed = catalogue.filter((p) => p.cost != null)
    const ratio = costed.length > 0
      ? costed.reduce((s, p) => s + p.cost! / Math.max(0.01, p.basePrice), 0) / costed.length
      : draft.defaultCostRatio
    return { ...supplierAccountCheck(avgPrice, 0, ratio, draft), avgPrice, ratio }
  }, [draft, catalogue])

  if (!draft || !good) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

  const set = (patch: Partial<PricingConfig>) => { setDraft({ ...draft, ...patch }); setSavedFlag(false) }
  const setNested = <K extends 'delivery' | 'goodPricing' | 'introOffer' | 'vat' | 'paymentFees' | 'returns' | 'supplierAccount'>(
    key: K,
    patch: Partial<PricingConfig[K]>,
  ) => set({ [key]: { ...draft[key], ...patch } })
  const setScratch = (patch: Partial<PricingConfig['introOffer']['scratchReveal']>) =>
    setNested('introOffer', { scratchReveal: { ...draft.introOffer.scratchReveal, ...patch } })
  const setTier = (key: 'bundleTiers' | 'subscriptionTiers', i: number, patch: Partial<DiscountTier>) =>
    set({ [key]: draft[key].map((t, idx) => (idx === i ? { ...t, ...patch } : t)) })

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  async function save() {
    setSaving(true)
    await fetch('/api/portal/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overrides: draft }) })
    setSaving(false); setSavedFlag(true); setSavedConfig(draft)
  }
  async function reset() {
    setSaving(true)
    const r = await fetch('/api/portal/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }) })
    const next = (await r.json()).current
    setDraft(next); setSavedConfig(next); setSaving(false); setSavedFlag(true)
  }

  const scenario = good.scenarios[scenarioId] ?? good.scenarios[2]
  const shelfPrice = priceOverride ?? good.goodPrice ?? 0
  const parcel = quoteDelivery({ grams, orderValue: scenario.economics.shelfPrice }, draft)
  const freeDelivery = freeDeliveryImpact(grams, draft)

  return (
    <div className="pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Pricing</h1>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">
            Every rule that decides a price, and the full cost of a sale — VAT, PowerBody&apos;s delivery, card fees and returns included.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={reset} disabled={saving} className="text-xs font-semibold px-3 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)]">Reset</button>
          <button onClick={save} disabled={saving || !dirty} className="text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-40" style={{ background: ACCENT, color: '#001018', fontFamily: 'var(--font-display)' }}>
            {saving ? 'Saving…' : savedFlag && !dirty ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </div>

      {dirty && (
        <p className="text-[11px] rounded-lg px-2.5 py-1.5 mb-3 inline-block" style={{ background: `color-mix(in srgb, ${AMBER} 12%, transparent)`, color: AMBER }}>
          Unsaved changes — the figures below already reflect them; the live site does not.
        </p>
      )}

      {/* Tabs */}
      <nav className="flex gap-1.5 mb-1 mt-3">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap"
            style={{ background: tab === t.id ? ACCENT : 'var(--color-surface-2)', color: tab === t.id ? 'var(--color-bg)' : 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
            {t.label}
          </button>
        ))}
      </nav>
      <p className="text-[11px] text-[var(--color-muted)] mb-4">{TABS.find((t) => t.id === tab)!.blurb}</p>

      {/* ══ THE MODEL ══════════════════════════════════════════════════════ */}
      {tab === 'model' && (
        <div className="space-y-4">
          {/* Inputs */}
          <Card>
            <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-2">The product</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Input label="PowerBody charge us" prefix="£" value={assetPrice} step="0.01" onChange={setAssetPrice} help="ex VAT" />
              <Input label="Shipped weight" suffix="g" value={grams} onChange={setGrams} help={parcel.service ? parcel.service.name : 'no service!'} />
              <Input label="Ships every" suffix="mo" value={shipEvery} onChange={(n) => setShipEvery(Math.max(1, n))} help="months" />
              <Input label="Sell it for" prefix="£" value={shelfPrice} step="0.01" onChange={(n) => setPriceOverride(n)} help={priceOverride == null ? 'our recommendation' : 'your price'} />
            </div>
            {priceOverride != null && (
              <button onClick={() => setPriceOverride(null)} className="text-[11px] font-bold mt-2" style={{ color: ACCENT }}>
                ← back to the recommended price
              </button>
            )}
          </Card>

          {/* The answer */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Headline label="Sell it for" value={good.goodPrice != null ? money(good.goodPrice) : '—'} colour={ACCENT}
              note={`${pct(draft.goodPricing.targetMarginPct)}% margin even on the worst case`} />
            <Headline label="Break even at" value={good.breakEvenPrice != null ? money(good.breakEvenPrice) : '—'} colour={AMBER}
              note="below this the worst case loses money" />
            <Headline label="Costs us each month" value={money(good.monthlyCost.total)} colour="var(--color-text)"
              note={`${money(good.monthlyCost.goods)} goods + ${money(good.monthlyCost.delivery)} delivery`} />
          </div>

          {/* Scenario picker + waterfall */}
          <Card>
            <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-2">
              Where the money goes at {money(shelfPrice)}
            </p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {good.scenarios.map((s, i) => {
                const active = i === scenarioId
                const colour = !s.profitable ? RED : s.marginPct < draft.goodPricing.targetMarginPct ? AMBER : GREEN
                return (
                  <button key={s.id} onClick={() => setScenarioId(i)}
                    className="rounded-xl p-2.5 text-left transition-colors"
                    style={{ background: active ? 'var(--color-surface-2)' : 'transparent', border: `1px solid ${active ? colour : 'var(--color-border)'}` }}>
                    <p className="text-[11px] font-bold text-[var(--color-text)]">{s.label}</p>
                    <p className="text-base font-black" style={{ color: colour, fontFamily: 'var(--font-display)' }}>
                      {pct(s.marginPct)}%
                    </p>
                    <p className="text-[10px] text-[var(--color-muted)]">{money(s.contribution)} kept</p>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-[var(--color-muted)] mb-3 leading-snug">{scenario.description}</p>
            <Waterfall economics={scenario.economics} target={draft.goodPricing.targetMarginPct} />
          </Card>

          {/* Assumptions, stated */}
          <Card>
            <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-2">What this assumes</p>
            <div className="text-[11px] text-[var(--color-text-2)] space-y-1 leading-relaxed">
              <Assumption ok>
                The worst case is the <strong>largest bundle&apos;s {pct(good.assumptions.subscriptionDiscount)}% subscribe-&amp;-save</strong>,
                plus the <strong>{pct(good.assumptions.firstMonthDiscount)}% average first month</strong>, cancelled after {good.assumptions.horizonMonths} month{good.assumptions.horizonMonths === 1 ? '' : 's'}.
              </Assumption>
              <Assumption ok={good.assumptions.vatRegistered}>
                {good.assumptions.vatRegistered
                  ? 'VAT-registered: we hand over the VAT on sales and reclaim what PowerBody charge us.'
                  : 'Not VAT-registered: we keep the whole shelf price but cannot reclaim PowerBody’s VAT, so their prices cost us 20% more.'}
              </Assumption>
              <Assumption ok={!!parcel.service} warn={!parcel.service}>
                {parcel.service
                  ? <>Delivery via <strong>{parcel.service.name}</strong> at {money(parcel.supplierPriceExVat)} ex VAT to {ZONE_LABELS[parcel.zone]}, blended with {pct(draft.delivery.zone2SharePct)}% going to the Highlands.</>
                  : <>Nothing on PowerBody&apos;s rate card carries {grams}g — this order could not be shipped.</>}
              </Assumption>
              <Assumption ok={good.assumptions.weightKnown} warn={!good.assumptions.weightKnown}>
                {good.assumptions.weightKnown
                  ? `Weighed at ${good.assumptions.grams}g.`
                  : `No weight on file — assuming ${good.assumptions.grams}g, so the delivery cost is a guess.`}
              </Assumption>
              <Assumption ok>
                PowerBody give dropshippers <strong>no free delivery</strong>, so that charge lands on every single order —
                including ones where we give the member free postage.
              </Assumption>
            </div>
          </Card>

          {/* PowerBody account health */}
          {account && (
            <Card>
              <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-1">Keeping the PowerBody account</p>
              <p className="text-[11px] text-[var(--color-text-2)] leading-relaxed">
                They require <strong>{money(account.minimumSpend)} of wholesale spend a month</strong> to keep a dropshipping
                account open. At our average price of {money(account.avgPrice)} and a {pct(account.ratio)}% cost ratio, that is{' '}
                <strong style={{ color: ACCENT }}>{account.ordersNeeded} orders a month</strong>.
              </p>
              <p className="text-[11px] text-[var(--color-muted)] mt-1">
                They suggest aiming for a {money(account.targetOrderValue)} average order. Ours is {money(account.avgPrice)} —{' '}
                {account.vsTargetOrderValue >= 0
                  ? <span style={{ color: GREEN }}>{money(account.vsTargetOrderValue)} above.</span>
                  : <span style={{ color: AMBER }}>{money(Math.abs(account.vsTargetOrderValue))} below.</span>}
              </p>
            </Card>
          )}
        </div>
      )}

      {/* ══ EVERY PRODUCT ══════════════════════════════════════════════════ */}
      {tab === 'catalogue' && audit && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Headline label="Losing money" value={String(audit.losing)} colour={audit.losing > 0 ? RED : GREEN} note="on the worst case" small />
            <Headline label="Under target" value={String(audit.belowTarget)} colour={audit.belowTarget > 0 ? AMBER : GREEN} note={`below ${pct(draft.goodPricing.targetMarginPct)}%`} small />
            <Headline label="No cost set" value={String(audit.missingCost)} colour={audit.missingCost > 0 ? AMBER : GREEN} note="margin estimated" small />
            <Headline label="No weight set" value={String(audit.missingWeight)} colour={audit.missingWeight > 0 ? AMBER : GREEN} note="delivery estimated" small />
          </div>

          <Card>
            <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-2">
              Worst case, worst first
            </p>
            <div className="space-y-1">
              {audit.rows.map((r) => {
                const worst = r.scenarios[2]
                const colour = !worst.profitable ? RED : worst.marginPct < draft.goodPricing.targetMarginPct ? AMBER : GREEN
                return (
                  <div key={r.title} className="py-1.5 border-b border-[var(--color-border)] last:border-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] text-[var(--color-text-2)] truncate">{r.title}</span>
                      <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: colour }}>
                        {pct(worst.marginPct)}% · {money(worst.contribution)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 text-[10px] text-[var(--color-muted)]">
                      <span>
                        {money(r.atListPrice?.listPrice ?? 0)} now · good price {r.goodPrice != null ? money(r.goodPrice) : '—'}
                        {r.vsRrpPct != null && ` · ${pct(Math.abs(r.vsRrpPct))}% ${r.vsRrpPct >= 0 ? 'under' : 'over'} RRP`}
                      </span>
                      <span className="whitespace-nowrap">
                        {r.costEstimated && 'cost est. '}
                        {r.weightEstimated && 'weight est.'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ══ VAT ════════════════════════════════════════════════════════════ */}
      {tab === 'vat' && <VatPanel registered={draft.vat.registered} />}

      {/* ══ THE RULES ══════════════════════════════════════════════════════ */}
      {tab === 'rules' && (
        <div>
          <Section title="VAT" desc="The single biggest thing a retail margin gets wrong. Our shelf prices include VAT; PowerBody quote us without it. See the VAT tab for where we stand on registration.">
            <Toggle label="VAT-registered" value={draft.vat.registered} onChange={(v) => setNested('vat', { registered: v })}
              help="On: we hand over VAT on sales and reclaim what PowerBody charge us. Off: we keep the whole shelf price but their VAT becomes a real cost. These are genuinely different businesses — flip this the day registration takes effect and the whole hub reprices." />
            <Num label="Standard rate" value={pct(draft.vat.standardRate)} suffix="%" onChange={(n) => setNested('vat', { standardRate: n / 100 })}
              help="Applied unless a product carries its own rate — a few products sold as food are zero-rated." />
            <Num label="Registration threshold" value={draft.vat.registrationThreshold} suffix="£" onChange={(n) => setNested('vat', { registrationThreshold: n })}
              help="Taxable turnover over any rolling 12 months at which registering becomes compulsory. HMRC's figure — £90,000 since April 2024." />
            <Num label="Deregistration threshold" value={draft.vat.deregistrationThreshold} suffix="£" onChange={(n) => setNested('vat', { deregistrationThreshold: n })}
              help="Below this a registered business may deregister." />
          </Section>

          <Section title="Delivery — PowerBody's rate card" desc="Priced by weight and zone. There is no free-shipping threshold: their guide states free delivery is not available to dropshippers, so this lands on every order.">
            <RateCard config={draft} grams={grams} onChange={(services: DeliveryService[]) => setNested('delivery', { services })} />
            <div className="mt-3">
              <Num label="Orders to the Highlands & Islands" value={pct(draft.delivery.zone2SharePct)} suffix="%" onChange={(n) => setNested('delivery', { zone2SharePct: n / 100 })}
                help="Used to blend one honest delivery cost instead of pricing everything at the mainland or the worst rate." />
              <Num label="Assumed weight when unset" value={draft.delivery.defaultProductGrams} suffix="g" onChange={(n) => setNested('delivery', { defaultProductGrams: n })}
                help="What a product with no recorded weight is costed at. Readiness flags those products." />
              <Num label="We charge the member" value={draft.delivery.customerDeliveryCharge} suffix="£" onChange={(n) => setNested('delivery', { customerDeliveryCharge: n })} help="Inc VAT, at our retail prices, on orders below our own free threshold." />
              <Num label="Our free delivery above" value={draft.freeDeliveryThreshold} suffix="£" onChange={(n) => set({ freeDeliveryThreshold: n })}
                help="Our promise to the member, on OUR retail prices. Nothing to do with PowerBody's thresholds — theirs sit on wholesale values and dropshipping doesn't qualify for free shipping at all." />
              <Num label="Longest gap between deliveries" value={draft.maxDeliveryMonths} suffix="mo" onChange={(n) => set({ maxDeliveryMonths: n })} help="However big the tub." />

              {/* What the free-delivery promise actually costs. */}
              <div className="mt-3 rounded-xl p-3 text-[11px] leading-relaxed" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                <p className="font-bold text-[var(--color-text)] mb-1">What the free-delivery offer costs</p>
                <p className="text-[var(--color-muted)]">
                  Under {money(freeDelivery.threshold)} the member pays {money(freeDelivery.charge)}, of which we keep{' '}
                  {money(freeDelivery.chargeNet)} after VAT, against a {money(freeDelivery.supplierCost)} supplier charge
                  — so postage roughly {freeDelivery.belowThreshold >= 0 ? 'pays for itself' : 'costs us a little'}{' '}
                  ({freeDelivery.belowThreshold >= 0 ? '+' : ''}{money(freeDelivery.belowThreshold)}).
                </p>
                <p className="text-[var(--color-muted)] mt-1">
                  At or over {money(freeDelivery.threshold)} we collect nothing and still pay{' '}
                  <strong style={{ color: AMBER }}>{money(Math.abs(freeDelivery.aboveThreshold))}</strong> — on every
                  qualifying order. That is the price of the promise, and it is a marketing cost rather than a
                  fulfilment one.
                </p>
              </div>
            </div>
          </Section>

          <Section title="Taking the money & giving it back" desc="Small per order, real across a catalogue.">
            <Num label="Card fee" value={pct(draft.paymentFees.percent)} suffix="%" onChange={(n) => setNested('paymentFees', { percent: n / 100 })} help="Of the gross charge. VAT-exempt, so nothing to reclaim." />
            <Num label="Card fee, fixed" value={draft.paymentFees.fixed} suffix="£" onChange={(n) => setNested('paymentFees', { fixed: n })} help="Per successful charge." />
            <Num label="Orders returned" value={pct(draft.returns.ratePct)} suffix="%" onChange={(n) => setNested('returns', { ratePct: n / 100 })} help="Consumers have 14 days to change their mind. PowerBody refund the goods but never the shipping." />
            <Num label="A return costs" value={draft.returns.costMultipleOfDelivery} suffix="× delivery" onChange={(n) => setNested('returns', { costMultipleOfDelivery: n })} help="2 = the delivery out and the delivery back." />
          </Section>

          <Section title="Subscription offer" desc="What customers get for subscribing.">
            <Num label="Subscribe & save (base)" value={pct(draft.subscriptionDiscount)} suffix="%" onChange={(n) => set({ subscriptionDiscount: n / 100 })} help="Fallback for anything without a bundle rate." />
            {LEVELS.map((lvl) => (
              <Num key={lvl} label={`${LEVEL_LABEL[lvl]} rate`} value={pct(draft.levelSubscriptionDiscount[lvl])} suffix="%"
                help={lvl === 'complete' ? 'The deepest rate on offer — the one the model prices against.' : undefined}
                onChange={(n) => set({ levelSubscriptionDiscount: { ...draft.levelSubscriptionDiscount, [lvl]: n / 100 } })} />
            ))}
            <Num label="Minimum commitment" value={draft.minSubscriptionMonths} suffix="mo" onChange={(n) => set({ minSubscriptionMonths: n })} help="Months of revenue a price is judged over. It no longer stops anyone cancelling — the pay-for-what-shipped settlement does that." />
            <Num label="Minimum to subscribe" value={draft.minSubscriptionMonthly} suffix="£/mo" onChange={(n) => set({ minSubscriptionMonthly: n })} />
            <Num label="Servings before a refill SKU" value={draft.maxSubscriptionServings} suffix="srv" onChange={(n) => set({ maxSubscriptionServings: n })} />
          </Section>

          <Section title="First month" desc="The offer that gets people to start — and what it really costs us.">
            <Num label="Flat first-month offer" value={pct(draft.introOffer.firstMonthDiscount)} suffix="%" onChange={(n) => setNested('introOffer', { firstMonthDiscount: n / 100 })} help="Used when the scratch card is off." />
            <Num label="Average first-month discount" value={pct(draft.introOffer.effectiveFirstMonthDiscount)} suffix="%" onChange={(n) => setNested('introOffer', { effectiveFirstMonthDiscount: n / 100 })} help="What the first month costs on average across people who actually subscribe. Scratch cards are rationed to hit this. The model uses this number." />
            <Toggle label="Scratch-to-reveal card" value={draft.introOffer.scratchReveal.enabled} onChange={(v) => setScratch({ enabled: v })} help="Off = everyone gets the flat offer above." />
            {draft.introOffer.scratchReveal.enabled && (
              <div className="pt-2 space-y-2">
                {draft.introOffer.scratchReveal.outcomes.map((o, i) => {
                  const total = draft.introOffer.scratchReveal.outcomes.reduce((s, x) => s + x.weight, 0) || 1
                  const update = (patch: Partial<typeof o>) =>
                    setScratch({ outcomes: draft.introOffer.scratchReveal.outcomes.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) })
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <input type="number" value={pct(o.discount)} onChange={(e) => update({ discount: (parseFloat(e.target.value) || 0) / 100 })} className={SMALL_INPUT} style={INPUT_STYLE} />
                      <span className="text-[11px] text-[var(--color-muted)]">% off · weight</span>
                      <input type="number" value={o.weight} onChange={(e) => update({ weight: Math.max(0, parseFloat(e.target.value) || 0) })} className={SMALL_INPUT} style={INPUT_STYLE} />
                      <span className="text-[11px] text-[var(--color-muted)] flex-1">≈ 1 in {Math.round(total / Math.max(0.0001, o.weight))}</span>
                      <button onClick={() => setScratch({ outcomes: draft.introOffer.scratchReveal.outcomes.filter((_, idx) => idx !== i) })} className="text-[var(--color-muted)] text-sm px-1">✕</button>
                    </div>
                  )
                })}
                <button onClick={() => setScratch({ outcomes: [...draft.introOffer.scratchReveal.outcomes, { discount: 0.1, weight: 10 }] })} className="text-xs font-bold" style={{ color: ACCENT }}>+ Add a card</button>
              </div>
            )}
          </Section>

          <Section title="Profit guardrails" desc="What the model aims for, and the floor under the discount engine.">
            <Num label="Target margin" value={pct(draft.goodPricing.targetMarginPct)} suffix="%" onChange={(n) => setNested('goodPricing', { targetMarginPct: n / 100 })}
              help="Contribution ÷ net revenue on the worst case — after VAT, delivery, card fees and returns. A far stronger number than a margin on the gross price." />
            <Num label="Judge prices over" value={draft.goodPricing.horizonMonths ?? 0} suffix="mo" onChange={(n) => setNested('goodPricing', { horizonMonths: n > 0 ? n : null })} help="0 = use the minimum commitment, the true worst case." />
            <Toggle label="Assume we absorb delivery" value={draft.goodPricing.assumeFreeDelivery} onChange={(v) => setNested('goodPricing', { assumeFreeDelivery: v })} help="On is the honest worst case — a subscription clearing the free-delivery threshold pays us nothing for postage." />
            <Num label="Never sell below this markup" value={pct(draft.marginFloorPct)} suffix="%" onChange={(n) => set({ marginFloorPct: n / 100 })} help="A markup over cost that floors the discount engine line by line. Not the same thing as the margin above." />
            <Num label="Assumed cost (if not set)" value={pct(draft.defaultCostRatio)} suffix="%" onChange={(n) => set({ defaultCostRatio: n / 100 })} help="Share of the NET price a product costs when no cost is on file." />
          </Section>

          <Section title="The PowerBody account" desc="Their terms, which constrain our pricing as firmly as any margin floor.">
            <Num label="Minimum monthly spend" value={draft.supplierAccount.minimumMonthlySpend} suffix="£" onChange={(n) => setNested('supplierAccount', { minimumMonthlySpend: n })} help="Wholesale spend needed to keep the dropshipping account open." />
            <Num label="Grace period" value={draft.supplierAccount.graceMonths} suffix="mo" onChange={(n) => setNested('supplierAccount', { graceMonths: n })} help="Time from signup to reach it." />
            <Num label="Their suggested order value" value={draft.supplierAccount.targetOrderValue} suffix="£" onChange={(n) => setNested('supplierAccount', { targetOrderValue: n })} help="A benchmark to compare ours against." />
          </Section>

          <Section title="One-off bundle discounts" desc="Spend more in a single order, save more. The best-qualifying tier applies.">
            <TierEditor tiers={draft.bundleTiers} onChange={(i, p) => setTier('bundleTiers', i, p)}
              onAdd={() => set({ bundleTiers: [...draft.bundleTiers, { id: `tier-${Date.now()}`, label: 'New tier', minSubtotal: 0, discountPct: 0.05 }] })}
              onRemove={(i) => set({ bundleTiers: draft.bundleTiers.filter((_, idx) => idx !== i) })} />
          </Section>

          <Section title="Extra subscription discounts" desc="On top of the bundle rate. If one beats the largest bundle, it becomes the worst case the model prices against.">
            <TierEditor tiers={draft.subscriptionTiers} onChange={(i, p) => setTier('subscriptionTiers', i, p)}
              onAdd={() => set({ subscriptionTiers: [...draft.subscriptionTiers, { id: `sub-${Date.now()}`, label: 'New tier', minSubtotal: 0, discountPct: 0.05 }] })}
              onRemove={(i) => set({ subscriptionTiers: draft.subscriptionTiers.filter((_, idx) => idx !== i) })} />
          </Section>

          <Section title="Budget ceilings" desc="The most a built stack may cost for each budget answer. The quiz never goes over these.">
            {BUDGETS.map((b) => (
              <Num key={b} label={b.replace('under-', 'Under £').replace('80-plus', '£80+').replace(/^(\d+)-(\d+)$/, '£$1 – £$2')}
                value={draft.budgetCaps[b] ?? 0} suffix="£" help={b === '80-plus' ? '0 = no ceiling.' : undefined}
                onChange={(n) => set({ budgetCaps: { ...draft.budgetCaps, [b]: n > 0 ? n : null } })} />
            ))}
          </Section>

          <Section title="When a product changes" desc="What happens to a live subscription when the supplier drops a product or moves its price.">
            <Choice label="Default when a product goes away" value={draft.defaultChangePolicy}
              options={[{ v: 'auto-swap', l: 'Swap for the closest equivalent' }, { v: 'remove', l: 'Take it off the plan' }]}
              onChange={(v) => set({ defaultChangePolicy: v as PricingConfig['defaultChangePolicy'] })} />
            <Num label="Replacement price tolerance" value={pct(draft.substitutionPriceTolerancePct)} suffix="%" onChange={(n) => set({ substitutionPriceTolerancePct: n / 100 })} />
            <Num label="Supplier price move that matters" value={pct(draft.priceChangeThresholdPct)} suffix="%" onChange={(n) => set({ priceChangeThresholdPct: n / 100 })} />
            <Num label="Notice before a rise can bill" value={draft.priceChangeNoticeDays} suffix="days" onChange={(n) => set({ priceChangeNoticeDays: n })} help="UK subscription rules require clear advance notice and a free exit." />
            <Num label="Missed syncs before discontinued" value={draft.discontinuedAfterMissedSyncs} suffix="syncs" onChange={(n) => set({ discontinuedAfterMissedSyncs: n })} />
            <Num label="Your window to overrule" value={draft.founderReviewHours} suffix="hrs" onChange={(n) => set({ founderReviewHours: n })} />
          </Section>
        </div>
      )}
    </div>
  )
}

// ─── Building blocks ──────────────────────────────────────────────────────────

const INPUT_STYLE = { background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' } as const
const SMALL_INPUT = 'w-16 px-2 py-1.5 rounded-lg text-xs text-right outline-none'

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">{children}</div>
}

function Headline({ label, value, note, colour, small }: { label: string; value: string; note?: string; colour: string; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5 text-center">
      <p className="text-[10px] uppercase font-bold text-[var(--color-muted)]">{label}</p>
      <p className={`${small ? 'text-xl' : 'text-2xl'} font-black my-0.5`} style={{ color: colour, fontFamily: 'var(--font-display)' }}>{value}</p>
      {note && <p className="text-[10px] text-[var(--color-muted)] leading-snug">{note}</p>}
    </div>
  )
}

function Input({ label, value, onChange, prefix, suffix, help, step }: {
  label: string; value: number; onChange: (n: number) => void; prefix?: string; suffix?: string; help?: string; step?: string
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase font-bold text-[var(--color-muted)] block mb-1">{label}</span>
      <span className="flex items-center gap-1">
        {prefix && <span className="text-xs text-[var(--color-muted)]">{prefix}</span>}
        <input type="number" step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full min-w-0 px-2 py-1.5 rounded-lg text-sm outline-none" style={INPUT_STYLE} />
        {suffix && <span className="text-xs text-[var(--color-muted)]">{suffix}</span>}
      </span>
      {help && <span className="text-[10px] text-[var(--color-muted)] block mt-0.5">{help}</span>}
    </label>
  )
}

function Assumption({ children, ok, warn }: { children: React.ReactNode; ok?: boolean; warn?: boolean }) {
  return (
    <p className="flex gap-1.5">
      <span style={{ color: warn ? AMBER : ok ? GREEN : 'var(--color-muted)' }}>{warn ? '!' : '·'}</span>
      <span>{children}</span>
    </p>
  )
}

function TierEditor({ tiers, onChange, onAdd, onRemove }: {
  tiers: DiscountTier[]
  onChange: (i: number, patch: Partial<DiscountTier>) => void
  onAdd: () => void
  onRemove: (i: number) => void
}) {
  return (
    <div className="space-y-2">
      {tiers.length === 0 && <p className="text-[11px] text-[var(--color-muted)]">None set.</p>}
      {tiers.map((t, i) => (
        <div key={t.id} className="flex items-center gap-2">
          <input value={t.label} onChange={(e) => onChange(i, { label: e.target.value })} className="flex-1 min-w-0 px-2 py-1.5 rounded-lg text-xs outline-none" style={INPUT_STYLE} />
          <span className="text-[11px] text-[var(--color-muted)]">spend £</span>
          <input type="number" value={t.minSubtotal ?? 0} onChange={(e) => onChange(i, { minSubtotal: parseFloat(e.target.value) })} className="w-14 px-2 py-1.5 rounded-lg text-xs text-right outline-none" style={INPUT_STYLE} />
          <input type="number" value={pct(t.discountPct)} onChange={(e) => onChange(i, { discountPct: parseFloat(e.target.value) / 100 })} className="w-12 px-2 py-1.5 rounded-lg text-xs text-right outline-none" style={INPUT_STYLE} />
          <span className="text-[11px] text-[var(--color-muted)]">% off</span>
          <button onClick={() => onRemove(i)} className="text-[var(--color-muted)] text-sm px-1">✕</button>
        </div>
      ))}
      <button onClick={onAdd} className="text-xs font-bold mt-1" style={{ color: ACCENT }}>+ Add a tier</button>
    </div>
  )
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 border-b border-[var(--color-border)] last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[var(--color-text)]">{label}</span>
        <span className="flex items-center gap-1 flex-shrink-0">{children}</span>
      </div>
      {help && <p className="text-[11px] text-[var(--color-muted)] mt-1 leading-snug pr-24">{help}</p>}
    </div>
  )
}

function Num({ label, value, onChange, suffix, help }: { label: string; value: number; onChange: (n: number) => void; suffix?: string; help?: string }) {
  return (
    <Field label={label} help={help}>
      <input type="number" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} className="w-20 px-2 py-1.5 rounded-lg text-sm text-right outline-none" style={INPUT_STYLE} />
      {suffix && <span className="text-[11px] text-[var(--color-muted)] w-16">{suffix}</span>}
    </Field>
  )
}

function Toggle({ label, value, onChange, help }: { label: string; value: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <Field label={label} help={help}>
      <button onClick={() => onChange(!value)} className="text-xs font-bold px-3 py-1.5 rounded-lg"
        style={{ background: value ? ACCENT : 'var(--color-surface-2)', color: value ? 'var(--color-bg)' : 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
        {value ? 'On' : 'Off'}
      </button>
    </Field>
  )
}

function Choice({ label, value, options, onChange, help }: { label: string; value: string; options: { v: string; l: string }[]; onChange: (v: string) => void; help?: string }) {
  return (
    <Field label={label} help={help}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs outline-none" style={INPUT_STYLE}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </Field>
  )
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-4">
      <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>{title}</p>
      {desc && <p className="text-[11px] text-[var(--color-muted)] mb-2 mt-0.5 leading-snug">{desc}</p>}
      <div className="mt-1">{children}</div>
    </div>
  )
}
