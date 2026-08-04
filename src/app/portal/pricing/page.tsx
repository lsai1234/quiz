'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import {
  calculatePricing,
  formatGBP,
  type PricingConfig,
  type DiscountTier,
} from '@/lib/stack-blueprint/pricing'
import { goodPriceFor, auditProductPrice, worstCaseSubscriptionRate } from '@/lib/pricing/good-price'
import { quoteDelivery } from '@/lib/pricing/delivery'
import type { StackBlueprint } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers, Budget, StackLevel } from '@/lib/types'
import { defaultAnswers } from '@/lib/store'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'
const RED = '#f87171'

const sample = (over: Partial<QuizAnswers>): QuizAnswers => ({ ...defaultAnswers, ...over })
const SAMPLES: { name: string; answers: QuizAnswers }[] = [
  { name: 'Performance stack', answers: sample({ goals: ['muscle', 'energy'], trainingFrequency: '3-4x', budget: '50-80', track: 'performance' }) },
  { name: 'Wellbeing stack', answers: sample({ goals: ['sleep-better', 'less-stress'], trainingFrequency: '1-2x', budget: '30-50', track: 'wellbeing' }) },
]

const LEVELS: StackLevel[] = ['essentials', 'performance', 'complete']
const LEVEL_LABEL: Record<StackLevel, string> = {
  essentials: 'Essentials (smallest)',
  performance: 'Performance (middle)',
  complete: 'Complete (largest)',
}
const BUDGETS: Budget[] = ['under-30', '30-50', '50-80', '80-plus']

function pct(n: number) { return Math.round(n * 1000) / 10 }

// A one-product subscription, so we can check each product's profitability in isolation.
function single(p: CatalogueProduct): StackBlueprint {
  const v = p.variants.find((x) => x.available) ?? p.variants[0]
  return {
    id: 'preview', stackName: '', summary: '', primaryGoal: p.goals[0] ?? 'health', secondaryGoals: [], userProfileSummary: '',
    slots: [{ slotId: 's', slotType: p.stackSlots[0] ?? 'health', title: '', description: '', recommendedProductId: p.id, selectedProductId: p.id, selectedVariantId: v?.id ?? null, required: true, canRemove: false, canSwap: true, swapGroup: p.swapGroup, reason: '', confidenceScore: 80, displayOrder: 0 }],
    estimatedOneOffPrice: 0, estimatedSubscriptionPrice: 0, savingsSummary: '', createdAt: '',
  }
}

