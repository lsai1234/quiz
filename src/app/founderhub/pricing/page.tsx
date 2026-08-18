'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatGBP, effectiveIntroDiscount, type PricingConfig, type DiscountTier, type DeliveryService } from '@/lib/stack-blueprint/pricing'
import { priceProduct, listPriceFor, reviewCatalogue, type CatalogueReview } from '@/lib/pricing/list-price'
import { checkScenarios, type ScenarioCheck } from '@/lib/pricing/scenarios'
import { pricingThresholds } from '@/lib/pricing/thresholds'
import { checkLadder } from '@/lib/pricing/ladder'
import { CutOffs } from '@/components/portal/pricing/CutOffs'
import { LadderPanel } from '@/components/portal/pricing/LadderPanel'
import { RateCard } from '@/components/portal/pricing/RateCard'
import { CustomerRates } from '@/components/portal/pricing/CustomerRates'
import { deriveFreeDeliveryThreshold } from '@/lib/pricing/delivery'
import { VatPanel } from '@/components/portal/pricing/VatPanel'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { Budget, StackLevel } from '@/lib/types'
import { Badge, Button, Card, Input, Select, Tabs } from '@/components/system'


const LEVELS: StackLevel[] = ['essentials', 'performance', 'complete']
const LEVEL_LABEL: Record<StackLevel, string> = {
  essentials: 'Essentials (smallest)',
  performance: 'Performance (middle)',
  complete: 'Complete (largest)',
}
const BUDGETS: Budget[] = ['under-30', '30-50', '50-80', '80-plus']

