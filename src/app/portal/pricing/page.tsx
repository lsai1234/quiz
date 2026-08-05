'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatGBP, type PricingConfig, type DiscountTier, type DeliveryService } from '@/lib/stack-blueprint/pricing'
import { priceProduct, listPriceFor, reviewCatalogue, type CatalogueReview } from '@/lib/pricing/list-price'
import { checkScenarios, type ScenarioCheck } from '@/lib/pricing/scenarios'
import { pricingThresholds } from '@/lib/pricing/thresholds'
import { checkLadder } from '@/lib/pricing/ladder'
import { CutOffs } from '@/components/portal/pricing/CutOffs'
import { LadderPanel } from '@/components/portal/pricing/LadderPanel'
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

const INPUT_STYLE = { background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' } as const
const SMALL_INPUT = 'w-16 px-2 py-1.5 rounded-lg text-xs text-right outline-none'

type Tab = 'overview' | 'products' | 'rules'

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: 'overview', label: 'Overview', blurb: 'What we can afford to sell, and whether every way of buying pays.' },
  { id: 'products', label: 'Products', blurb: 'What we pay, what we charge, and what we keep on each one.' },
  { id: 'rules', label: 'Rules', blurb: 'Every setting, with what it does written next to it.' },
]

export default function PricingPage() {
  const [draft, setDraft] = useState<PricingConfig | null>(null)
  const [saved, setSavedConfig] = useState<PricingConfig | null>(null)
  const [catalogue, setCatalogue] = useState<CatalogueProduct[]>([])
  const [saving, setSaving] = useState(false)
  const [savedFlag, setSavedFlag] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')

  // The worked example on the Products tab.
  const [assetPrice, setAssetPrice] = useState(10)
  const [parcelItems, setParcelItems] = useState(3)
  useEffect(() => { if (draft) setParcelItems(Math.max(1, Math.round(draft.orderMix.itemsPerOrder ?? 1))) }, [draft?.orderMix.itemsPerOrder]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/portal/pricing').then((r) => r.json()).then((d) => { setDraft(d.current); setSavedConfig(d.current) }).catch(() => {})
    fetch('/api/catalogue').then((r) => r.json()).then((d) => setCatalogue(d.products ?? [])).catch(() => {})
  }, [])

  const cutOffs = useMemo(() => (draft ? pricingThresholds(draft) : null), [draft])

  const products = useMemo(() => {
    if (!draft || catalogue.length === 0) return null
    return reviewCatalogue(
      catalogue.map((p) => ({
        title: p.title,
        supplierRrp: p.supplierRrp ?? p.compareAtPrice ?? null,
        cost: p.cost ?? null,
        servings: p.servings,
        currentPrice: p.basePrice,
      })),
      draft,
    )
  }, [draft, catalogue])

  const ladder = useMemo(() => {
    if (!draft) return null
    const priced = catalogue.filter((p) => p.basePrice > 0)
    const avg = priced.length > 0 ? priced.reduce((s, p) => s + p.basePrice, 0) / priced.length : 25
    return checkLadder(avg, draft)
  }, [draft, catalogue])

  // Every route a customer can take through a typical quiz box. This replaced a
  // weighted average-order model with break-even sweeps: same question, but you
  // can read the answer instead of reconstructing it.
  const typicalBox = useMemo(() => {
    if (!draft) return null
    const priced = catalogue.filter((p) => p.basePrice > 0)
    const n = Math.max(1, Math.round(draft.orderMix.itemsPerOrder ?? 1))
    const avgPrice = priced.length > 0 ? priced.reduce((s, p) => s + p.basePrice, 0) / priced.length : 25
    const avgCost = priced.length > 0
      ? priced.reduce((s, p) => s + (p.cost ?? p.basePrice * draft.defaultCostRatio), 0) / priced.length
      : 12
    return checkScenarios({ listPrice: avgPrice * n, supplierCost: avgCost * n }, draft)
  }, [draft, catalogue])

  if (!draft || !cutOffs || !ladder || !typicalBox) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

  const set = (patch: Partial<PricingConfig>) => { setDraft({ ...draft, ...patch }); setSavedFlag(false) }
  const setNested = <K extends 'delivery' | 'goodPricing' | 'introOffer' | 'vat' | 'paymentFees' | 'returns' | 'supplierAccount' | 'partners' | 'orderMix' | 'listPricing'>(
    key: K,
    patch: Partial<PricingConfig[K]>,
  ) => set({ [key]: { ...draft[key], ...patch } })
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

  const example = priceProduct({ cost: assetPrice, sharedParcelItems: parcelItems }, draft)
  const exampleScenarios = checkScenarios(
    { listPrice: example.listPrice, supplierCost: assetPrice, sharedParcelItems: parcelItems },
    draft,
  )

  return (
    <div className="pb-10">
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Pricing</h1>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">
            Every price is <strong style={{ color: 'var(--color-text)' }}>what we pay, doubled</strong>. This page shows what that leaves us.
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

      {/* ══ OVERVIEW ═══════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <CutOffs thresholds={cutOffs} />
          <ScenarioTable check={typicalBox} title="A typical quiz box, every way of buying it" />
          <LadderPanel check={ladder} />
        </div>
      )}

      {/* ══ PRODUCTS ═══════════════════════════════════════════════════════ */}
      {tab === 'products' && (
        <div className="space-y-4">
          {products && <ProductTable review={products} />}

          <Card>
            <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-2">Price anything</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Input label="PowerBody charge us" prefix="£" value={assetPrice} step="0.01" onChange={setAssetPrice} help="ex VAT" />
              <Input label="In a box of" suffix="items" value={parcelItems} onChange={(n) => setParcelItems(Math.max(1, Math.round(n)))}
                help={parcelItems > 1 ? 'postage shared' : 'ships on its own'} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Headline label="We charge" value={money(example.listPrice)} colour="var(--color-text)" note={`${money(assetPrice)} × ${draft.listPricing.markupOnCost}`} small />
              <Headline label="A subscriber pays" value={money(example.subscriberPrice)} colour={ACCENT} note="middle bundle" small />
              <Headline label="We keep" value={money(example.keeps)} colour={example.viable ? GREEN : RED} note={`${pct(example.marginPct)}% a month`} small />
            </div>
            {example.warning && <p className="text-[11px] mt-2" style={{ color: AMBER }}>{example.warning}</p>}
          </Card>

          <ScenarioTable check={exampleScenarios} title="…and every way that product can be bought" />
        </div>
      )}

      {/* ══ RULES ══════════════════════════════════════════════════════════ */}
      {tab === 'rules' && (
        <div>
          <Section title="What we charge" desc="One rule for the whole catalogue: double what PowerBody charge us. Nothing here reads the brand's RRP — that is a suggestion, it varies, and some products don't have one.">
            <Num label="Multiply what we pay by" value={draft.listPricing.markupOnCost} suffix="×" onChange={(n) => setNested('listPricing', { markupOnCost: n })}
              help={`A £10 product sells for ${money(listPriceFor(10, draft))}. Below about 1.9× the margin gets thin enough that one bad delivery band wipes it out.`} />
            <Toggle label="Round to .99" value={draft.listPricing.roundTo99} onChange={(v) => setNested('listPricing', { roundTo99: v })}
              help="Rounds DOWN, never up — rounding up can turn a saving into a markup on a discounted line." />
          </Section>

          <Section title="The floors" desc="What we will and won't sell. These are the only settings that say no.">
            <Num label="Smallest order we accept" value={draft.minOrderValue} suffix="£" onChange={(n) => set({ minOrderValue: n })}
              help="A one-off has nothing behind it, so it must pay on its own. Enforced at the checkout and in the cart API, not just advised." />
            <Num label="Cheapest product the quiz may pick" value={draft.minQuizProductPrice} suffix="£" onChange={(n) => set({ minQuizProductPrice: n })}
              help="Even sharing a box three ways a stack line carries ~£2.60 of postage. Below this there isn't the margin to cover it — such products are add-ons, not slots." />
            <Num label="Minimum to subscribe" value={draft.minSubscriptionMonthly} suffix="£/mo" onChange={(n) => set({ minSubscriptionMonthly: n })}
              help="A plan smaller than this doesn't cover its goods and postage over its life. The Overview tab computes the floor and flags this if it drops below." />
            <Num label="Never sell below this markup" value={pct(draft.marginFloorPct)} suffix="%" onChange={(n) => set({ marginFloorPct: n / 100 })}
              help="A markup over cost that floors every discount line by line, the intro offer included." />
            <Num label="Assumed cost (if not set)" value={pct(draft.defaultCostRatio)} suffix="%" onChange={(n) => set({ defaultCostRatio: n / 100 })}
              help="Share of the price a product costs when no cost is on file. Should match 1 ÷ the markup above." />
          </Section>

          <Section title="Delivery" desc="Two different numbers: what PowerBody charge US (banded on our spend in the box) and what we charge the MEMBER (banded on their basket).">
            <RateCard config={draft} supplierValue={assetPrice * parcelItems} onChange={(services: DeliveryService[]) => setNested('delivery', { services })} />
            <div className="mt-3">
              <Num label="We charge the member" value={draft.delivery.customerDeliveryCharge} suffix="£" onChange={(n) => setNested('delivery', { customerDeliveryCharge: n })} help="On orders below our own free threshold." />
              <Num label="Our free delivery above" value={draft.freeDeliveryThreshold} suffix="£" onChange={(n) => set({ freeDeliveryThreshold: n })}
                help="On the basket SUBTOTAL, before any discount — so a basket can't lose the perk by earning a discount. Nothing to do with PowerBody's thresholds, which sit on our wholesale spend." />
              <Num label="Orders to the Highlands & Islands" value={pct(draft.delivery.zone2SharePct)} suffix="%" onChange={(n) => setNested('delivery', { zone2SharePct: n / 100 })}
                help="Used to blend one honest delivery cost rather than pricing everything at the mainland or the worst rate." />
              <Num label="Assumed weight when unset" value={draft.delivery.defaultProductGrams} suffix="g" onChange={(n) => setNested('delivery', { defaultProductGrams: n })} help="PowerBody's order call needs a weight even though they don't price on it." />
              <Num label="Longest gap between deliveries" value={draft.maxDeliveryMonths} suffix="mo" onChange={(n) => set({ maxDeliveryMonths: n })} help="However big the tub." />
            </div>
          </Section>

          <Section title="Subscription offer" desc="What members get for committing. The one thing to protect: subscribing must always beat buying once.">
            <Num label="Subscribe & save (base)" value={pct(draft.subscriptionDiscount)} suffix="%" onChange={(n) => set({ subscriptionDiscount: n / 100 })} help="Fallback for anything without a bundle rate." />
            {LEVELS.map((lvl) => (
              <Num key={lvl} label={`${LEVEL_LABEL[lvl]} rate`} value={pct(draft.levelSubscriptionDiscount[lvl])} suffix="%"
                help={lvl === 'complete' ? 'The deepest rate on offer.' : undefined}
                onChange={(n) => set({ levelSubscriptionDiscount: { ...draft.levelSubscriptionDiscount, [lvl]: n / 100 } })} />
            ))}
            <LadderPanel check={ladder} compact />
          </Section>

          <Section title="One-off discount" desc="What someone gets for a big box without committing. Deliberately flat — when this laddered too it collided with subscribe-&-save and beat it.">
            <TierEditor tiers={draft.bundleTiers} onChange={(i, p) => setTier('bundleTiers', i, p)}
              onAdd={() => set({ bundleTiers: [...draft.bundleTiers, { id: `tier-${Date.now()}`, label: 'New tier', minSubtotal: 0, discountPct: 0.05 }] })}
              onRemove={(i) => set({ bundleTiers: draft.bundleTiers.filter((_, idx) => idx !== i) })} />
          </Section>

          <Section title="First month" desc="The offer that gets people to start. The top card is MEANT to lose money — it is rationed marketing, and only the average has to pay.">
            <Num label="Average we give away" value={pct(draft.introOffer.effectiveFirstMonthDiscount)} suffix="%" onChange={(n) => setNested('introOffer', { effectiveFirstMonthDiscount: n / 100 })}
              help="Cards are allocated so the average across people who actually check out lands here, whatever the mix of outcomes." />
            <Toggle label="Scratch-to-reveal" value={draft.introOffer.scratchReveal.enabled} onChange={(v) => setNested('introOffer', { scratchReveal: { ...draft.introOffer.scratchReveal, enabled: v } })} />
            {draft.introOffer.scratchReveal.enabled && (
              <div className="pt-2 space-y-1.5">
                {draft.introOffer.scratchReveal.outcomes.map((o, i) => {
                  const total = draft.introOffer.scratchReveal.outcomes.reduce((s, x) => s + Math.max(0, x.weight), 0)
                  const update = (patch: Partial<typeof o>) => setNested('introOffer', {
                    scratchReveal: { ...draft.introOffer.scratchReveal, outcomes: draft.introOffer.scratchReveal.outcomes.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) },
                  })
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <input type="number" value={pct(o.discount)} onChange={(e) => update({ discount: (parseFloat(e.target.value) || 0) / 100 })} className={SMALL_INPUT} style={INPUT_STYLE} />
                      <span className="text-[11px] text-[var(--color-muted)]">% off, weight</span>
                      <input type="number" value={o.weight} onChange={(e) => update({ weight: Math.max(0, parseFloat(e.target.value) || 0) })} className={SMALL_INPUT} style={INPUT_STYLE} />
                      <span className="text-[11px] text-[var(--color-muted)] flex-1">≈ 1 in {Math.round(total / Math.max(0.0001, o.weight))}</span>
                      <button onClick={() => setNested('introOffer', { scratchReveal: { ...draft.introOffer.scratchReveal, outcomes: draft.introOffer.scratchReveal.outcomes.filter((_, idx) => idx !== i) } })} className="text-[var(--color-muted)] text-sm px-1">✕</button>
                    </div>
                  )
                })}
                <button onClick={() => setNested('introOffer', { scratchReveal: { ...draft.introOffer.scratchReveal, outcomes: [...draft.introOffer.scratchReveal.outcomes, { discount: 0.1, weight: 10 }] } })} className="text-xs font-bold" style={{ color: ACCENT }}>+ Add a card</button>
              </div>
            )}
          </Section>

          <Section title="Taking the money & giving it back" desc="Small per order, real across a catalogue.">
            <Num label="Card fee" value={pct(draft.paymentFees.percent)} suffix="%" onChange={(n) => setNested('paymentFees', { percent: n / 100 })} help="Of the gross charge. VAT-exempt, so nothing to reclaim." />
            <Num label="Card fee, fixed" value={draft.paymentFees.fixed} suffix="£" onChange={(n) => setNested('paymentFees', { fixed: n })} help="Per successful charge." />
            <Num label="Orders returned" value={pct(draft.returns.ratePct)} suffix="%" onChange={(n) => setNested('returns', { ratePct: n / 100 })} help="Consumers have 14 days. PowerBody refund the goods but never the shipping." />
            <Num label="A return costs" value={draft.returns.costMultipleOfDelivery} suffix="× delivery" onChange={(n) => setNested('returns', { costMultipleOfDelivery: n })} help="2 = the delivery out and the delivery back." />
          </Section>

          <Section title="Influencer partners" desc="Commission is a share of NET revenue — never of the gross, because up to a fifth of that is HMRC's.">
            <Num label="Commission, first order" value={pct(draft.partners.firstOrderPct)} suffix="%" onChange={(n) => setNested('partners', { firstOrderPct: n / 100 })}
              help="Paid once per customer, and priced for a subscription that follows — so it has to stay low enough that an attributed ONE-OFF order still pays." />
            <Num label="Commission, renewals" value={pct(draft.partners.renewalPct)} suffix="%" onChange={(n) => setNested('partners', { renewalPct: n / 100 })} />
            <Num label="Renewals earn for" value={draft.partners.renewalMonths} suffix="mo" onChange={(n) => setNested('partners', { renewalMonths: n })}
              help={`Worth matching to how long a subscriber actually stays (${draft.orderMix.averageRetentionMonths} months).`} />
            <Num label="Their code guarantees" value={pct(draft.partners.introFloorPct)} suffix="% off" onChange={(n) => setNested('partners', { introFloorPct: n / 100 })}
              help={`Keep it near the average card (${pct(draft.introOffer.effectiveFirstMonthDiscount)}%): deeper and a code costs a bigger discount AND a commission on top.`} />
            <Toggle label="Partners charge us VAT" value={draft.partners.partnersChargeVat} onChange={(v) => setNested('partners', { partnersChargeVat: v })} />
          </Section>

          <Section title="VAT" desc="Our prices include VAT; PowerBody quote us without it. Not registered today, so their VAT is a real cost we can't reclaim.">
            <Toggle label="VAT-registered" value={draft.vat.registered} onChange={(v) => setNested('vat', { registered: v })}
              help="On: we hand over VAT on sales and reclaim what PowerBody charge. Off: we keep the whole shelf price but their VAT is a cost. Genuinely different businesses." />
            <Num label="Standard rate" value={pct(draft.vat.standardRate)} suffix="%" onChange={(n) => setNested('vat', { standardRate: n / 100 })} />
            <Num label="Registration threshold" value={draft.vat.registrationThreshold} suffix="£" onChange={(n) => setNested('vat', { registrationThreshold: n })} help="HMRC's figure — £90,000 since April 2024." />
            <div className="pt-3"><VatPanel registered={draft.vat.registered} /></div>
          </Section>

          <Section title="Bundles & budgets" desc="How big a stack the quiz builds, and the most it may cost.">
            {BUDGETS.map((b) => (
              <Num key={b} label={b.replace('under-', 'Under £').replace('80-plus', '£80+').replace(/^(\d+)-(\d+)$/, '£$1 – £$2')}
                value={draft.budgetCaps[b] ?? 0} suffix="£" help={b === '80-plus' ? '0 = no ceiling.' : undefined}
                onChange={(n) => set({ budgetCaps: { ...draft.budgetCaps, [b]: n > 0 ? n : null } })} />
            ))}
            <Num label="Products in a typical box" value={draft.orderMix.itemsPerOrder} onChange={(n) => setNested('orderMix', { itemsPerOrder: n })}
              help="Decides how many ways one delivery is split. PowerBody charge per parcel, so this is the single biggest lever on a cheap product's margin." />
            <Num label="Months a subscriber stays" value={draft.orderMix.averageRetentionMonths} suffix="mo" onChange={(n) => setNested('orderMix', { averageRetentionMonths: n })} />
          </Section>
        </div>
      )}
    </div>
  )
}