export default function PricingPage() {
  const [draft, setDraft] = useState<PricingConfig | null>(null)
  const [catalogue, setCatalogue] = useState<CatalogueProduct[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [assetPrice, setAssetPrice] = useState(10)
  const [shipEvery, setShipEvery] = useState(1)
  const [showAudit, setShowAudit] = useState(false)

  useEffect(() => {
    fetch('/api/portal/pricing').then((r) => r.json()).then((d) => setDraft(d.current)).catch(() => {})
    fetch('/api/catalogue').then((r) => r.json()).then((d) => setCatalogue(d.products ?? [])).catch(() => {})
  }, [])

  // Rigorous profitability: check EVERY subscribable product on its own. If each
  // one profits even on the earliest cancel, then any bundle of them does too.
  const profit = useMemo(() => {
    if (!draft || catalogue.length === 0) return null
    const subs = catalogue.filter((p) => p.subscriptionEligible && !p.isSubscriptionOnly)
    const offenders: string[] = []
    for (const p of subs) {
      try {
        if (!calculatePricing(single(p), [p], undefined, draft).subscriptionProfitableOnCancel) offenders.push(p.title)
      } catch { /* skip */ }
    }
    return { total: subs.length, offenders }
  }, [draft, catalogue])

  const examples = useMemo(() => {
    if (!draft || catalogue.length === 0) return []
    return SAMPLES.flatMap((s) => {
      try {
        return [{ name: s.name, p: calculatePricing(buildStackBlueprint(s.answers, catalogue), catalogue, s.answers, draft) }]
      } catch { return [] }
    })
  }, [draft, catalogue])

  // ── The Good-price model, live against the unsaved draft ──
  const good = useMemo(
    () => (draft ? goodPriceFor({ assetPrice, shipEveryMonths: shipEvery }, draft) : null),
    [draft, assetPrice, shipEvery],
  )

  const audit = useMemo(() => {
    if (!draft || catalogue.length === 0) return null
    const rows = catalogue.map((p) => auditProductPrice(p, draft))
    return {
      rows: [...rows].sort((a, b) => (a.atListPrice?.marginPct ?? 0) - (b.atListPrice?.marginPct ?? 0)),
      losing: rows.filter((r) => r.atListPrice && !r.atListPrice.profitable).length,
      belowTarget: rows.filter((r) => r.atListPrice?.profitable && !r.atListPrice.meetsTarget).length,
    }
  }, [draft, catalogue])

  if (!draft) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

  const set = (patch: Partial<PricingConfig>) => { setDraft({ ...draft, ...patch }); setSaved(false) }
  const setDelivery = (patch: Partial<PricingConfig['delivery']>) => set({ delivery: { ...draft.delivery, ...patch } })
  const setGoodPricing = (patch: Partial<PricingConfig['goodPricing']>) => set({ goodPricing: { ...draft.goodPricing, ...patch } })
  const setIntro = (patch: Partial<PricingConfig['introOffer']>) => set({ introOffer: { ...draft.introOffer, ...patch } })
  const setScratch = (patch: Partial<PricingConfig['introOffer']['scratchReveal']>) =>
    setIntro({ scratchReveal: { ...draft.introOffer.scratchReveal, ...patch } })
  const setTier = (key: 'bundleTiers' | 'subscriptionTiers', i: number, patch: Partial<DiscountTier>) =>
    set({ [key]: draft[key].map((t, idx) => (idx === i ? { ...t, ...patch } : t)) })
  const addTier = (key: 'bundleTiers' | 'subscriptionTiers') =>
    set({ [key]: [...draft[key], { id: `tier-${Date.now()}`, label: 'New tier', minSubtotal: 0, discountPct: 0.05 }] })
  const removeTier = (key: 'bundleTiers' | 'subscriptionTiers', i: number) =>
    set({ [key]: draft[key].filter((_, idx) => idx !== i) })

  async function save() {
    setSaving(true)
    await fetch('/api/portal/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overrides: draft }) })
    setSaving(false); setSaved(true)
  }
  async function reset() {
    setSaving(true)
    const r = await fetch('/api/portal/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }) })
    setDraft((await r.json()).current); setSaving(false); setSaved(true)
  }

  const safe = profit && profit.offenders.length === 0
  const parcel = quoteDelivery({ units: 1, goodsValue: assetPrice, orderValue: good?.goodPriceMonthlyNet ?? 0 }, draft)
  const scratchWeight = draft.introOffer.scratchReveal.outcomes.reduce((s, x) => s + x.weight, 0) || 1

  return (
    <div className="pb-10">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Pricing rules</h1>
        <div className="flex gap-2">
          <button onClick={reset} disabled={saving} className="text-xs font-semibold px-3 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)]">Reset</button>
          <button onClick={save} disabled={saving} className="text-xs font-bold px-4 py-2 rounded-xl bg-[var(--color-accent)] text-[var(--color-bg)]" style={{ fontFamily: 'var(--font-display)' }}>{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}</button>
        </div>
      </div>
      <p className="text-sm text-[var(--color-muted)] mb-5">
        Every rule that decides a price lives on this page. Edits apply everywhere — quiz, shop, hub and Stripe — the moment you save.
      </p>

      {/* ── The Good price ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border p-5 mb-4" style={{ background: 'var(--color-surface)', borderColor: `color-mix(in srgb, ${ACCENT} 35%, transparent)` }}>
        <p className="text-sm font-black mb-1" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>Good price</p>
        <p className="text-xs leading-relaxed text-[var(--color-text-2)] mb-3">
          Put in what the supplier charges us and this works out what to sell it for — priced for the
          <strong style={{ color: 'var(--color-text)' }}> worst case</strong>, not the average one: the member lands on the
          biggest bundle (the deepest {pct(worstCaseSubscriptionRate(draft))}% subscribe-&amp;-save we offer), takes the average
          first-month discount, cancels the moment they can, and we carry the postage.
          Make money there and you make money everywhere.
        </p>

        <div className="flex flex-wrap gap-3 mb-4">
          <label className="flex-1 min-w-[130px]">
            <span className="text-[10px] uppercase font-bold text-[var(--color-muted)] block mb-1">Asset price (what we pay)</span>
            <input type="number" step="0.01" value={assetPrice} onChange={(e) => setAssetPrice(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          </label>
          <label className="flex-1 min-w-[130px]">
            <span className="text-[10px] uppercase font-bold text-[var(--color-muted)] block mb-1">Ships every (months)</span>
            <input type="number" min={1} value={shipEvery} onChange={(e) => setShipEvery(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          </label>
        </div>

        {good && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Stat label="Sell it for" value={formatGBP(good.goodPrice)} colour={ACCENT}
                note={`${pct(draft.goodPricing.targetMarginPct)}% margin on the worst case`} />
              <Stat label="Break even at" value={formatGBP(good.breakEvenPrice)} colour={AMBER}
                note="below this the worst case loses money" />
            </div>
            <div className="rounded-xl p-3 text-[11px] leading-relaxed" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
              <Working label="Goods, per month" value={formatGBP(good.landedCost.goods)} />
              <Working label="Delivery we pay the supplier, per month" value={formatGBP(good.landedCost.delivery)} />
              <Working label={`Total cost over ${good.assumptions.horizonMonths} month${good.assumptions.horizonMonths === 1 ? '' : 's'}`} value={formatGBP(good.horizonCost)} strong />
              <Working label="Deepest subscribe-&-save (largest bundle)" value={`−${pct(good.assumptions.subscriptionDiscount)}%`} />
              <Working label="Average first-month discount" value={`−${pct(good.assumptions.firstMonthDiscount)}%`} />
              <Working label="Delivery we collect" value={good.assumptions.absorbsDelivery ? 'nothing — we absorb it' : formatGBP(good.horizonDeliveryCollected)} />
              <Working label="Member pays each month at that price" value={formatGBP(good.goodPriceMonthlyNet)} strong />
              <Working label="Member pays for delivery" value={good.goodPriceDeliveryCharge === 0 ? 'free' : formatGBP(good.goodPriceDeliveryCharge)} />
              <Working label="Parcels per shipment · what postage costs us" value={`${parcel.parcels} · ${formatGBP(parcel.supplierCost)}`} />
            </div>
          </>
        )}

        {/* The same model, run over everything we already sell. */}
        {audit && (
          <div className="mt-3">
            <button onClick={() => setShowAudit((s) => !s)} className="text-xs font-bold text-left" style={{ color: ACCENT }}>
              {showAudit ? 'Hide' : 'Check'} every product against this model
              {audit.losing > 0 && <span style={{ color: RED }}> · {audit.losing} losing money</span>}
              {audit.belowTarget > 0 && <span style={{ color: AMBER }}> · {audit.belowTarget} under target</span>}
            </button>
            {showAudit && (
              <div className="mt-2 space-y-1 max-h-80 overflow-y-auto">
                {audit.rows.map((r) => {
                  const v = r.atListPrice
                  if (!v) return null
                  const colour = !v.profitable ? RED : !v.meetsTarget ? AMBER : GREEN
                  return (
                    <div key={r.title} className="flex items-baseline justify-between gap-2 text-[11px] py-1 border-b border-[var(--color-border)] last:border-0">
                      <span className="text-[var(--color-text-2)] truncate">
                        {r.title}
                        {r.costEstimated && <span className="text-[var(--color-muted)]"> · cost estimated</span>}
                      </span>
                      <span className="whitespace-nowrap flex-shrink-0" style={{ color: colour }}>
                        {formatGBP(v.listPrice)} → {pct(v.marginPct)}% · good price {formatGBP(r.goodPrice)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Profitability — the discount engine's own check on the live catalogue */}
      {profit && (
        <div className="rounded-2xl border p-5 mb-4" style={{ background: `color-mix(in srgb, ${safe ? GREEN : RED} 7%, transparent)`, borderColor: `color-mix(in srgb, ${safe ? GREEN : RED} 35%, transparent)` }}>
          <p className="text-sm font-black mb-1" style={{ color: safe ? GREEN : RED, fontFamily: 'var(--font-display)' }}>
            {safe ? '✓ Every product stays profitable' : `✗ ${profit.offenders.length} product${profit.offenders.length === 1 ? '' : 's'} would lose money`}
          </p>
          <p className="text-xs leading-relaxed text-[var(--color-text-2)]">
            {safe
              ? `All ${profit.total} subscribable products make a profit even if a customer cancels the moment their minimum term ends. Because every product is profitable on its own, any bundle of them is profitable too.`
              : 'These lose money if a customer takes the intro offer and cancels at the earliest point — raise the minimum term, lower the first-month offer, or set accurate costs:'}
          </p>
          {!safe && (
            <ul className="mt-2 space-y-0.5">
              {profit.offenders.map((t) => <li key={t} className="text-xs font-semibold" style={{ color: RED }}>• {t}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Example prices */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 mb-5">
        <p className="text-[10px] font-bold tracking-widest uppercase mb-2 text-[var(--color-muted)]">What customers would pay</p>
        <div className="space-y-2">
          {examples.map((e) => (
            <div key={e.name} className="text-xs flex items-baseline justify-between gap-2">
              <span className="font-bold text-[var(--color-text)]">{e.name}</span>
              <span className="text-[var(--color-text-2)] text-right">
                <strong style={{ color: ACCENT }}>{formatGBP(e.p.subscriptionTotal)}/mo</strong> on subscription (1st month {formatGBP(e.p.subscriptionFirstMonth)}) · {formatGBP(e.p.oneOffTotal)} one-off
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Subscription offer ─────────────────────────────────────────────── */}
      <Section title="Subscription offer" desc="What customers get for subscribing.">
        <Num label="Subscribe & save (base)" value={pct(draft.subscriptionDiscount)} suffix="%" help="The fallback ongoing discount, used for anything without a bundle rate below." onChange={(n) => set({ subscriptionDiscount: n / 100 })} />
        {LEVELS.map((lvl) => (
          <Num key={lvl} label={`${LEVEL_LABEL[lvl]} bundle rate`} value={pct(draft.levelSubscriptionDiscount[lvl])} suffix="%"
            help={lvl === 'complete' ? 'The deepest rate on offer — the one the Good-price model prices against.' : undefined}
            onChange={(n) => set({ levelSubscriptionDiscount: { ...draft.levelSubscriptionDiscount, [lvl]: n / 100 } })} />
        ))}
        <Num label="Minimum commitment" value={draft.minSubscriptionMonths} suffix="mo" help="Months of revenue a price is judged over. It no longer stops anyone cancelling — the pay-for-what-shipped settlement does that." onChange={(n) => set({ minSubscriptionMonths: n })} />
        <Num label="Minimum to subscribe" value={draft.minSubscriptionMonthly} suffix="£/mo" help="Smallest monthly value we’ll start a subscription for." onChange={(n) => set({ minSubscriptionMonthly: n })} />
        <Num label="Servings before a refill SKU" value={draft.maxSubscriptionServings} suffix="srv" help="Products with more servings than this are candidates for a smaller monthly refill." onChange={(n) => set({ maxSubscriptionServings: n })} />
        <Text label="Plan name on the saving line" value={draft.subscriptionPlanLabel} onChange={(v) => set({ subscriptionPlanLabel: v })} />
      </Section>

      {/* ── First month ────────────────────────────────────────────────────── */}
      <Section title="First month" desc="The offer that gets people to start — and what it really costs us.">
        <Num label="Flat first-month offer" value={pct(draft.introOffer.firstMonthDiscount)} suffix="%" help="Used when the scratch card below is switched off." onChange={(n) => setIntro({ firstMonthDiscount: n / 100 })} />
        <Num label="Average first-month discount" value={pct(draft.introOffer.effectiveFirstMonthDiscount)} suffix="%" help="What the first month costs you on average, across people who actually subscribe. Scratch cards are rationed to hit this: raise it and more members win 50%, lower it and 50% gets rare. This is the number the Good-price model uses." onChange={(n) => setIntro({ effectiveFirstMonthDiscount: n / 100 })} />
        <Toggle label="Scratch-to-reveal card" value={draft.introOffer.scratchReveal.enabled} help="Off = everyone simply gets the flat offer above." onChange={(v) => setScratch({ enabled: v })} />
        {draft.introOffer.scratchReveal.enabled && (
          <div className="pt-2 space-y-2">
            <p className="text-[11px] text-[var(--color-muted)]">The possible cards and their relative odds. Chance of one = its weight ÷ the total.</p>
            {draft.introOffer.scratchReveal.outcomes.map((o, i) => {
              const update = (patch: Partial<typeof o>) =>
                setScratch({ outcomes: draft.introOffer.scratchReveal.outcomes.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) })
              return (
                <div key={i} className="flex items-center gap-2">
                  <input type="number" value={pct(o.discount)} onChange={(e) => update({ discount: (parseFloat(e.target.value) || 0) / 100 })}
                    className="w-16 px-2 py-1.5 rounded-lg text-xs text-right outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
                  <span className="text-[11px] text-[var(--color-muted)]">% off · weight</span>
                  <input type="number" value={o.weight} onChange={(e) => update({ weight: Math.max(0, parseFloat(e.target.value) || 0) })}
                    className="w-14 px-2 py-1.5 rounded-lg text-xs text-right outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
                  <span className="text-[11px] text-[var(--color-muted)] flex-1">≈ 1 in {Math.round(scratchWeight / Math.max(0.0001, o.weight))}</span>
                  <button onClick={() => setScratch({ outcomes: draft.introOffer.scratchReveal.outcomes.filter((_, idx) => idx !== i) })} className="text-[var(--color-muted)] text-sm px-1">✕</button>
                </div>
              )
            })}
            <button onClick={() => setScratch({ outcomes: [...draft.introOffer.scratchReveal.outcomes, { discount: 0.1, weight: 10 }] })} className="text-xs font-bold" style={{ color: ACCENT }}>+ Add a card</button>
          </div>
        )}
      </Section>

      {/* ── Delivery ───────────────────────────────────────────────────────── */}
      <Section title="Delivery" desc="What postage costs us and what we charge for it. Placeholder rates until the PowerBody contract is signed — the Good-price model reads them straight from here, so swapping the real numbers in reprices everything.">
        <Num label="Supplier cost per parcel" value={draft.delivery.supplierParcelCost} suffix="£" help="What the supplier charges us to send one parcel to a member." onChange={(n) => setDelivery({ supplierParcelCost: n })} />
        <Num label="Supplier cost per unit" value={draft.delivery.supplierPerUnitCost} suffix="£" help="Extra per item inside a parcel — weight-driven handling." onChange={(n) => setDelivery({ supplierPerUnitCost: n })} />
        <Num label="Units per parcel" value={draft.delivery.unitsPerParcel} suffix="units" help="Above this a shipment splits into a second parcel and costs us twice." onChange={(n) => setDelivery({ unitsPerParcel: n })} />
        <Num label="Supplier ships free above" value={draft.delivery.supplierFreeParcelThreshold} suffix="£" help="Goods value in one shipment at or above which the supplier drops the charge. 0 = they always charge." onChange={(n) => setDelivery({ supplierFreeParcelThreshold: n })} />
        <Num label="We charge the member" value={draft.delivery.customerDeliveryCharge} suffix="£" help="Delivery charged on orders below the free threshold." onChange={(n) => setDelivery({ customerDeliveryCharge: n })} />
        <Num label="Free delivery above" value={draft.freeDeliveryThreshold} suffix="£" help="Order total at or above which the member pays nothing. 0 turns the free-delivery messaging off entirely." onChange={(n) => set({ freeDeliveryThreshold: n })} />
        <Num label="Longest gap between deliveries" value={draft.maxDeliveryMonths} suffix="mo" help="We’ll never wait longer than this to ship a product, however big the tub." onChange={(n) => set({ maxDeliveryMonths: n })} />
      </Section>

      {/* ── Profit guardrails ──────────────────────────────────────────────── */}
      <Section title="Profit guardrails" desc="Safety limits so discounts never lose money.">
        <Num label="Good-price target margin" value={pct(draft.goodPricing.targetMarginPct)} suffix="%" help="The profit share of revenue the Good price aims for on the worst case. A margin (profit ÷ revenue), unlike the floor below." onChange={(n) => setGoodPricing({ targetMarginPct: n / 100 })} />
        <Num label="Judge prices over" value={draft.goodPricing.horizonMonths ?? 0} suffix="mo" help="Months of revenue the Good-price model looks at. 0 = use the minimum commitment, which is the true worst case." onChange={(n) => setGoodPricing({ horizonMonths: n > 0 ? n : null })} />
        <Toggle label="Assume we absorb delivery" value={draft.goodPricing.assumeFreeDelivery} help="On is the honest worst case — a subscription that clears the free-delivery threshold pays us nothing for postage." onChange={(v) => setGoodPricing({ assumeFreeDelivery: v })} />
        <Num label="Never sell below this profit" value={pct(draft.marginFloorPct)} suffix="%" help="A product is never discounted below this markup over its cost. Floors the discount engine line by line." onChange={(n) => set({ marginFloorPct: n / 100 })} />
        <Num label="Assumed cost (if not set)" value={pct(draft.defaultCostRatio)} suffix="%" help="When a product has no cost entered, assume it costs this share of its price." onChange={(n) => set({ defaultCostRatio: n / 100 })} />
      </Section>

      {/* ── Bundle discounts ───────────────────────────────────────────────── */}
      <Section title="One-off bundle discounts" desc="Spend more in a single order, save more. The best-qualifying tier applies.">
        <TierEditor tiers={draft.bundleTiers} onChange={(i, p) => setTier('bundleTiers', i, p)} onAdd={() => addTier('bundleTiers')} onRemove={(i) => removeTier('bundleTiers', i)} />
      </Section>

      <Section title="Extra subscription discounts" desc="On top of the bundle rate, for bigger monthly plans. The best-qualifying tier wins — and if one beats the largest bundle, it becomes the worst case the Good price is built on.">
        <TierEditor tiers={draft.subscriptionTiers} onChange={(i, p) => setTier('subscriptionTiers', i, p)} onAdd={() => addTier('subscriptionTiers')} onRemove={(i) => removeTier('subscriptionTiers', i)} />
      </Section>

      {/* ── Budget caps ────────────────────────────────────────────────────── */}
      <Section title="Budget ceilings" desc="The most a built stack may cost for each budget answer. The quiz never goes over these.">
        {BUDGETS.map((b) => (
          <Num key={b} label={b.replace('under-', 'Under £').replace('80-plus', '£80+').replace(/^(\d+)-(\d+)$/, '£$1 – £$2')} value={draft.budgetCaps[b] ?? 0} suffix="£"
            help={b === '80-plus' ? '0 = no ceiling (the open-ended top tier).' : undefined}
            onChange={(n) => set({ budgetCaps: { ...draft.budgetCaps, [b]: n > 0 ? n : null } })} />
        ))}
      </Section>

      {/* ── Product changes ────────────────────────────────────────────────── */}
      <Section title="When a product changes" desc="What happens to a live subscription when the supplier drops a product or moves its price.">
        <Choice label="Default when a product goes away" value={draft.defaultChangePolicy}
          options={[{ v: 'auto-swap', l: 'Swap for the closest equivalent' }, { v: 'remove', l: 'Take it off the plan' }]}
          help="What a member gets if they never picked. They can always change it in their hub."
          onChange={(v) => set({ defaultChangePolicy: v as PricingConfig['defaultChangePolicy'] })} />
        <Num label="Replacement price tolerance" value={pct(draft.substitutionPriceTolerancePct)} suffix="%" help="How far a replacement’s price may sit from the original’s and still count as equivalent. A swap never raises what the member pays, so this bounds what we absorb." onChange={(n) => set({ substitutionPriceTolerancePct: n / 100 })} />
        <Num label="Supplier price move that matters" value={pct(draft.priceChangeThresholdPct)} suffix="%" help="Anything smaller is noise and raises nothing." onChange={(n) => set({ priceChangeThresholdPct: n / 100 })} />
        <Num label="Notice before a rise can bill" value={draft.priceChangeNoticeDays} suffix="days" help="UK subscription rules require clear advance notice and a free exit." onChange={(n) => set({ priceChangeNoticeDays: n })} />
        <Num label="Missed syncs before discontinued" value={draft.discontinuedAfterMissedSyncs} suffix="syncs" help="How many syncs a SKU must be absent from the feed before it counts as gone rather than out of stock." onChange={(n) => set({ discontinuedAfterMissedSyncs: n })} />
        <Num label="Your window to overrule" value={draft.founderReviewHours} suffix="hrs" help="How long you get before the member’s own policy applies anyway. 0 = apply immediately." onChange={(n) => set({ founderReviewHours: n })} />
      </Section>

      {/* Hub flexibility guards — read-only explainer */}
      <Section title="Hub flexibility — how it stays safe" desc="What happens when a member adds, removes, skips or expedites in the hub.">
        <ul className="text-xs text-[var(--color-text-2)] leading-relaxed list-disc pl-4 space-y-1.5">
          <li><span className="font-semibold text-[var(--color-text)]">Adding</span> prices the new item at the subscribe-&amp;-save rate (above the profit floor) — the intro offer is never re-applied.</li>
          <li><span className="font-semibold text-[var(--color-text)]">Removing</span> is free before anything ships; once a box has gone out, a one-off settlement recovers the value already sent that the member hasn’t paid off (pay-for-what-shipped). They can’t take a tub cheap and cancel.</li>
          <li><span className="font-semibold text-[var(--color-text)]">Shipping more/less often</span> just changes frequency — the per-unit price (and its profit floor) never moves.</li>
          <li><span className="font-semibold text-[var(--color-text)]">“Get one now”</span> is charged in full up front; skipping a box credits its value so nobody pays for a box they didn’t get.</li>
        </ul>
      </Section>
    </div>
  )
}

// ─── Building blocks ──────────────────────────────────────────────────────────

function Stat({ label, value, note, colour }: { label: string; value: string; note?: string; colour: string }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
      <p className="text-[10px] uppercase font-bold text-[var(--color-muted)]">{label}</p>
      <p className="text-xl font-black my-0.5" style={{ color: colour, fontFamily: 'var(--font-display)' }}>{value}</p>
      {note && <p className="text-[10px] text-[var(--color-muted)] leading-snug">{note}</p>}
    </div>
  )
}

function Working({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className={strong ? 'text-[var(--color-text)] font-semibold' : 'text-[var(--color-muted)]'}>{label}</span>
      <span className={strong ? 'text-[var(--color-text)] font-bold whitespace-nowrap' : 'text-[var(--color-text-2)] whitespace-nowrap'}>{value}</span>
    </div>
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
          <input value={t.label} onChange={(e) => onChange(i, { label: e.target.value })} className="flex-1 min-w-0 px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          <span className="text-[11px] text-[var(--color-muted)]">spend £</span>
          <input type="number" value={t.minSubtotal ?? 0} onChange={(e) => onChange(i, { minSubtotal: parseFloat(e.target.value) })} className="w-14 px-2 py-1.5 rounded-lg text-xs text-right outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          <input type="number" value={pct(t.discountPct)} onChange={(e) => onChange(i, { discountPct: parseFloat(e.target.value) / 100 })} className="w-12 px-2 py-1.5 rounded-lg text-xs text-right outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
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
      <input type="number" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-20 px-2 py-1.5 rounded-lg text-sm text-right outline-none"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
      {suffix && <span className="text-[11px] text-[var(--color-muted)] w-10">{suffix}</span>}
    </Field>
  )
}

function Text({ label, value, onChange, help }: { label: string; value: string; onChange: (v: string) => void; help?: string }) {
  return (
    <Field label={label} help={help}>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="w-52 px-2 py-1.5 rounded-lg text-sm outline-none"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
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
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 rounded-lg text-xs outline-none"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
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
