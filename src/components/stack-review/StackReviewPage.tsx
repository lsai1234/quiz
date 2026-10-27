'use client'

import { Icon } from '@/components/ui/Icon'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuizStore } from '@/lib/store'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint'
import {
  updateStackSlotVariant,
  updateStackSlotProduct,
  getSwappableProductsForSlot,
  addBoosterSlot,
  removeOptionalSlot,
} from '@/lib/stack-blueprint/helpers'
import { calculatePricing, buildSubscriptionPlan, formatGBP, getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { planTiers, tierPlanFor, type TierPlan } from '@/lib/stack-blueprint/tier-plan'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { SLOT_LABELS } from '@/lib/catalogue/types'
import { inStockOnly } from '@/lib/catalogue/filters'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { useStackCheckout } from '@/hooks/useStackCheckout'
import { StackHero } from './StackHero'
import { StackDeck } from './StackDeck'
import { YouScene, type YouSceneItem } from './YouScene'
import { explainProductSafe, whatWeChecked, type ProductExplanation } from '@/lib/results'
import { CLAIMS } from '@/lib/consult/claims'
import { CONSULT_TIER_LABEL, consultTierPlans } from '@/lib/consult/tiers'
import type { SlotType } from '@/lib/stack-blueprint/factory'
import { PlanReceipt } from './PlanReceipt'
import { SubscriptionProtocol } from './SubscriptionProtocol'
import { ScratchToReveal, scratchRevealAvailable } from './ScratchToReveal'
import { PartnerCodeBox, checkDiscountCode, forgetReferral, type AppliedCode } from '@/components/checkout/PartnerCodeBox'
import { CheckoutPromo, type Promo } from './CheckoutPromo'
import { CoreOfferCard } from './CoreOfferCard'
import { BonusNote } from './BonusNote'
import { useOfferSettings } from '@/hooks/useOfferSettings'
import { useOfferCheckout } from '@/hooks/useOfferCheckout'
import { quizPerson, withHeroFirst } from '@/lib/stack-blueprint/offer'
import { chooseHero, heroReason, personFromSnapshot, type OfferInputs, type PersonFit } from '@/lib/offer/select'
import { bonusLineFor, bonusWorth, codeOrBonus, coreOffer, dealPerson, tierBonuses, tierDelivered, titleOf } from '@/lib/offer/results'
import { OFFER_COPY } from '@/lib/offer/copy'
import { LAST_CHANCE_USED_KEY } from '@/lib/last-chance/source'
import type { PublicOfferQuote } from '@/lib/last-chance/economics'
import { PRICING_SYNCED_EVENT } from '@/lib/pricing/sync-event'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import { clearClaim, isClaimingStarter } from '@/lib/partner-starter/handoff'
import { StarterDeliveryForm } from './StarterDeliveryForm'
import type { SupplierAddress } from '@/lib/supplier/types'
import {
  STARTER_GOODS_CAP,
  STARTER_MIN_STEP,
  STARTER_TIER_BANDS,
  STARTER_TIERS,
} from '@/lib/partner-starter/rules'
import { SubscriptionJourney, type ChangePolicySelection } from './SubscriptionJourney'
import { CheckoutSuccess } from './CheckoutSuccess'
import { receiptItemsFromSlots } from '@/lib/receipt/build'
import { ProductSwapModal } from './ProductSwapModal'
import { ConsultNote } from './ConsultNote'
import { withoutExcluded } from '@/lib/consult/exclusions'
import { UpgradesCard } from './UpgradesCard'
import { defaultVariantId } from '@/lib/catalogue/variants'
import { AccountGate } from '@/components/auth/AccountGate'
import { ShareSheet } from '@/components/share-card/ShareSheet'
import { GiveawayEntry } from '@/components/share-card/GiveawayEntry'
import { ShareStackButton } from '@/components/share-card/ShareStackButton'
import { buildSharePayload } from '@/lib/share-card/payload'
import { ConsentGate } from '@/components/legal/ConsentGate'
import { funnel } from '@/lib/analytics/quiz'
import type { Goal, StackLevel } from '@/lib/types'
import { TIER_META } from '@/lib/quiz-core'

/**
 * The value-first depth selector: build the full stack, let the customer choose
 * how deep to go. Shows what each depth contains (count) and its price, so the
 * value is visible before the price — and picking a depth reprices instantly.
 *
 * Each depth is priced to its band (`TIER_PRICE_BANDS`), so Essentials is the
 * same sort of money for every member and the count is what moves. A stack with
 * too few products to fill three bands offers two options, or one — `planTiers`
 * folds the rest rather than showing the same stack twice.
 */
function StackTierSelector({
  tiers, current, chosen = true, gifts = {}, labels, minMonthly, oneOffOnly = false, onChange,
}: {
  /** The depths' names, when not the quiz's own (a consult stack: Essentials, Standard, Complete). */
  labels?: Partial<Record<StackLevel, string>>
  tiers: TierPlan[]
  current: StackLevel
  /**
   * The full stack is the option they have chosen. While "Start here" is the
   * one the sticky bar follows, no depth is shown as picked.
   */
  chosen?: boolean
  /** Depths that come with the free bonus (its conditions are in the note under the row). */
  gifts?: Partial<Record<StackLevel, boolean>>
  /** The monthly floor a subscription has to clear to be offerable at all. */
  minMonthly: number
  /**
   * Show the one-off price alone, with no monthly figure.
   *
   * For a partner's free stack, which is one box and never a plan. Leading with
   * "£45/mo · Subscription" on a depth nobody in this journey can subscribe to
   * advertises a product that is not for sale on this screen — and puts the
   * wrong number in front of the one decision they are actually making.
   */
  oneOffOnly?: boolean
  onChange: (level: StackLevel) => void
}) {
  return (
    <div className="px-5 max-w-lg mx-auto">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
        Choose your depth
      </p>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tiers.length}, minmax(0, 1fr))` }}>
        {tiers.map(({ level, slots, oneOff, monthly }) => {
          const size = slots.length
          const meta = TIER_META[level]
          const active = chosen && current === level
          // A subscription this small cannot be placed, so this depth has no
          // monthly price to advertise. Same floor the plan tab enforces.
          const canSub = !oneOffOnly && monthly > 0 && monthly >= minMonthly
          return (
            <button
              key={level}
              onClick={() => onChange(level)}
              aria-pressed={active}
              className="relative text-left rounded-2xl border p-3 transition-all active:scale-[0.98]"
              style={{
                borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
                background: active ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)' : 'var(--color-surface)',
              }}
            >
              {meta.badge && (
                <span
                  className="absolute -top-2 left-2 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wide"
                  style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
                >
                  {meta.badge}
                </span>
              )}
              <div className="text-xs font-bold" style={{ color: active ? 'var(--color-accent)' : 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                {labels?.[level] ?? meta.label}
              </div>
              <div className="text-[10px] mt-0.5 leading-tight" style={{ color: 'var(--color-muted)' }}>
                {size} product{size === 1 ? '' : 's'}
              </div>
              {gifts[level] && (
                <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold leading-tight" style={{ color: 'var(--color-accent)' }}>
                  <Icon name="sparkle" size={11} />
                  {OFFER_COPY.tierGift}
                </div>
              )}
              {/*
                Both prices, always, in a fixed order: the monthly subscription
                leads and the one-off sits under it.

                Deliberately NOT driven by which plan is currently selected. The
                card's job is choosing a DEPTH, and a headline that jumped
                between two numbers every time the plan tab moved made the three
                depths hard to compare — which is the one thing this row exists
                for. So the position is stable and both numbers are labelled,
                and the plan tab below decides what is actually charged.

                Leading with the subscription price is a pricing decision, not a
                layout one: it is the lower number and the one the business
                wants chosen, and it is the anchor the depths should be compared
                at. It is labelled `subscription` precisely because it is NOT
                what a customer pays by default — one-off is still the selected
                plan until they flip it.
              */}
              {canSub ? (
                <>
                  <div className="text-sm font-black mt-1.5 leading-none" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                    {formatGBP(monthly)}<span className="text-[9px] font-semibold" style={{ color: 'var(--color-muted)' }}>/mo</span>
                  </div>
                  <div className="text-[9px] font-bold uppercase tracking-wide leading-tight mt-0.5" style={{ color: 'var(--color-accent)' }}>
                    Subscription
                  </div>
                  <div className="text-[9px] mt-0.5 leading-tight" style={{ color: 'var(--color-muted)' }}>
                    or {formatGBP(oneOff)} one-off
                  </div>
                </>
              ) : (
                <>
                  {/*
                    No subscription at this depth — a monthly plan has to clear
                    the order minimum and the shallowest tier routinely does not.
                    So this slot says so, in words, instead of a number.

                    It used to put the ONE-OFF price here at full size, and the
                    row read £49.97 / £31.57 / £38.78 — the cheapest, shallowest
                    depth showing the largest figure, because it was the only
                    one quoting a whole box against two monthly instalments.
                    Three numbers in a row invite comparison whether or not they
                    are comparable, and these were not. The one-off price still
                    appears, on the line where every card keeps its one-off, at
                    the size every card keeps it.
                  */}
                  {/*
                    "Monthly unavailable" is a REFUSAL, and it only makes sense
                    where a subscription was on the table and this depth cannot
                    reach it. Where no subscription is on offer at all — a
                    partner's free stack — it announces the absence of something
                    never offered, on the one screen where the only decision is
                    which of two boxes to take. There, the price is simply the
                    price.
                  */}
                  {!oneOffOnly && (
                    <div
                      className="text-[11px] font-bold uppercase tracking-wide mt-1.5 leading-tight"
                      style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}
                    >
                      Monthly unavailable
                    </div>
                  )}
                  <div
                    className={oneOffOnly ? 'text-sm font-black mt-1.5 leading-none' : 'text-[10px] mt-1 leading-tight'}
                    style={{
                      color: 'var(--color-text)',
                      ...(oneOffOnly ? { fontFamily: 'var(--font-display)' } : {}),
                    }}
                  >
                    {formatGBP(oneOff)}
                    {oneOffOnly ? '' : ' one-off'}
                  </div>
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The deck's heading. "Swipe to see all 5" says how many there are and that the
 * rest are off to the side; with one or two products there is less to say.
 */
export function deckHeading(count: number): string {
  if (count >= 3) return `Your personalised stack · swipe to see all ${count}`
  if (count === 2) return 'Your personalised stack · swipe to see both'
  return 'Your personalised stack'
}

/**
 * The dark panel the Stack and Plan scenes sit on. It lifts over the light You
 * scene as a deliberate scene cut: a rounded lip, a drawn shadow and a grab
 * handle.
 */
/*
  The dark panel runs to the foot of the page. Its 2.5rem bottom padding and
  the main view's pb-28 leave 9.5rem under the last content; the sticky
  checkout bar is about 5.6rem plus max(0.9rem, the bottom inset), so adding
  the inset keeps it clear on any device.
*/
function StackPanel({ children }: { children: ReactNode }) {
  return (
    <div
      id="scene-stack"
      className="mt-8 rounded-t-[2rem] pb-[calc(2.5rem+env(safe-area-inset-bottom))] scroll-mt-[calc(env(safe-area-inset-top)+4.5rem)]"
      style={{ background: 'var(--color-bg)', boxShadow: '0 -18px 44px -22px rgba(10,10,10,0.55)' }}
    >
      <div className="flex justify-center pt-3.5 pb-0.5">
        <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-border-2)' }} />
      </div>
      {children}
    </div>
  )
}

/**
 * The whole results page below the bar: the You scene (#scene-you), then the
 * Stack (#scene-stack) and Plan (#scene-plan) scenes on the dark panel.
 *
 * The You scene is rendered here rather than by Act4Reveal because it lists
 * the stack on screen, and the depth on offer (`tierPlans` → `activeSlots`)
 * depends on state that lives in this component (a partner's code, a claim).
 */
export function StackReviewPage({ reducedMotion }: { reducedMotion?: boolean } = {}) {
  const {
    stackBlueprint, setStackBlueprint, planType, setPlanType, answers, setAnswer,
    stackLevel, setStackLevel, subscriptionUsage, setSubscriptionUsage, subscriptionCustomised, setSubscriptionCustomised,
    revealedIntroDiscount, setRevealedIntroDiscount, consultExclusions,
  } = useQuizStore()
  const [journeyOpen, setJourneyOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  // What to do if a product becomes unavailable — chosen in the subscription
  // journey, carried to checkout so it's stored with the plan rather than asked
  // for afterwards. Defaults to keeping the plan whole.
  const [changePolicy, setChangePolicy] = useState<ChangePolicySelection>({
    default: 'auto-swap',
    byProductId: {},
  })
  const stackRef = useRef<HTMLDivElement>(null)
  // Portal the sticky checkout bar to document.body: this page renders inside an
  // animated (transformed) wrapper, which would otherwise anchor `position: fixed`
  // to that wrapper instead of the viewport.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // MOCK_BLUEPRINT only when no blueprint exists at all (direct navigation, or
  // a refresh — the blueprint isn't persisted). The factory guarantees at least
  // one slot, so a real blueprint — however small — is always shown as-is
  // rather than replaced with the mock stack.
  //
  // It is a MOCK-catalogue stack, though: its slots hold sample product ids.
  // Shown against the real shop, every one of them fails to resolve and the
  // page reads "Product unavailable" at £0.00 — so on the real catalogue we
  // send the customer back to the quiz instead (see the gate below).
  const rawBlueprint = stackBlueprint ?? MOCK_BLUEPRINT
  // useCatalogueProducts triggers the /api/catalogue fetch (once per session)
  // and returns the properly-typed CatalogueProduct[] from the Zustand store.
  // Every slot on this page is a product-id lookup into `products`, so nothing
  // may render until the catalogue is actually here — an id that hasn't loaded
  // yet is indistinguishable from one the shop doesn't stock, and both would
  // read "Product unavailable" at £0.00.
  const { products, isLoading: catalogueLoading, isLive, error: catalogueError } = useCatalogueProducts()

  /**
   * Whether this visit is a partner claiming their free stack.
   *
   * ── Why the server is asked, rather than the flag believed ────────────────
   * The flag in `sessionStorage` is an INTENT. Anyone can set it, and — the
   * case that actually matters — a real partner can have set it honestly and
   * then lost their session: a different device, a cleared cookie, thirty days
   * gone by. Believing it put £0.00 on screen in front of people the checkout
   * then charged in full.
   *
   * A screen that disagrees with the card is the one failure this journey
   * cannot have. So the flag only decides whether to ASK; `/api/partner/
   * claimable` decides the answer, from the session cookie the browser cannot
   * forge.
   *
   * ── Why it starts false ───────────────────────────────────────────────────
   * Because the wrong direction to be wrong in is the expensive one. Starting
   * false means a partner sees the ordinary price for a moment and then watches
   * it drop to zero — a pleasant correction. Starting true means everybody else
   * sees zero and then watches it climb, which is the surprise that loses an
   * order.
   */
  const [claiming, setClaiming] = useState(false)
  useEffect(() => {
    if (!isClaimingStarter()) return
    let live = true
    fetch('/api/partner/claimable', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { claimable: false }))
      .then((d: { claimable?: boolean }) => {
        if (live) setClaiming(d.claimable === true)
      })
      .catch(() => {
        /* Unreachable, so it is not a claim. The ordinary reveal at the
           ordinary price is the safe answer to a question we could not ask. */
      })
    return () => {
      live = false
    }
  }, [])

  // Default any slot without a selected variant to the product's first available
  // variant so the selector and price always agree.
  const baseBlueprint = useMemo(() => {
    let result = rawBlueprint
    for (const slot of rawBlueprint.slots) {
      if (slot.selectedVariantId) continue
      const product = products.find((p) => p.id === slot.selectedProductId)
      if (!product) continue
      // Use the Pour Plan's default flavour (product default → first available) so
      // what the Pour Plan shows is exactly what the receipt + cart use.
      const dvId = defaultVariantId(product)
      if (product.variants.some((v) => v.id === dvId)) result = updateStackSlotVariant(result, slot.slotId, dvId)
    }
    return result
  }, [rawBlueprint, products])

  /*
   * ── The offer (plan Phase 4) ──────────────────────────────────────────────
   *
   * The hub's settings (`/api/offer`), and what the engine decided about this
   * person: the quiz's own gates and scores (`quizPerson`), or the consult's,
   * carried over from where its answers were (`offerFit`). From those, the
   * hero: the approved product that fits them best and clears every one of
   * their exclusions. It goes first in the stack, in every depth, never
   * dropped or swapped out. None (switch off, nothing approved fits, a reload
   * of a consult, a partner's claim) and the stack is exactly the engine's,
   * and "Start here" is their top pick.
   */
  const { settings: offerSettings, ready: offerReady } = useOfferSettings()
  // Re-worked when the founders' pricing settings land, so an offer is never
  // priced on defaults the server will not honour.
  const [pricingVersion, setPricingVersion] = useState(0)
  useEffect(() => {
    const bump = () => setPricingVersion((v) => v + 1)
    window.addEventListener(PRICING_SYNCED_EVENT, bump)
    return () => window.removeEventListener(PRICING_SYNCED_EVENT, bump)
  }, [])
  const offerSnapshot = consultExclusions?.offerFit ?? null
  const offerPerson = useMemo<PersonFit | null>(
    () => (consultExclusions ? (offerSnapshot ? personFromSnapshot(offerSnapshot) : null) : quizPerson(answers)),
    [consultExclusions, offerSnapshot, answers],
  )
  const offerInputs = useMemo<OfferInputs>(
    () => ({ settings: offerSettings, catalogue: products, config: getPricingConfig() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pricingVersion stands in for the module-level config
    [offerSettings, products, pricingVersion],
  )
  const hero = useMemo(() => {
    if (claiming || !offerPerson || products.length === 0) return null
    // Only a hero with a real deal, as the core offer has always been sold.
    const choice = chooseHero(offerInputs, dealPerson(offerPerson, offerInputs.config))
    if (!choice) return null
    const primary = answers.primaryGoal ?? baseBlueprint.primaryGoal
    const goals = [primary, ...(answers.goals ?? []).filter((g) => g !== primary)].filter(Boolean) as Goal[]
    // The quiz may say why in one of their own answers; the consult's
    // reasons are its own, and only a goal the claim map backs is named.
    const explained = consultExclusions
      ? null
      : explainProductSafe({ product: choice.product, slotType: (choice.product.stackSlots[0] ?? 'health') as SlotType, answers })
    return { choice, reason: heroReason(choice, goals, explained?.kind === 'answer' ? explained.sentence : null) }
  }, [claiming, offerPerson, products.length, offerInputs, answers, baseBlueprint.primaryGoal, consultExclusions])
  // For a consult stack: products of the hero's family give up their place to it.
  const heroSameKind = useMemo(() => {
    const kind = hero ? offerSnapshot?.[hero.choice.product.id]?.kind : undefined
    return offerSnapshot && kind ? (id: string) => offerSnapshot[id]?.kind === kind : undefined
  }, [hero, offerSnapshot])
  const blueprint = useMemo(
    () => (hero ? withHeroFirst(baseBlueprint, hero.choice, hero.reason, heroSameKind) : baseBlueprint),
    [baseBlueprint, hero, heroSameKind],
  )
  /*
   * A consult stack (Phase 5): the consult's own tiers, names and read. Its
   * depths are the ones it built, hero first, never re-tiered by price band
   * (`consultTierPlans`); its products carry the engine's claims-aware
   * reasons; "What we checked" is the engine's "Kept out" and "Skipped".
   */
  const consultRead = consultExclusions?.read ?? null
  const consultTiers = consultExclusions?.tiers ?? null

  // productId → currently selected flavour variant, for the Pour Plan flavour picker.
  const selectedVariantByProductId = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of blueprint.slots) if (s.selectedProductId && s.selectedVariantId) m[s.selectedProductId] = s.selectedVariantId
    return m
  }, [blueprint])

  // Swap modal state
  const [swapSlot, setSwapSlot] = useState<StackSlotEntry | null>(null)

  const handleChangeVariant = useCallback(
    (slotId: string, variantId: string) => {
      setStackBlueprint(updateStackSlotVariant(blueprint, slotId, variantId))
    },
    [blueprint, setStackBlueprint],
  )

  const handleOpenSwap = useCallback(
    (slotId: string) => {
      const slot = blueprint.slots.find((s) => s.slotId === slotId) ?? null
      setSwapSlot(slot)
    },
    [blueprint],
  )

  const handleSelectSwap = useCallback(
    (slotId: string, newProductId: string) => {
      const product = products.find((p) => p.id === newProductId)
      const from = blueprint.slots.find((sl) => sl.slotId === slotId)?.selectedProductId
      funnel.stackSwap({ slotId, from, to: newProductId })
      const defaultVariant = product?.variants.find((v) => v.available)
      let updated = updateStackSlotProduct(blueprint, slotId, newProductId)
      if (defaultVariant) updated = updateStackSlotVariant(updated, slotId, defaultVariant.id)
      setStackBlueprint(updated)
      setSwapSlot(null)
    },
    [blueprint, products, setStackBlueprint],
  )

  const handleRemove = useCallback(
    (slotId: string) => {
      try {
        setStackBlueprint(removeOptionalSlot(blueprint, slotId))
        funnel.stackRemove({ slotId })
      } catch {
        // required slot — silently ignore (button shouldn't appear for these)
      }
    },
    [blueprint, setStackBlueprint],
  )

  const handleAddBooster = useCallback(
    (product: CatalogueProduct) => {
      const firstVariant = product.variants.find((v) => v.available) ?? product.variants[0]
      const slotType = product.stackSlots[0]
      const slotId = `booster-${product.id}`
      funnel.stackAdd({ productId: product.id, slotType })
      const updated = addBoosterSlot(blueprint, {
        slotId,
        slotType,
        title: SLOT_LABELS[slotType] ?? product.category,
        description: product.shortReason || product.description,
        recommendedProductId: product.id,
        selectedProductId: product.id,
        selectedVariantId: firstVariant?.id ?? null,
        required: false,
        canSwap: true,
        swapGroup: product.swapGroup,
        reason: product.shortReason || product.description,
        confidenceScore: product.recommendationPriority * 10,
      })
      setStackBlueprint(updated)
    },
    [blueprint, setStackBlueprint],
  )

  const { state: checkoutState, checkout, resume: resumeCheckout, reset: resetCheckout } = useStackCheckout()

  // A partner's code, once validated. Feeds both the receipt and the checkout,
  // so what is shown and what is charged come from the same number.
  const [partnerCode, setPartnerCode] = useState<AppliedCode | null>(null)

  /**
   * A founder code, once the box has accepted one.
   *
   * Founder codes are one-off only by design (`founderCodeWorksOn`): the
   * subscription checkout never sees them, so one left on the monthly tab would
   * be dropped and the plan charged in full. A `free` one also behaves like a
   * starter from here on — £0.00 on the receipt, an address asked for in the
   * page, since there is no Stripe form to give one on.
   */
  const founderKind = partnerCode?.founderKind ?? null
  const freeCode = founderKind === 'free'

  /** A starter buys one box, never a plan — and so does a founder code. */
  const starterPlanType = claiming || founderKind ? ('oneoff' as const) : null
  useEffect(() => {
    if (founderKind && planType === 'subscription') setPlanType('oneoff')
  }, [founderKind, planType, setPlanType])

  // Everything the price depends on EXCEPT the depth — the depth is what the
  // tier planner is deciding, so it can't be an input to it.
  const priceOpts = useMemo(
    () => ({
      usageByProductId: subscriptionUsage,
      introDiscountOverride: revealedIntroDiscount,
      defaultChangePolicy: changePolicy.default,
      changePolicyByProductId: changePolicy.byProductId,
      partnerDiscountPct: partnerCode?.discountPct ?? null,
      partnerCode: partnerCode?.code ?? null,
    }),
    [subscriptionUsage, revealedIntroDiscount, changePolicy, partnerCode],
  )

  // ── Value-first tiers ──────────────────────────────────────────────────────
  // The engine builds the full stack; the customer chooses a depth here, seeing
  // the value before the price. Each depth is filled to its own monthly price
  // band (`planTiers`), so Essentials costs about the same whatever the quiz
  // said and the number of products is what varies — not the other way round.
  /*
    A claim is planned differently, in three ways that all follow from the same
    fact: it is a fixed budget spent once, not a monthly price to aim at.

      • TWO DEPTHS. Essentials or Balanced — Complete is not on offer, so it is
        not planned. Planning it and hiding it would leave the fill carrying
        products towards a depth nobody can pick.
      • BANDED ON THE ONE-OFF LIST PRICE, not the monthly subscription total.
        What the box costs today is the number that matters; a monthly figure
        describes nothing that is happening.
      • A HARD CEILING at the cap. Bands are allowed to lose to the product
        floor, so a band alone cannot promise anything — the ceiling trims after
        the fill, which is what makes "always under £100" true rather than
        usually true. A stack over the cap is refused at the checkout, and
        "your free stack" ending in a shopping puzzle is the one outcome this
        journey cannot have.
  */
  const tierPlans = useMemo(
    () =>
      claiming
        ? planTiers(
            blueprint,
            products,
            answers,
            undefined,
            priceOpts,
            STARTER_TIER_BANDS,
            undefined,
            STARTER_MIN_STEP,
            { basis: 'oneOffList', levels: STARTER_TIERS, hardCeiling: STARTER_GOODS_CAP },
          )
        : consultTiers
        ? consultTierPlans({ blueprint, tiers: consultTiers, heroId: hero?.choice.product.id ?? null, sameKind: heroSameKind, catalogue: products, answers, priceOpts })
        : planTiers(blueprint, products, answers, undefined, priceOpts),
    [claiming, blueprint, products, answers, priceOpts, consultTiers, hero, heroSameKind],
  )
  const tierLabels = consultTiers && !claiming ? CONSULT_TIER_LABEL : undefined
  // The depth actually on offer for the member's choice: `planTiers` folds
  // depths a small stack can't tell apart, so the stored level may no longer be
  // one of them. Everything downstream — pricing, the receipt, checkout — uses
  // THIS level rather than the stored one, so the card is charged what the
  // selector showed.
  const activePlan = tierPlanFor(tierPlans, stackLevel)
  const activeLevel = activePlan.level
  const activeSlots = activePlan.slots
  const activeBlueprint = useMemo(
    () => ({ ...blueprint, slots: activeSlots, level: activeLevel }),
    [blueprint, activeSlots, activeLevel],
  )
  const showTiers = tierPlans.length > 1

  const subOpts = useMemo(() => ({ ...priceOpts, level: activeLevel }), [priceOpts, activeLevel])

  // Keep the stored depth honest: a fold (or a swap that reshapes the stack) can
  // retire the depth the member last chose, and anything else reading the store
  // — the bundle screen's advertised save rate, the checkout payload — would go
  // on quoting a bundle that is no longer on offer.
  //
  // Never while the catalogue is still loading: with no products every depth
  // prices at £0, they all fold into one, and the member's default would be
  // rewritten from a plan built out of nothing.
  useEffect(() => {
    if (products.length === 0) return
    if (activeLevel !== stackLevel) setStackLevel(activeLevel)
  }, [products.length, activeLevel, stackLevel, setStackLevel])

  /*
   * ── The free bonus, per depth ─────────────────────────────────────────────
   *
   * Chosen for each depth as it stands (`tierBonuses`), never priced in: the
   * stack's price, its saving and its delivery are what they would be without
   * it. Not on a partner's claim or a founder code, which are already the deal
   * this order is about.
   *
   * A code and the bonus don't combine: under the hub's rule the customer gets
   * whichever is worth more on this order (`codeOrBonus`). A code worth more
   * keeps its place and the receipt says why there's no gift; a gift worth
   * more takes the code off again and the code box says why.
   */
  const bonusPerson = claiming || founderKind ? null : offerPerson
  const bonuses = useMemo(() => tierBonuses(offerInputs, bonusPerson, tierPlans), [offerInputs, bonusPerson, tierPlans])
  /** A gift the checkout turned down (it said why): not offered again on this visit. */
  const [bonusRefused, setBonusRefused] = useState<string | null>(null)
  const tierBonus = bonuses[activeLevel]?.choice ?? null
  const offeredBonus = tierBonus && tierBonus.product.id !== bonusRefused ? tierBonus : null
  const codeSaving = useMemo(() => {
    if (!partnerCode || founderKind || !offeredBonus) return 0
    const without = calculatePricing(activeBlueprint, products, answers, undefined, { ...subOpts, partnerDiscountPct: null })
    const withIt = calculatePricing(activeBlueprint, products, answers, undefined, subOpts)
    return planType === 'subscription' && withIt.subscriptionItemCount > 0 && withIt.subscriptionMinOrderMet
      ? without.subscriptionFirstMonth - withIt.subscriptionFirstMonth
      : without.oneOffTotal - withIt.oneOffTotal
  }, [partnerCode, founderKind, offeredBonus, activeBlueprint, products, answers, subOpts, planType])
  const winner = offeredBonus && partnerCode ? codeOrBonus(offerSettings.bonus.codes, codeSaving, bonusWorth(offeredBonus)) : null
  const bonus = winner === 'code' ? null : offeredBonus
  const codeBeatsBonus = winner === 'code' && offeredBonus ? OFFER_COPY.codeBeatsBonus(titleOf(offeredBonus.product)) : null
  const [codeRefusal, setCodeRefusal] = useState<string | null>(null)
  useEffect(() => {
    if (winner === 'bonus' && offeredBonus) {
      setCodeRefusal(OFFER_COPY.bonusBeatsCode(titleOf(offeredBonus.product)))
      setPartnerCode(null)
    }
  }, [winner, offeredBonus])
  useEffect(() => {
    if (!offeredBonus) setCodeRefusal(null)
  }, [offeredBonus])
  useEffect(() => {
    if (checkoutState.status === 'error' && checkoutState.bonusRefused && bonus) setBonusRefused(bonus.product.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on the refusal itself
  }, [checkoutState])

  /*
   * ── Start here ────────────────────────────────────────────────────────────
   *
   * The core offer: the hero, or their top pick (`coreOffer`), priced as the
   * hero offer prices one product. It is the option the sticky bar follows
   * until they choose a depth of the full stack. Not on a partner's claim.
   */
  const [dealUsed, setDealUsed] = useState(false)
  useEffect(() => {
    try { setDealUsed(window.localStorage.getItem(LAST_CHANCE_USED_KEY) === '1') } catch { /* no storage: the deal stands */ }
  }, [])
  const core = useMemo(
    () =>
      claiming || products.length === 0
        ? null
        : coreOffer({
            hero,
            slots: blueprint.slots,
            catalogue: products,
            answers,
            primaryGoal: blueprint.primaryGoal,
            usage: subscriptionUsage,
            dealUsed,
            config: offerInputs.config,
          }),
    [claiming, products, hero, blueprint.slots, blueprint.primaryGoal, answers, subscriptionUsage, dealUsed, offerInputs.config],
  )
  const [option, setOption] = useState<'core' | 'stack'>('core')
  // A founder code is for the stack (it sets the stack's price), so with one
  // applied the bar follows the stack.
  const chosen: 'core' | 'stack' = core && !founderKind ? option : 'stack'
  const chooseDepth = useCallback(
    (level: StackLevel) => {
      setStackLevel(level)
      setOption('stack')
    },
    [setStackLevel],
  )
  const { state: coreState, buy: buyCore } = useOfferCheckout()
  // When the server says the deal moved, show its figures and buy at those;
  // when it says there's no deal (or no hero) any more, stand the button down.
  const [coreOverride, setCoreOverride] = useState<PublicOfferQuote | null>(null)
  useEffect(() => {
    if (coreState.status === 'changed' && coreState.quote?.viable) setCoreOverride(coreState.quote)
  }, [coreState])
  useEffect(() => setCoreOverride(null), [core?.variant.id])
  const coreWithdrawn = coreState.status === 'changed' && !coreState.quote?.viable
  const coreTotal = core ? (coreOverride ?? core.quote).total : 0
  const coreBusy = coreState.status === 'loading' || coreState.status === 'redirecting'

  // The bonus as the depth picker shows it: a "Gift" mark on each depth that
  // comes with one, and under the row what this depth comes with or what
  // would qualify, its conditions beside it.
  const giftLevels = useMemo(() => {
    const out: Partial<Record<StackLevel, boolean>> = {}
    for (const t of tierPlans) {
      const c = bonuses[t.level]?.choice
      out[t.level] = Boolean(c) && c!.product.id !== bonusRefused && winner !== 'code'
    }
    return out
  }, [tierPlans, bonuses, bonusRefused, winner])
  const bonusLine = claiming || founderKind || winner === 'code' || (tierBonus && !offeredBonus)
    ? null
    : bonusLineFor(activeLevel, bonuses, offerSettings.bonus)
  const moreFor = useMemo(() => {
    if (!core || !bonus) return null
    const difference = Math.round((tierDelivered(activePlan, products, offerInputs.config) - coreTotal) * 100) / 100
    return difference > 0 ? OFFER_COPY.moreFor(difference, titleOf(bonus.product)) : null
  }, [core, bonus, activePlan, products, offerInputs.config, coreTotal])

  /*
    A starter buys one box, never a plan — so it forces the ONE-OFF path here
    rather than trusting the tab.

    The receipt already hides the subscription tab when a starter is applied
    (`canSubscribe`), but `planType` is state: somebody who picked the
    subscription and THEN entered their code would still be holding
    'subscription' when they pressed the button, and the subscription checkout
    does not go through `/api/cart` at all — it goes to `finalizeCheckout`,
    which knows nothing about starters and would put a partner onto a paid
    recurring plan.
  */
  /*
    A claim asks for an address before it orders.

    Every other journey collects one at Stripe. A free order never gets there,
    so if this step did not exist the box would be raised with nowhere to go —
    which is exactly how the first version shipped, and every claimed order sat
    in the fulfilment queue unshippable.
  */
  const [addressOpen, setAddressOpen] = useState(false)

  const placeOrder = useCallback(
    (deliveryAddress?: SupplierAddress | null) =>
      checkout(activeBlueprint, products, starterPlanType ?? planType, answers, {
        ...subOpts,
        deliveryAddress: deliveryAddress ?? null,
        claimingStarter: claiming,
        bonus: bonus ? { productId: bonus.product.id, level: activeLevel } : null,
      }),
    [checkout, activeBlueprint, products, starterPlanType, planType, answers, subOpts, claiming, bonus, activeLevel],
  )

  /*
    One button, two meanings. For a claim it opens the address form; for
    everybody else it is the checkout it has always been — they give their
    address to Stripe on the next screen.
  */
  const handleCheckout = useCallback(() => {
    setOption('stack')
    if (claiming || freeCode) {
      setAddressOpen(true)
      return
    }
    void placeOrder()
  }, [claiming, freeCode, placeOrder])

  const pricing = calculatePricing(activeBlueprint, products, answers, undefined, subOpts)
  const subscriptionPlan = useMemo(
    () => buildSubscriptionPlan(activeBlueprint, products, answers, undefined, subOpts),
    [activeBlueprint, products, answers, subOpts],
  )
  const slotTitleById = Object.fromEntries(blueprint.slots.map((s) => [s.slotId, s.title]))

  /**
   * The share card's snapshot.
   *
   * Built here rather than inside the sheet so it is taken from the stack as it
   * stands on screen — after tier changes and product swaps — which is the stack
   * the customer is actually looking at when they press Share. Its headline is
   * the stack's own name, the same one the You scene shows.
   *
   * `answers.name` is passed so the builder can keep it off the card. Showing
   * it is the separate `showFirstName` flag, and it stays off until there is a
   * control for it.
   */
  const sharePayload = useMemo(
    () =>
      buildSharePayload(activeBlueprint, null, products, {
        customerName: answers.name,
        code: partnerCode?.code ?? null,
      }),
    [activeBlueprint, products, answers.name, partnerCode],
  )

  /*
    The You scene: every product on screen (the depth chosen, swaps and add-ons
    included), each with its "Built from your answers" line, and the "What we
    checked" lines still true of those products. Both come from
    `@/lib/results`, which decides what may be said; this only lays it out.
  */
  const youItems = useMemo<YouSceneItem[]>(
    () =>
      activeSlots.flatMap((slot) => {
        const product = products.find((p) => p.id === slot.selectedProductId)
        if (!product) return []
        // A consult stack's products carry the consult's own reasons, already
        // through the claims maps; a product it didn't pick (a swap, an
        // add-on) gets the quiz's explanation as before.
        const consult = consultRead?.products[product.id]
        const explanation: ProductExplanation | null = consult
          ? consult.reason
            ? { kind: 'consult', sentence: consult.reason, claim: consult.claim ? CLAIMS[consult.claim] ?? null : null }
            : null
          : explainProductSafe({ product, slotType: slot.slotType as SlotType, answers })
        return [{ key: slot.slotId, product, slotType: slot.slotType, explanation }]
      }),
    [activeSlots, products, answers, consultRead],
  )
  const checkLines = useMemo(() => {
    if (consultRead) return consultRead.checked
    try {
      return whatWeChecked({ blueprint: activeBlueprint, products, slots: activeSlots, answers })
    } catch {
      return []
    }
  }, [activeBlueprint, products, activeSlots, answers, consultRead])

  // Sticky bar: the active plan's headline total + a one-tap path to checkout,
  // so the sale is always reachable without scrolling to the bottom.
  const stickyIsSub = planType === 'subscription'
    && pricing.subscriptionItemCount > 0
    && pricing.subscriptionMinOrderMet
  /*
    A partner's starter stack pays for this order, so the number on the bar is
    zero — the same number the receipt shows and the same number the server
    charges. The bar is the figure people actually read on the way to pressing
    the button; leaving the list price on it would put the two screens in
    disagreement at exactly the moment that matters.
  */
  const starterStack = claiming
    ? { label: 'Your free starter stack' }
    : freeCode
      ? { label: `Free with ${partnerCode?.code}` }
      : null
  const stickyTotal = starterStack ? 0 : stickyIsSub ? pricing.subscriptionTotal : pricing.oneOffTotal

  /*
    The starter is spent, so the tab stops carrying it.

    Not cleared when it is APPLIED: a refresh restarts the quiz (the blueprint
    is deliberately not persisted), and a partner made to redo the quiz must not
    also have to go back to their account for the code. Once an order exists,
    though, keeping it would auto-apply a used code to their next stack and
    refuse it — a confusing end to a journey that has just worked.
  */
  useEffect(() => {
    if (checkoutState.status === 'mock-complete') clearClaim()
  }, [checkoutState.status])
  /*
   * ── The advertised code ─────────────────────────────────────────────────
   *
   * One store code the Founders Hub has chosen to show here, while it would
   * actually be accepted (`/api/checkout-promo`). Priced twice — without any
   * code and with this one — through the same `calculatePricing` the receipt
   * uses, so the "£97.56 → £77.97" on the card is the receipt the button
   * produces, margin floor and replace-not-stack included.
   *
   * Never beside another code: a partner's or a founder's code, or a claimed
   * starter, is the discount this order is about, and an offer arguing with it
   * would cost the partner their attribution for no gain to anyone. And only
   * when it would save money — a code that comes to the same as the bundle deal
   * is not an offer.
   */
  const [promo, setPromo] = useState<Promo | null>(null)
  /** Bumped when a code ends with the page open, to ask for the next day's. */
  const [promoAsk, setPromoAsk] = useState(0)
  useEffect(() => {
    let live = true
    fetch('/api/checkout-promo', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { promo?: Promo | null } | null) => {
        // Only a different code replaces the one on screen: the card that has
        // just ended says so, and asking again must not bring it back.
        if (live && d?.promo) setPromo((current) => (current?.code === d.promo!.code ? current : d.promo!))
      })
      .catch(() => {
        /* No offer is the safe answer to a question we could not ask. */
      })
    return () => {
      live = false
    }
  }, [promoAsk])
  const promoApplied = promo !== null && partnerCode?.code === promo.code
  const promoPrices = useMemo(() => {
    if (!promo || claiming || founderKind || (partnerCode && partnerCode.code !== promo.code)) return null
    const without = calculatePricing(activeBlueprint, products, answers, undefined, {
      ...subOpts, partnerDiscountPct: null,
    })
    const withCode = calculatePricing(activeBlueprint, products, answers, undefined, {
      ...subOpts, partnerDiscountPct: promo.percent / 100,
    })
    const sub = planType === 'subscription' && without.subscriptionItemCount > 0 && without.subscriptionMinOrderMet
    return sub
      ? { scope: 'first month' as const, before: without.subscriptionFirstMonth, after: withCode.subscriptionFirstMonth }
      : { scope: 'order' as const, before: without.oneOffTotal, after: withCode.oneOffTotal }
  }, [promo, claiming, founderKind, partnerCode, activeBlueprint, products, answers, subOpts, planType])
  // A code the free gift would beat is not advertised beside it: applying it
  // would only be taken off again.
  const promoLosesToBonus = offeredBonus !== null && promoPrices !== null && !promoApplied
    && codeOrBonus(offerSettings.bonus.codes, promoPrices.before - promoPrices.after, bonusWorth(offeredBonus)) === 'bonus'
  const showPromo = promo !== null && promoPrices !== null && !promoLosesToBonus
    && (promoApplied || promoPrices.after < promoPrices.before - 0.005)

  const applyPromo = useCallback(async (): Promise<string | null> => {
    if (!promo) return 'This offer isn’t available any more.'
    const result = await checkDiscountCode({
      code: promo.code,
      subtotal: planType === 'subscription' ? pricing.subscriptionTotal : pricing.oneOffSubtotal,
    })
    if (!result.ok) return result.reason
    setPartnerCode(result.applied)
    return null
  }, [promo, planType, pricing.subscriptionTotal, pricing.oneOffSubtotal])

  /*
   * Taking the advertised code off — by the customer, or because its deadline
   * passed with the page open.
   *
   * The referral cookie goes too when it holds this code. Somebody who arrived
   * on an ad's `?ref=LAUNCH25` link carries it, and left there it would put the
   * code straight back: the code box re-applies it as it remounts, and the
   * checkout falls back to it server-side (`resolveCheckoutCode`). The box's
   * own Remove has always done this; the card has to as well.
   */
  const removePromo = useCallback(() => {
    if (promo) forgetReferral(promo.code)
    setPartnerCode((current) => (current && promo && current.code === promo.code ? null : current))
  }, [promo])

  // A daily code ran out with the page open: take it off, then ask for the
  // next one a moment later — after the server's clock has passed midnight too.
  const promoEnded = useCallback(() => {
    removePromo()
    if (promo?.kind === 'daily') window.setTimeout(() => setPromoAsk((n) => n + 1), 3000)
  }, [removePromo, promo])

  /*
   * ── The bar gets out of the receipt's way ────────────────────────────────
   *
   * The sticky bar exists so checkout stays reachable while you are still
   * reading. Once you have scrolled to the receipt, its own button IS the
   * checkout — and the bar was sitting directly on top of it, so the page
   * offered the same action twice and physically covered the better one.
   *
   * So it retires when the real button is on screen. Nothing is removed: the
   * receipt keeps the button that carries the loading state, and the bar keeps
   * every position where there is no button to press.
   */
  const [ctaEl, setCtaEl] = useState<HTMLButtonElement | null>(null)
  const [ctaOnScreen, setCtaOnScreen] = useState(false)
  useEffect(() => {
    if (!ctaEl || typeof IntersectionObserver === 'undefined') {
      setCtaOnScreen(false)
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => setCtaOnScreen(entry.isIntersecting),
      // A slice off the bottom, so the bar clears before the button reaches it
      // rather than at the moment they overlap.
      { rootMargin: '0px 0px -96px 0px' },
    )
    io.observe(ctaEl)
    return () => io.disconnect()
  }, [ctaEl])

  /*
    "Start here" has its own buy button. While it is on screen the bar would be
    the same purchase twice, or a different one sitting on top of it, so it
    steps aside there too.
  */
  const [offerCtaEl, setOfferCtaEl] = useState<HTMLButtonElement | null>(null)
  const [offerCtaOnScreen, setOfferCtaOnScreen] = useState(false)
  useEffect(() => {
    if (!offerCtaEl || typeof IntersectionObserver === 'undefined') {
      setOfferCtaOnScreen(false)
      return
    }
    const io = new IntersectionObserver(([entry]) => setOfferCtaOnScreen(entry.isIntersecting), {
      rootMargin: '0px 0px -96px 0px',
    })
    io.observe(offerCtaEl)
    return () => io.disconnect()
  }, [offerCtaEl])

  const showStickyBar = !swapSlot && !journeyOpen && !shareOpen && !ctaOnScreen && !offerCtaOnScreen
    && checkoutState.status !== 'needs-account'
    && checkoutState.status !== 'needs-consent'
  const leavingForStripe = checkoutState.status === 'redirecting'
  const startWithCore = useCallback(() => {
    if (!core || checkoutState.status === 'loading' || leavingForStripe || coreWithdrawn) return
    setOption('core')
    void buyCore({
      variantId: core.variant.id,
      productTitle: core.product.title,
      quote: coreOverride ?? core.quote,
      claimId: core.claim?.id ?? null,
      hero: core.kind === 'hero',
    })
  }, [core, checkoutState.status, leavingForStripe, coreWithdrawn, buyCore, coreOverride])
  const barOnCore = chosen === 'core' && core !== null

  // Funnel: the built-bundle screen was reached (once), and the checkout
  // start/success transitions — closing the quiz → checkout conversion loop.
  const revealedRef = useRef(false)
  useEffect(() => {
    if (revealedRef.current) return
    revealedRef.current = true
    funnel.revealView({
      slotCount: activeSlots.length,
      oneOff: pricing.oneOffTotal,
      sub: pricing.subscriptionTotal,
      plan: planType,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const prevCheckoutStatus = useRef(checkoutState.status)
  useEffect(() => {
    const prev = prevCheckoutStatus.current
    prevCheckoutStatus.current = checkoutState.status
    if (checkoutState.status === prev) return
    // Start only. Success is NOT reported from here: `redirecting` means the
    // member is on their way to Stripe, not that they paid (OC-F-002). The
    // server-verified `purchase` event on /order/confirmation is the success
    // signal for these orders.
    if (checkoutState.status === 'loading') funnel.checkoutStart({ plan: planType, total: stickyTotal })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutState.status])

  // IDs already in the stack (core + added boosters)
  const stackProductIds = new Set(blueprint.slots.map((s) => s.selectedProductId))

  // Out-of-stock products are held out of boosters and swap alternatives for the
  // same reason the engine
  // won't recommend one: the swap sheet exists to get someone OUT of an
  // unavailable pick, so offering another unavailable product sends them round
  // the same loop. The slot's current product is added back by
  // `swapAlternatives` below, so it stays visible in its own list.
  //
  // A stack from the Amp Consult also carries what its circuit check ruled
  // out, and nothing ruled out there can come back in here (H9): omega-3 is not
  // an extra for somebody on blood thinners.
  const offerableProducts = useMemo(
    () => withoutExcluded(inStockOnly(products), consultExclusions),
    [products, consultExclusions],
  )

  // Booster candidates: isBoosterEligible, not already in stack, ordered by
  // goal overlap with blueprint then recommendationPriority
  const primaryGoal = blueprint.primaryGoal
  const allGoals = [primaryGoal, ...blueprint.secondaryGoals]
  const boosters = useMemo(() => {
    const seenSlots = new Set<string>()
    return offerableProducts
      .filter((p) => p.isBoosterEligible && !p.isSubscriptionOnly && !stackProductIds.has(p.id))
      .sort((a, b) => {
        const aGoalHits = a.goals.filter((g) => allGoals.includes(g)).length
        const bGoalHits = b.goals.filter((g) => allGoals.includes(g)).length
        if (bGoalHits !== aGoalHits) return bGoalHits - aGoalHits
        return b.recommendationPriority - a.recommendationPriority
      })
      .filter((p) => {
        const slot = p.stackSlots[0]
        if (!slot || seenSlots.has(slot)) return false
        seenSlots.add(slot)
        return true
      })
      .slice(0, 4)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerableProducts, blueprint.slots, primaryGoal, blueprint.secondaryGoals])

  // Build alternatives list for the open swap modal slot
  const swapCurrentProduct = swapSlot ? products.find((p) => p.id === swapSlot.selectedProductId) : undefined
  const swapAlternatives = swapSlot
    ? [
        ...products.filter((p) => p.id === swapSlot.selectedProductId),
        ...getSwappableProductsForSlot(swapSlot, offerableProducts),
      ].filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx)
    : []

  /*
    The You scene's heading. While the catalogue is still loading it shows the
    greeting and the stack's name only: the lists need the products. A mock
    stack is never named while the shop might turn out to be the real one.
  */
  const youScene = (withProducts: boolean) => (
    <YouScene
      name={answers.name}
      stackName={stackBlueprint || (!catalogueLoading && !isLive) ? activeBlueprint.stackName : null}
      items={withProducts ? youItems : []}
      checks={withProducts ? checkLines : []}
      read={consultRead}
      reducedMotion={reducedMotion}
    />
  )

  if (!blueprint || catalogueLoading || !offerReady) {
    return (
      <>
        {youScene(false)}
        <StackPanel>
          <div className="flex items-center justify-center min-h-[60vh]">
            <p className="text-[var(--color-muted)] text-sm">Building your stack…</p>
          </div>
        </StackPanel>
      </>
    )
  }

  // No catalogue at all — say so, rather than rendering a page of empty cards.
  // No You scene: there is no stack to introduce.
  if (products.length === 0) {
    return (
      <StackPanel>
        <div className="flex flex-col items-center justify-center gap-2 min-h-[60vh] px-8 text-center">
          <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            We couldn’t load the shop
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            {catalogueError ?? 'The catalogue came back empty, so there’s nothing to build your stack from yet.'}
          </p>
        </div>
      </StackPanel>
    )
  }

  // A mock sample stack has no meaning against the real shop — its product ids
  // don't exist there. Ask for the quiz rather than render unresolvable cards.
  if (!stackBlueprint && isLive) {
    return (
      <StackPanel>
        <div className="flex flex-col items-center justify-center gap-2 min-h-[60vh] px-8 text-center">
          <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            Your stack isn’t here yet
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            Take the quiz and we’ll build one from the products we actually stock.
          </p>
        </div>
      </StackPanel>
    )
  }

  // Only the MOCK path confirms in place. A real payment leaves this page for
  // Stripe and confirms on /order/confirmation, after the server has verified
  // the session — rendering success here during the redirect is DEF-001.
  if (checkoutState.status === 'mock-complete') {
    return (
      <>
        {youScene(true)}
        <StackPanel>
          <CheckoutSuccess
            plan={checkoutState.plan}
            mock
            subscription={checkoutState.subscription}
            changePolicy={changePolicy.default}
            oneOff={{
              items: receiptItemsFromSlots(activeSlots, products),
              subtotal: pricing.oneOffSubtotal,
              total: pricing.oneOffTotal,
            }}
            onBack={resetCheckout}
          />
        </StackPanel>
      </>
    )
  }

  return (
    <>
      {youScene(true)}
      <StackPanel>
        <div className="pb-28">
          {/* What the circuit check ruled out, before anything is offered. */}
          {consultExclusions && <ConsultNote exclusions={consultExclusions} />}

          {/* Start here: the core offer, one product, one tap. */}
          {core && (
            <CoreOfferCard
              offer={core}
              override={coreOverride}
              status={coreState.status}
              message={coreState.status === 'error' || coreState.status === 'changed' ? coreState.message : null}
              blocked={checkoutState.status === 'loading' || leavingForStripe || coreWithdrawn}
              note={partnerCode && !founderKind ? OFFER_COPY.codeNotOnHero : null}
              onBuy={startWithCore}
              onBackToStack={() => {
                const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
                document.getElementById('offer-full-stack')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
              }}
              onCtaRef={setOfferCtaEl}
            />
          )}

          {core && (
            <div id="offer-full-stack" className="px-5 pt-10 max-w-lg mx-auto scroll-mt-[calc(env(safe-area-inset-top)+4.5rem)]">
              <p className="text-[10px] font-bold tracking-[0.25em] uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)' }}>
                {OFFER_COPY.fullStack}
              </p>
              <p className="mt-1.5 text-[13px] leading-snug" style={{ color: 'var(--color-text-2)' }}>
                {OFFER_COPY.fullStackLine(titleOf(core.product))}
              </p>
            </div>
          )}

          <StackHero
            blueprint={activeBlueprint}
            productCount={activeSlots.length}
            totalPrice={pricing.oneOffTotal}
            monthlyPrice={pricing.subscriptionTotal}
            canSubscribe={pricing.subscriptionItemCount > 0 && pricing.subscriptionMinOrderMet}
          />

          <div className="h-px bg-[var(--color-border)] mx-5" />

          {/* No "One thing we couldn't match" note. Naming the goals the stack
              does not serve says it serves the others, which links a goal to
              a product outside the goal-to-claim map. The products are listed
              in the You scene, and the GP disclaimer is at the foot of the page. */}

          {/* Value-first depth selector — choose Essentials / Balanced / Complete,
              each filled to its own monthly price band, so value comes first. */}
          {showTiers && (
            <div className="pt-6">
              <StackTierSelector
                tiers={tierPlans}
                current={activeLevel}
                chosen={chosen === 'stack'}
                gifts={giftLevels}
                minMonthly={getPricingConfig().minSubscriptionMonthly}
                oneOffOnly={claiming || founderKind != null}
                labels={tierLabels}
                onChange={chooseDepth}
              />
            </div>
          )}
          {bonusLine && (
            <div className="px-5 max-w-lg mx-auto">
              <BonusNote
                line={bonusLine}
                minimum={offerSettings.bonus.minSubtotal}
                firstOrderOnly={offerSettings.bonus.firstOrderOnly}
                subscription={planType === 'subscription'}
                moreFor={moreFor}
              />
            </div>
          )}

          {/* Core + added booster product cards — a swipeable top-trumps deck */}
          <div ref={stackRef} className="pt-7" style={{ scrollMarginTop: 16 }}>
            <p
              className="px-5 max-w-lg mx-auto text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-4"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {deckHeading(activeSlots.length)}
            </p>
            <StackDeck
              slots={activeSlots}
              products={products}
              planType={planType}
              answers={answers}
              usage={subscriptionUsage}
              onChangeProduct={handleOpenSwap}
              onChangeVariant={handleChangeVariant}
              onRemove={handleRemove}
              /*
               * Only when there is something to add.
               *
               * `UpgradesCard` has an empty state — a tick and "You're all set" —
               * which is the right thing for a panel somebody opened on purpose
               * and the wrong thing for the last card of a swipe deck. It read as
               * a full card of dead space at the end of the stack, and the swipe
               * that reached it was wasted.
               */
              trailing={
                boosters.length > 0
                  ? <UpgradesCard boosters={boosters} onAdd={handleAddBooster} />
                  : undefined
              }
            />
          </div>

          {/* Divider before pricing */}
          <div className="h-px bg-[var(--color-border)] mx-5 mt-8" />

          {/* Price summary + checkout */}
          <div id="scene-plan" className="px-5 pt-6 max-w-lg mx-auto scroll-mt-[calc(env(safe-area-inset-top)+4.5rem)]">
            {checkoutState.status === 'error' && (
              <div className="mb-4 rounded-xl border border-[var(--color-red)]/30 bg-[var(--color-red)]/8 px-4 py-3 space-y-1">
                {checkoutState.messages.map((msg, i) => (
                  <p key={i} className="text-xs text-[var(--color-red)] leading-relaxed">{msg}</p>
                ))}
                <button
                  onClick={resetCheckout}
                  className="text-[10px] font-semibold text-[var(--color-red)]/70 underline mt-1"
                >
                  Dismiss
                </button>
              </div>
            )}
            {planType === 'subscription' && scratchRevealAvailable() && subscriptionPlan.length > 0 && (
              <ScratchToReveal
                monthlyTotal={pricing.subscriptionTotal}
                revealed={revealedIntroDiscount}
                onReveal={setRevealedIntroDiscount}
              />
            )}

            {/* Above the receipt, so the totals below already include it. */}
            {showPromo && promo && promoPrices && (
              <CheckoutPromo
                key={promo.code}
                promo={promo}
                before={promoPrices.before}
                after={promoPrices.after}
                scope={promoPrices.scope}
                applied={promoApplied}
                onApply={applyPromo}
                onRemove={removePromo}
                onEnded={promoEnded}
              />
            )}
            {/* The advertised code carries its own applied state and Remove, so the
                box steps aside while the card is showing it rather than saying it
                twice. Only then: during a claim there is no card, and the box is
                the one place a typed code can be seen and taken off. */}
            {!(showPromo && promoApplied) && (
              <div className="mb-3 flex flex-col">
                <PartnerCodeBox
                  subtotal={planType === 'subscription' ? pricing.subscriptionTotal : pricing.oneOffSubtotal}
                  applied={partnerCode}
                  onChange={setPartnerCode}
                  prompt={showPromo ? 'Got a different code?' : undefined}
                />
                {codeRefusal && (
                  <p role="status" className="text-[11px] leading-snug mt-1.5" style={{ color: 'var(--color-text-2)' }}>
                    {codeRefusal}
                  </p>
                )}
              </div>
            )}

            {/* The high-level receipt — what you're buying, discounts, total */}
            <PlanReceipt
              slots={activeSlots}
              products={products}
              subscriptionPlan={subscriptionPlan}
              pricing={pricing}
              planType={planType}
              onPlanChange={setPlanType}
              onCheckout={handleCheckout}
            partnerCode={partnerCode?.code ?? null}
              codeKind={partnerCode?.kind ?? null}
              starterStack={starterStack}
              oneOffOnly={founderKind ? 'Your code is for a one-off order, so subscribing isn’t available with it.' : null}
              onCustomise={() => stackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              isLoading={checkoutState.status === 'loading'}
              onCtaRef={setCtaEl}
              bonus={bonus ? { title: bonus.product.title, worth: bonusWorth(bonus), firstBoxOnly: planType === 'subscription' } : null}
              bonusNote={codeBeatsBonus}
              tierLabels={tierLabels}
            />

            {/* The one form in the journey: a claim, or a free founder code. */}
            {(claiming || freeCode) && addressOpen && (
              <StarterDeliveryForm
                busy={checkoutState.status === 'loading'}
                error={checkoutState.status === 'error' ? checkoutState.messages[0] : null}
                onCancel={() => {
                  setAddressOpen(false)
                  resetCheckout()
                }}
                onSubmit={(address) => void placeOrder(address)}
              />
            )}

            {/*
              Delivery detail and quantities.

              ── Why these two are one block, and a quiet one ──────────────────
              They used to be two more cards below the receipt: a bordered
              disclosure on its own surface, then an accent-tinted button. Stacked
              under a card that already contained five boxes, that made four
              near-equal actions after the primary one — and nothing on the page
              said which of them mattered.

              They are both about the SAME thing (what arrives, and how much of
              it), and both are secondary to buying. So they are one group,
              attached to the receipt by a hairline rather than floating as peers,
              with no border, no second surface and no accent. The accent is spent
              once on this screen, on "Start subscription".
            */}
            {planType === 'subscription' && subscriptionPlan.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                <details className="group">
                  <summary
                    className="flex items-center justify-between py-2 cursor-pointer list-none text-xs font-semibold"
                    style={{ color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}
                  >
                    What lands each month
                    <Icon name="chevron-down" size={15} className="text-[var(--color-muted)] transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="pt-1 pb-2">
                    <SubscriptionProtocol
                      plan={subscriptionPlan}
                      answers={answers}
                      slotTitleById={slotTitleById}
                      minMonths={pricing.subscriptionMinMonths}
                      monthlyTotal={pricing.subscriptionTotal}
                      firstMonth={pricing.subscriptionFirstMonth}
                      introPct={pricing.subscriptionIntroDiscountPct}
                    />
                  </div>
                </details>

                {/* The other half of the same question, so it reads as a sibling
                    of the disclosure rather than as another call to action. */}
                <button
                  onClick={() => setJourneyOpen(true)}
                  className="flex items-center justify-between w-full py-2 text-xs font-semibold text-left transition-colors"
                  style={{ color: 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}
                >
                  Change quantities
                  <Icon name="chevron-right" size={15} className="text-[var(--color-muted)]" />
                </button>
              </div>
            )}

            {/* Safety fine print. One size, matching every other piece of small
                print on the page — it was the fourth in this stretch alone. */}
            <p className="text-[11px] leading-relaxed mt-5 text-center" style={{ color: 'var(--color-muted)' }}>
              Food supplements are not a substitute for a varied diet or medical care.
              Consult your GP before use if you are pregnant, breastfeeding, or taking
              prescribed medication (including HRT).
            </p>

            {/*
              The share prompt, after the plan rather than before the stack.
              ─────────────────────────────────────────────────────────────────
              It used to sit between the hero and the product deck — the highest
              intent position on the page — where it competed with the buying
              decision it interrupts. A poster of a stack is a lovely thing to
              offer somebody and a strange thing to offer them mid-purchase.

              Here it reads as the thing to do once the deciding is done, and the
              sticky bar keeps the checkout permanently reachable, so nothing is
              buried by the move.
            */}
            {/* `[&>div]:mt-0` cancels the button's own `-mt-2`, which it carries
                for the position it used to sit in. Without it the gap below the
                fine print is zero while the gap above is 20px, and the paragraph
                reads as belonging to the share card rather than to the plan. */}
            <div className="mt-5 -mx-5 [&>div]:mt-0">
              <ShareStackButton payload={sharePayload} onOpen={() => setShareOpen(true)} giveawayElsewhere />
            </div>

            {/* The giveaway: an email at the end of the quiz is the entry, and
                sharing the card above is the bonus. Renders nothing unless a
                competition is open. */}
            <GiveawayEntry payload={sharePayload} onShare={() => setShareOpen(true)} />

          </div>
        </div>
      </StackPanel>

      {mounted && showStickyBar && createPortal(
        <div
          className="fixed inset-x-0 bottom-0 z-30 px-4 pt-6 pb-[max(0.9rem,env(safe-area-inset-bottom))] pointer-events-none"
          style={{ background: 'linear-gradient(to top, var(--color-bg) 55%, transparent)' }}
        >
          <div
            className="max-w-lg mx-auto flex items-center gap-3 rounded-2xl pl-4 pr-2 py-2 pointer-events-auto"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-2)',
              boxShadow: '0 10px 34px -10px rgba(0,0,0,0.7)',
            }}
          >
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>
                {barOnCore ? `${OFFER_COPY.stickyHero} · ${OFFER_COPY.delivered}` : starterStack ? 'To pay' : stickyIsSub ? 'Monthly' : 'One-off total'}
              </p>
              <p className="text-xl font-black leading-none" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                {formatGBP(barOnCore ? coreTotal : stickyTotal)}
                {!barOnCore && stickyIsSub && <span className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>/mo</span>}
              </p>
            </div>
            <button
              onClick={barOnCore ? startWithCore : handleCheckout}
              disabled={checkoutState.status === 'loading' || leavingForStripe || (barOnCore && (coreBusy || coreWithdrawn))}
              className="flex-1 py-3.5 rounded-xl text-sm font-bold tracking-wide active:scale-95 transition-all disabled:opacity-60 disabled:cursor-wait"
              style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
            >
              {checkoutState.status === 'loading' || leavingForStripe || (barOnCore && coreBusy)
                ? 'Taking you to secure checkout…'
                : barOnCore
                  ? OFFER_COPY.stickyHeroCta
                  : starterStack
                  // Not "Checkout": there is no checkout to go to and no card
                  // to enter. The button raises the order and lands on the
                  // confirmation, and saying so is the difference between a
                  // partner pressing it and a partner hunting for the catch.
                  ? 'Place my free order →'
                  : stickyIsSub
                    ? 'Start subscription →'
                    : 'Checkout →'}
            </button>
          </div>
        </div>,
        document.body,
      )}

      {shareOpen && (
        <ShareSheet payload={sharePayload} onClose={() => setShareOpen(false)} />
      )}

      {swapSlot && (
        <ProductSwapModal
          slot={swapSlot}
          currentProduct={swapCurrentProduct}
          alternatives={swapAlternatives}
          onSelect={handleSelectSwap}
          onClose={() => setSwapSlot(null)}
        />
      )}

      {journeyOpen && (
        <SubscriptionJourney
          blueprint={activeBlueprint}
          products={products}
          answers={answers}
          level={activeLevel}
          usage={subscriptionUsage}
          onUsageChange={setSubscriptionUsage}
          onTrainingFrequencyChange={(freq) => setAnswer('trainingFrequency', freq)}
          changePolicy={changePolicy}
          onChangePolicyChange={setChangePolicy}
          onConfirm={() => { setSubscriptionCustomised(true); setPlanType('subscription'); setJourneyOpen(false) }}
          onClose={() => setJourneyOpen(false)}
        />
      )}

      {checkoutState.status === 'needs-account' && (
        <AccountGate
          payload={checkoutState.payload}
          onAuthenticated={resumeCheckout}
          onCancel={resetCheckout}
        />
      )}

      {/* Already signed in: the account gate never ran, so this is where the
          terms and the health disclaimer get shown. */}
      {checkoutState.status === 'needs-consent' && (
        <ConsentGate
          versions={checkoutState.versions}
          notice={checkoutState.notice}
          subscription={checkoutState.payload.subscription}
          onAccept={resumeCheckout}
          onCancel={resetCheckout}
        />
      )}
    </>
  )
}