/**
 * Every route a customer can take, and what each leaves us.
 *
 * Replaces a weighted average-order model with break-even sweeps across seven
 * levers. That model was correct and unusable: to know whether something was
 * fine you had to hold an order mix, a retention curve and a commission
 * structure in your head. This lists the routes instead — if they all pay, it
 * is fine; if one doesn't you can see which.
 *
 * The rare top card is marked as promotional and allowed to lose, because it is
 * meant to.
 */
function ScenarioTable({ check, title }: { check: ScenarioCheck; title: string }) {
  const tone = check.ok ? GREEN : RED
  return (
    <Card>
      <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-1">{title}</p>
      <p className="text-base font-black mb-2" style={{ color: tone, fontFamily: 'var(--font-display)' }}>
        {check.ok ? 'Every way of buying pays' : `${check.problems.length} way${check.problems.length === 1 ? '' : 's'} of buying loses money`}
      </p>
      <div className="space-y-1">
        {check.scenarios.map((s) => {
          const bad = s.keeps < 0
          const colour = bad ? (s.promotional ? AMBER : RED) : GREEN
          return (
            <div key={s.id} className="flex items-baseline justify-between gap-2 py-1.5 border-b border-[var(--color-border)] last:border-0">
              <span className="text-[11px] text-[var(--color-text-2)] min-w-0">
                {s.label}
                {s.discount > 0 && <span className="text-[var(--color-muted)]"> · {pct(s.discount)}% off</span>}
                {s.promotional && bad && <span style={{ color: AMBER }}> · meant to lose, ~1 in 21</span>}
              </span>
              <span className="text-[11px] whitespace-nowrap">
                <span className="text-[var(--color-muted)]">pays {money(s.paid)} → </span>
                <strong style={{ color: colour }}>{money(s.keeps)}</strong>
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/**
 * What we charge for everything, and what is left.
 *
 * Four columns, worst first. No margin-of-net versus margin-of-gross, no target
 * comparison, no scenario spread — just what a shopkeeper would ask for and a
 * flag when one of them is wrong.
 */
function ProductTable({ review }: { review: CatalogueReview }) {
  return (
    <div className="space-y-3">
      <Card>
        <p className="text-[11px] text-[var(--color-text-2)] leading-relaxed">
          <strong className="text-[var(--color-text)]">Every price is what we pay × {review.markupOnCost}</strong>, rounded
          down to .99. Margins assume the product sits in a box with others, because that is how the quiz sells — each
          one carries a share of a single delivery rather than a whole one.
        </p>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Headline label="Products" value={String(review.rows.length)} colour="var(--color-text)" note="priced by the rule" small />
        <Headline label="We keep, typically" value={`${pct(review.averageMargin)}%`} colour={review.averageMargin > 0.1 ? GREEN : AMBER} note="of a subscriber's price" small />
        <Headline label="Losing money" value={String(review.losing)} colour={review.losing > 0 ? RED : GREEN} note="best off subscription" small />
      </div>

      <Card>
        <div className="flex text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] pb-2 border-b border-[var(--color-border)]">
          <span className="flex-1">Product</span>
          <span className="w-20 text-right">We pay</span>
          <span className="w-20 text-right">We charge</span>
          <span className="w-24 text-right">They pay</span>
          <span className="w-20 text-right">We keep</span>
        </div>
        <div className="max-h-[28rem] overflow-y-auto">
          {review.rows.map((r) => (
            <div key={r.title} className="py-2 border-b border-[var(--color-border)] last:border-0">
              <div className="flex items-baseline text-[11px]">
                <span className="flex-1 truncate text-[var(--color-text-2)] pr-2">{r.title}</span>
                <span className="w-20 text-right text-[var(--color-muted)]">{money(r.cost)}</span>
                <span className="w-20 text-right text-[var(--color-text)]">{money(r.listPrice)}</span>
                <span className="w-24 text-right text-[var(--color-text)]">{money(r.subscriberPrice)}</span>
                <span className="w-20 text-right font-bold" style={{ color: r.viable ? GREEN : RED }}>{money(r.keeps)}</span>
              </div>
              {r.warning && <p className="text-[10px] mt-0.5" style={{ color: r.viable ? AMBER : RED }}>{r.warning}</p>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

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
