'use client'

import { Icon } from '@/components/ui/Icon'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { selectStatAxes } from '@/lib/stack-stats'
import type { StackSlotEntry } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { SLOT_LABELS } from '@/lib/catalogue/types'
import { inStockOnly } from '@/lib/catalogue/filters'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { useStackCheckout } from '@/hooks/useStackCheckout'
import { StackHero } from './StackHero'
import { StackDeck } from './StackDeck'
import { PlanReceipt } from './PlanReceipt'
import { SubscriptionProtocol } from './SubscriptionProtocol'
import { ScratchToReveal, scratchRevealAvailable } from './ScratchToReveal'
import { PartnerCodeBox, type AppliedCode } from '@/components/checkout/PartnerCodeBox'
import { clearStarterCode } from '@/lib/partner-starter/handoff'
import { SubscriptionJourney, type ChangePolicySelection } from './SubscriptionJourney'
import { CheckoutSuccess } from './CheckoutSuccess'
import { receiptItemsFromSlots } from '@/lib/receipt/build'
import { ProductSwapModal } from './ProductSwapModal'
import { UpgradesCard } from './UpgradesCard'
import { defaultVariantId } from '@/lib/catalogue/variants'
import { AccountGate } from '@/components/auth/AccountGate'
import { ShareSheet } from '@/components/share-card/ShareSheet'
import { ShareStackButton } from '@/components/share-card/ShareStackButton'
import { buildSharePayload } from '@/lib/share-card/payload'
import { ConsentGate } from '@/components/legal/ConsentGate'
import { funnel } from '@/lib/analytics/quiz'
import type { StackLevel, Goal } from '@/lib/types'
import { TIER_META } from '@/lib/quiz-core'

// Compact goal labels for the honest "no strong match" note.
const GOAL_LABEL: Partial<Record<Goal, string>> = {
  'sleep-better': 'sleep', 'less-stress': 'stress', focus: 'focus', immune: 'immunity',
  'skin-hair-nails': 'skin, hair & nails', 'gut-health': 'gut health', menopause: 'menopause support',
  muscle: 'muscle', energy: 'energy', performance: 'performance', hydration: 'hydration',
  recovery: 'recovery', health: 'general health', cutting: 'getting lean', bulking: 'gaining mass',
}

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
  tiers, current, minMonthly, onChange,
}: {
  tiers: TierPlan[]
  current: StackLevel
  /** The monthly floor a subscription has to clear to be offerable at all. */
  minMonthly: number
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
          const active = current === level
          // A subscription this small cannot be placed, so this depth has no
          // monthly price to advertise. Same floor the plan tab enforces.
          const canSub = monthly > 0 && monthly >= minMonthly
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
                {meta.label}
              </div>
              <div className="text-[10px] mt-0.5 leading-tight" style={{ color: 'var(--color-muted)' }}>
                {size} product{size === 1 ? '' : 's'}
              </div>
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
                  <div
                    className="text-[11px] font-bold uppercase tracking-wide mt-1.5 leading-tight"
                    style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}
                  >
                    Monthly unavailable
                  </div>
                  <div className="text-[10px] mt-1 leading-tight" style={{ color: 'var(--color-text)' }}>
                    {formatGBP(oneOff)} one-off
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