const pct = (n: number) => Math.round(n * 1000) / 10
const money = (n: number) => `£${n.toFixed(2)}`

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

  if (!draft || !cutOffs || !ladder || !typicalBox) return <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)' }}>Loading…</p>

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

  /**
   * The three views, built above the return so the tablist can own them.
   *
   * `Tabs` renders exactly one panel and gives it the id the selected tab
   * points at. That is the part three plain buttons could not do: the strip
   * used to switch a conditional further down the page with nothing tying the
   * two together, so arrow keys did nothing and a screen reader was never told
   * which view it had landed in.
   */
  const PANELS: Record<Tab, React.ReactNode> = {
    overview: (
        <div className="space-y-4">
          <CutOffs thresholds={cutOffs} introDiscount={effectiveIntroDiscount(draft)} />
          <ScenarioTable check={typicalBox} title="A typical quiz box, every way of buying it" />
          <LadderPanel check={ladder} />
        </div>
    ),
    products: (
        <div className="space-y-4">
          {products && <ProductTable review={products} />}

          <Card>
            <p style={{ fontSize: 'var(--text-micro)', textTransform: 'uppercase', fontWeight: 'var(--weight-strong)', letterSpacing: 'var(--tracking-eyebrow)', color: 'var(--ink-3)', marginBottom: 'var(--space-2)' }}>
              Price anything
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Input
                label="PowerBody charge us"
                prefix="£"
                align="right"
                type="number"
                step="0.01"
                hint="ex VAT"
                value={assetPrice}
                onChange={(e) => setAssetPrice(parseFloat(e.target.value) || 0)}
              />
              <Input
                label="In a box of"
                suffix="items"
                align="right"
                type="number"
                hint={parcelItems > 1 ? 'postage shared' : 'ships on its own'}
                value={parcelItems}
                onChange={(e) => setParcelItems(Math.max(1, Math.round(parseFloat(e.target.value) || 0)))}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Headline label="We charge" value={money(example.listPrice)} colour="var(--ink-1)" note={`${money(assetPrice)} × ${draft.listPricing.markupOnCost}`} small />
              <Headline label="A subscriber pays" value={money(example.subscriberPrice)} colour={'var(--accent)'} note="middle bundle" small />
              <Headline label="We keep" value={money(example.keeps)} colour={example.viable ? 'var(--tone-positive)' : 'var(--tone-critical)'} note={`${pct(example.marginPct)}% a month`} small />
            </div>
            {example.warning && (
              <p style={{ fontSize: 'var(--text-meta)', marginTop: 'var(--space-2)', color: 'var(--tone-attention)' }}>
                {example.warning}
              </p>
            )}
          </Card>

          <ScenarioTable check={exampleScenarios} title="…and every way that product can be bought" />
        </div>
    ),
    rules: (
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
            <div className="mt-4">
              <CustomerRates
                config={draft}
                orderValue={assetPrice * parcelItems * 2}
                onChange={(customerRates) => {
                  // The advertised threshold is derived from the ladder that
                  // actually charges, so editing one cannot leave the other
                  // promising free delivery the checkout then bills for.
                  setNested('delivery', { customerRates })
                  set({ freeDeliveryThreshold: deriveFreeDeliveryThreshold({ ...draft, delivery: { ...draft.delivery, customerRates } }) })
                }}
                onSurchargeChange={(zone2Surcharge) => setNested('delivery', { zone2Surcharge })}
              />
            </div>
            <div className="mt-3">
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

          <Section
            title="First month"
            desc={
              draft.introOffer.scratchReveal.enabled
                ? 'The offer that gets people to start. The top card is MEANT to lose money — it is rationed marketing, and only the average has to pay.'
                : 'No scratch card is running, so every first month gets the flat rate below. At 0% a partner’s code is the only extra discount on the site.'
            }
          >
            <Toggle label="Scratch-to-reveal" value={draft.introOffer.scratchReveal.enabled} onChange={(v) => setNested('introOffer', { scratchReveal: { ...draft.introOffer.scratchReveal, enabled: v } })} />
            {/* The flat rate is what takes over the instant the card is switched
                off, and it used to have no field at all — so turning the card
                off silently handed everybody whatever number was sitting behind
                it (0.5, at one point). Showing it exactly when it is in force is
                the fix. */}
            {!draft.introOffer.scratchReveal.enabled && (
              <Num label="Flat first-month discount" value={pct(draft.introOffer.firstMonthDiscount)} suffix="%" onChange={(n) => setNested('introOffer', { firstMonthDiscount: n / 100 })}
                help="In force right now, for everyone. 0% means no site-wide first-month offer at all." />
            )}
            {draft.introOffer.scratchReveal.enabled && (
              <Num label="Average we give away" value={pct(draft.introOffer.effectiveFirstMonthDiscount)} suffix="%" onChange={(n) => setNested('introOffer', { effectiveFirstMonthDiscount: n / 100 })}
                help="Cards are allocated so the average across people who actually check out lands here, whatever the mix of outcomes." />
            )}
            {draft.introOffer.scratchReveal.enabled && (
              <div className="pt-2 space-y-1.5">
                {draft.introOffer.scratchReveal.outcomes.map((o, i) => {
                  const total = draft.introOffer.scratchReveal.outcomes.reduce((s, x) => s + Math.max(0, x.weight), 0)
                  const update = (patch: Partial<typeof o>) => setNested('introOffer', {
                    scratchReveal: { ...draft.introOffer.scratchReveal, outcomes: draft.introOffer.scratchReveal.outcomes.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) },
                  })
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        label={`Card ${i + 1} discount`}
                        compact
                        align="right"
                        suffix="%"
                        className="w-20"
                        type="number"
                        value={pct(o.discount)}
                        onChange={(e) => update({ discount: (parseFloat(e.target.value) || 0) / 100 })}
                      />
                      <span style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>off, weight</span>
                      <Input
                        label={`Card ${i + 1} weight`}
                        compact
                        align="right"
                        className="w-16"
                        type="number"
                        value={o.weight}
                        onChange={(e) => update({ weight: Math.max(0, parseFloat(e.target.value) || 0) })}
                      />
                      <span className="flex-1" style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>
                        ≈ 1 in {Math.round(total / Math.max(0.0001, o.weight))}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        aria-label={`Remove card ${i + 1}`}
                        onClick={() => setNested('introOffer', { scratchReveal: { ...draft.introOffer.scratchReveal, outcomes: draft.introOffer.scratchReveal.outcomes.filter((_, idx) => idx !== i) } })}
                      />
                    </div>
                  )
                })}
                <Button
                  variant="ghost"
                  size="sm"
                  icon="plus"
                  onClick={() => setNested('introOffer', { scratchReveal: { ...draft.introOffer.scratchReveal, outcomes: [...draft.introOffer.scratchReveal.outcomes, { discount: 0.1, weight: 10 }] } })}
                >
                  Add a card
                </Button>
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
            <Num label="Their code takes off" value={pct(draft.partners.codeDiscountPct)} suffix="% off" onChange={(n) => setNested('partners', { codeDiscountPct: n / 100 })}
              help={`Off the regular price of stacks, bundles and subscriptions — replacing the bundle deal (${pct(draft.bundleTiers[0]?.discountPct ?? 0)}%) or the first month of Subscribe & Save (up to ${pct(draft.levelSubscriptionDiscount.complete)}%), not stacking on top. Below those and the code does nothing extra; well above and it costs a deep discount AND a commission.`} />
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
    ),
  }

  return (
    <div className="pb-10">
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <div>
          <h1 style={{ fontSize: 'var(--text-display)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', lineHeight: 'var(--leading-tight)', color: 'var(--ink-1)' }}>
            Pricing
          </h1>
          <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
            Every price is <strong style={{ color: 'var(--ink-1)' }}>what we pay, doubled</strong>. This page shows what that leaves us.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="ghost" size="sm" loading={saving} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={save}>
            {savedFlag && !dirty ? 'Saved' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Announced, not just coloured: the whole point of this line is that the
          numbers on screen are not the numbers customers are being charged. */}
      {dirty && (
        <p role="status" style={{ marginBottom: 'var(--space-3)' }}>
          <Badge tone="attention" icon="alert-triangle">
            Unsaved changes — the figures below already reflect them; the live site does not.
          </Badge>
        </p>
      )}

      {/* A real tablist. These were three buttons with nothing tying them to the
          panel they switch, so arrow keys did nothing and a screen reader was
          never told which view it had landed in. */}
      <Tabs
        label="Pricing views"
        value={tab}
        onChange={(id) => setTab(id as Tab)}
        className="mt-3"
        tabs={TABS.map((t) => ({
          id: t.id,
          label: t.label,
          content: (
            <>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', marginBottom: 'var(--space-4)' }}>
                {t.blurb}
              </p>
              {PANELS[t.id]}
            </>
          ),
        }))}
      />

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
  const tone = check.ok ? 'var(--tone-positive)' : 'var(--tone-critical)'
  return (
    <Card>
      <p style={{ fontSize: 'var(--text-micro)', textTransform: 'uppercase', fontWeight: 'var(--weight-strong)', letterSpacing: 'var(--tracking-eyebrow)', color: 'var(--ink-3)', marginBottom: 'var(--space-1)' }}>
        {title}
      </p>
      <p style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: tone, marginBottom: 'var(--space-2)' }}>
        {check.ok ? 'Every way of buying pays' : `${check.problems.length} way${check.problems.length === 1 ? '' : 's'} of buying loses money`}
      </p>
      <div className="space-y-1">
        {check.scenarios.map((s) => {
          const bad = s.keeps < 0
          const colour = bad ? (s.promotional ? 'var(--tone-attention)' : 'var(--tone-critical)') : 'var(--tone-positive)'
          return (
            <div
              key={s.id}
              className="flex items-baseline justify-between gap-2"
              style={{ padding: 'var(--space-2) 0', borderBottom: '1px solid var(--edge)', fontSize: 'var(--text-meta)' }}
            >
              <span className="min-w-0" style={{ color: 'var(--ink-2)' }}>
                {s.label}
                {s.discount > 0 && <span style={{ color: 'var(--ink-3)' }}> · {pct(s.discount)}% off</span>}
                {s.promotional && bad && <span style={{ color: 'var(--tone-attention)' }}> · meant to lose, ~1 in 21</span>}
              </span>
              <span className="whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: 'var(--ink-3)' }}>pays {money(s.paid)} → </span>
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
        <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-2)' }}>
          <strong style={{ color: 'var(--ink-1)' }}>Every price is what we pay × {review.markupOnCost}</strong>, rounded
          down to .99. Margins assume the product sits in a box with others, because that is how the quiz sells — each
          one carries a share of a single delivery rather than a whole one.
        </p>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Headline label="Products" value={String(review.rows.length)} colour="var(--ink-1)" note="priced by the rule" small />
        <Headline label="We keep, typically" value={`${pct(review.averageMargin)}%`} colour={review.averageMargin > 0.1 ? 'var(--tone-positive)' : 'var(--tone-attention)'} note="of a subscriber's price" small />
        <Headline label="Losing money" value={String(review.losing)} colour={review.losing > 0 ? 'var(--tone-critical)' : 'var(--tone-positive)'} note="best off subscription" small />
      </div>

      <Card>
        <div
          className="flex"
          style={{
            fontSize: 'var(--text-micro)',
            textTransform: 'uppercase',
            fontWeight: 'var(--weight-strong)',
            letterSpacing: 'var(--tracking-eyebrow)',
            color: 'var(--ink-3)',
            paddingBottom: 'var(--space-2)',
            borderBottom: '1px solid var(--edge)',
          }}
        >
          <span className="flex-1">Product</span>
          <span className="w-20 text-right">We pay</span>
          <span className="w-20 text-right">We charge</span>
          <span className="w-24 text-right">They pay</span>
          <span className="w-20 text-right">We keep</span>
        </div>
        <div className="max-h-[28rem] overflow-y-auto">
          {review.rows.map((r) => (
            <div key={r.title} style={{ padding: 'var(--space-2) 0', borderBottom: '1px solid var(--edge)' }}>
              <div
                className="flex items-baseline"
                style={{ fontSize: 'var(--text-meta)', fontVariantNumeric: 'tabular-nums' }}
              >
                <span className="flex-1 truncate" style={{ color: 'var(--ink-2)', paddingRight: 'var(--space-2)' }}>
                  {r.title}
                </span>
                <span className="w-20 text-right" style={{ color: 'var(--ink-3)' }}>{money(r.cost)}</span>
                <span className="w-20 text-right" style={{ color: 'var(--ink-1)' }}>{money(r.listPrice)}</span>
                <span className="w-24 text-right" style={{ color: 'var(--ink-1)' }}>{money(r.subscriberPrice)}</span>
                <span
                  className="w-20 text-right"
                  style={{ fontWeight: 'var(--weight-strong)', color: r.viable ? 'var(--tone-positive)' : 'var(--tone-critical)' }}
                >
                  {money(r.keeps)}
                </span>
              </div>
              {r.warning && (
                <p style={{ fontSize: 'var(--text-micro)', marginTop: 'var(--space-1)', color: r.viable ? 'var(--tone-attention)' : 'var(--tone-critical)' }}>
                  {r.warning}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function Headline({ label, value, note, colour, small }: { label: string; value: string; note?: string; colour: string; small?: boolean }) {
  return (
    <Card elevation={2} padding="tight" className="text-center">
      <p style={{ fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-strong)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-eyebrow)', color: 'var(--ink-3)' }}>
        {label}
      </p>
      <p
        style={{
          fontSize: small ? 'var(--text-title)' : 'var(--text-display)',
          fontWeight: 'var(--weight-display)',
          fontFamily: 'var(--font-display)',
          // A column of figures that changes width as the numbers change is a
          // column you re-read every time.
          fontVariantNumeric: 'tabular-nums',
          color: colour,
          margin: 'var(--space-1) 0',
        }}
      >
        {value}
      </p>
      {note && (
        <p style={{ fontSize: 'var(--text-micro)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' }}>{note}</p>
      )}
    </Card>
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
      {tiers.length === 0 && <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>None set.</p>}
      {tiers.map((t, i) => (
        <div key={t.id} className="flex items-center gap-2">
          <Input
            label={`Tier ${i + 1} name`}
            compact
            className="flex-1 min-w-0"
            value={t.label}
            onChange={(e) => onChange(i, { label: e.target.value })}
          />
          <span style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>spend</span>
          <Input
            label={`Tier ${i + 1} minimum spend`}
            compact
            align="right"
            prefix="£"
            className="w-20"
            type="number"
            value={t.minSubtotal ?? 0}
            onChange={(e) => onChange(i, { minSubtotal: parseFloat(e.target.value) })}
          />
          <Input
            label={`Tier ${i + 1} discount`}
            compact
            align="right"
            suffix="%"
            className="w-20"
            type="number"
            value={pct(t.discountPct)}
            onChange={(e) => onChange(i, { discountPct: parseFloat(e.target.value) / 100 })}
          />
          <span style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>off</span>
          <Button variant="ghost" size="sm" icon="trash" aria-label={`Remove tier ${i + 1}`} onClick={() => onRemove(i)} />
        </div>
      ))}
      <Button variant="ghost" size="sm" icon="plus" onClick={onAdd}>
        Add a tier
      </Button>
    </div>
  )
}

/**
 * One setting: what it is on the left, the control on the right, and what it
 * does underneath.
 *
 * Layout only — it draws no label of its own. The control inside is a compact
 * field, which takes its accessible name from the same string this row shows,
 * so the row reads as one thing and a screen reader still hears the name.
 */
function SettingRow({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 'var(--space-3) 0', borderBottom: '1px solid var(--edge)' }}>
      <div className="flex items-center justify-between gap-3">
        <span style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
          {label}
        </span>
        <span className="flex items-center gap-2 shrink-0">{children}</span>
      </div>
      {help && (
        <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-1)' }}>
          {help}
        </p>
      )}
    </div>
  )
}

function Num({ label, value, onChange, suffix, help }: { label: string; value: number; onChange: (n: number) => void; suffix?: string; help?: string }) {
  return (
    <SettingRow label={label} help={help}>
      <Input
        label={label}
        compact
        align="right"
        className="w-24"
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
      {suffix && (
        <span className="w-16" style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }} aria-hidden>
          {suffix}
        </span>
      )}
    </SettingRow>
  )
}

/**
 * An on/off setting.
 *
 * A button with `aria-pressed` rather than a `Checkbox`, because the row already
 * shows the name to the left of it: a checkbox would draw that name a second
 * time, or lose the layout that makes 30 settings readable in a column.
 */
function Toggle({ label, value, onChange, help }: { label: string; value: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <SettingRow label={label} help={help}>
      <Button
        size="sm"
        variant={value ? 'primary' : 'secondary'}
        aria-label={label}
        aria-pressed={value}
        onClick={() => onChange(!value)}
      >
        {value ? 'On' : 'Off'}
      </Button>
    </SettingRow>
  )
}

function Choice({ label, value, options, onChange, help }: { label: string; value: string; options: { v: string; l: string }[]; onChange: (v: string) => void; help?: string }) {
  return (
    <SettingRow label={label} help={help}>
      <Select label={label} compact value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </Select>
    </SettingRow>
  )
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card as="section" className="mb-4">
      <p style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}>
        {title}
      </p>
      {desc && (
        <p style={{ fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)', marginTop: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
          {desc}
        </p>
      )}
      <div>{children}</div>
    </Card>
  )
}