export function StackReviewPage() {
  const {
    stackBlueprint, setStackBlueprint, planType, setPlanType, answers, setAnswer,
    stackLevel, setStackLevel, subscriptionUsage, setSubscriptionUsage, subscriptionCustomised, setSubscriptionCustomised,
    revealedIntroDiscount, setRevealedIntroDiscount, identity,
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

  // Default any slot without a selected variant to the product's first available
  // variant so the selector and price always agree.
  const blueprint = useMemo(() => {
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
  /** `'oneoff'` while a starter stack is applied, else nothing to say. */
  const starterPlanType = partnerCode?.starter ? ('oneoff' as const) : null

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
  const tierPlans = useMemo(
    () => planTiers(blueprint, products, answers, undefined, priceOpts),
    [blueprint, products, answers, priceOpts],
  )
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
  const handleCheckout = useCallback(
    () =>
      checkout(
        activeBlueprint,
        products,
        starterPlanType ?? planType,
        answers,
        subOpts,
      ),
    [checkout, activeBlueprint, products, starterPlanType, planType, answers, subOpts],
  )

  // Shared top-trumps axes for the deck — the user's own goals, so every card
  // compares on the same footing.
  const statAxes = useMemo(() => selectStatAxes(activeBlueprint, products), [activeBlueprint, products])
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
   * the customer is actually looking at when they press Share.
   *
   * `answers.name` is passed to be *stripped*: the engine writes reasons
   * addressed to the customer ("Chosen for Sam — …"), so the name reaches the
   * card through what looks like product copy unless the builder is told to
   * remove it. Showing it is the separate `showFirstName` flag, and it stays off
   * until there is a control for it.
   */
  const sharePayload = useMemo(
    () =>
      buildSharePayload(activeBlueprint, identity, products, {
        customerName: answers.name,
        code: partnerCode?.code ?? null,
      }),
    [activeBlueprint, identity, products, answers.name, partnerCode],
  )

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
  const starterStack = partnerCode?.starter
    ? { label: `${partnerCode.founderLabel ?? 'Starter stack'}` }
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
    if (checkoutState.status === 'mock-complete') clearStarterCode()
  }, [checkoutState.status])
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

  const showStickyBar = !swapSlot && !journeyOpen && !shareOpen && !ctaOnScreen
    && checkoutState.status !== 'needs-account'
    && checkoutState.status !== 'needs-consent'
  const leavingForStripe = checkoutState.status === 'redirecting'

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
  const offerableProducts = useMemo(() => inStockOnly(products), [products])

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

  if (!blueprint || catalogueLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[var(--color-muted)] text-sm">Building your stack…</p>
      </div>
    )
  }

  // No catalogue at all — say so, rather than rendering a page of empty cards.
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 min-h-[60vh] px-8 text-center">
        <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          We couldn’t load the shop
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          {catalogueError ?? 'The catalogue came back empty, so there’s nothing to build your stack from yet.'}
        </p>
      </div>
    )
  }

  // A mock sample stack has no meaning against the real shop — its product ids
  // don't exist there. Ask for the quiz rather than render unresolvable cards.
  if (!stackBlueprint && isLive) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 min-h-[60vh] px-8 text-center">
        <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Your stack isn’t here yet
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          Take the quiz and we’ll build one from the products we actually stock.
        </p>
      </div>
    )
  }

  // Only the MOCK path confirms in place. A real payment leaves this page for
  // Stripe and confirms on /order/confirmation, after the server has verified
  // the session — rendering success here during the redirect is DEF-001.
  if (checkoutState.status === 'mock-complete') {
    return (
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
    )
  }

  return (
    <>
      <div className="pb-28">
        <StackHero
          blueprint={activeBlueprint}
          productCount={activeSlots.length}
          totalPrice={pricing.oneOffTotal}
          monthlyPrice={pricing.subscriptionTotal}
          canSubscribe={pricing.subscriptionItemCount > 0 && pricing.subscriptionMinOrderMet}
        />

        <div className="h-px bg-[var(--color-border)] mx-5" />

        {/* Honest "no strong match" note — a chosen goal whose only products were
            removed by a hard gate (safety / dietary). Surfaced, never silently dropped. */}
        {(activeBlueprint.unmetGoals?.length ?? 0) > 0 && (
          <div
            className="mx-5 max-w-lg lg:mx-auto mt-5 rounded-2xl border px-4 py-3"
            style={{ borderColor: 'var(--color-border-2)', background: 'var(--color-surface)' }}
          >
            <p className="text-xs font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              One thing we couldn’t match
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              We didn’t find a suitable product for{' '}
              {(activeBlueprint.unmetGoals ?? []).map((g) => GOAL_LABEL[g] ?? g).join(', ')}{' '}
              given your answers, so we’ve left it out rather than suggest something that isn’t right for you. It’s worth a chat with your GP or pharmacist.
            </p>
          </div>
        )}

        {/* Value-first depth selector — choose Essentials / Balanced / Complete,
            each filled to its own monthly price band, so value comes first. */}
        {showTiers && (
          <div className="pt-6">
            <StackTierSelector
              tiers={tierPlans}
              current={activeLevel}
              minMonthly={getPricingConfig().minSubscriptionMonthly}
              onChange={setStackLevel}
            />
          </div>
        )}

        {/* Core + added booster product cards — a swipeable top-trumps deck */}
        <div ref={stackRef} className="pt-7" style={{ scrollMarginTop: 16 }}>
          <p
            className="px-5 max-w-lg mx-auto text-[10px] font-bold tracking-widest uppercase text-[var(--color-muted)] mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {`Your personalised stack — ${activeSlots.length} products · swipe to compare`}
          </p>
          <StackDeck
            slots={activeSlots}
            products={products}
            planType={planType}
            axes={statAxes}
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
                ? <UpgradesCard boosters={boosters} axes={statAxes} onAdd={handleAddBooster} />
                : undefined
            }
          />
        </div>

        {/* Divider before pricing */}
        <div className="h-px bg-[var(--color-border)] mx-5 mt-8" />

        {/* Price summary + checkout */}
        <div id="scene-plan" className="px-5 pt-6 max-w-lg mx-auto scroll-mt-20">
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
          <div className="mb-3 flex flex-col">
            <PartnerCodeBox
              subtotal={planType === 'subscription' ? pricing.subscriptionTotal : pricing.oneOffSubtotal}
              applied={partnerCode}
              onChange={setPartnerCode}
            />
          </div>

          {/* The high-level receipt — what you're buying, discounts, total */}
          <PlanReceipt
            slots={activeSlots}
            products={products}
            subscriptionPlan={subscriptionPlan}
            slotTitleById={slotTitleById}
            pricing={pricing}
            planType={planType}
            onPlanChange={setPlanType}
            onCheckout={handleCheckout}
          partnerCode={partnerCode?.code ?? null}
            starterStack={starterStack}
            onCustomise={() => stackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            isLoading={checkoutState.status === 'loading'}
            onCtaRef={setCtaEl}
          />

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
            <ShareStackButton payload={sharePayload} onOpen={() => setShareOpen(true)} />
          </div>
        </div>
      </div>

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
                {starterStack ? 'To pay' : stickyIsSub ? 'Monthly' : 'One-off total'}
              </p>
              <p className="text-xl font-black leading-none" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                {formatGBP(stickyTotal)}
                {stickyIsSub && <span className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>/mo</span>}
              </p>
            </div>
            <button
              onClick={handleCheckout}
              disabled={checkoutState.status === 'loading' || leavingForStripe}
              className="flex-1 py-3.5 rounded-xl text-sm font-bold tracking-wide active:scale-95 transition-all disabled:opacity-60 disabled:cursor-wait"
              style={{ background: 'var(--color-accent)', color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
            >
              {checkoutState.status === 'loading' || leavingForStripe
                ? 'Taking you to secure checkout…'
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
