/**
 * Bundle construction rules (Phase 5) — a post-selection pass over the chosen
 * slots that fixes the audit's headline quality defects:
 *
 *   1. Relevance floor — drop non-required slots the engine only added as
 *      low-confidence filler (the conf-0 creatine / conf-5 sleep-blend problem).
 *   2. Active-ingredient dedup — never two products sharing an active ingredient
 *      in one bundle (the double-magnesium / double-ashwagandha problem). Uses
 *      the curated `actives` data.
 *   3. Total dose caps — the summed dose of any active never exceeds its ceiling
 *      (a backstop for anything dedup leaves, e.g. two required products).
 *
 * Required slots are never dropped. Products without `actives` data pass through
 * the dedup/cap rules untouched, so the blast radius is exactly the curated core
 * we have dose data for. Each rule is independently switchable for rollback.
 */
import type { StackSlotEntry } from '@/lib/stack-blueprint/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { BundleRuleId } from '@/lib/stack-blueprint/explain-types'

/** Total daily dose ceilings, summed across the whole bundle (mg unless noted). */
export const DOSE_CAPS: Record<string, number> = {
  caffeine: 200,
  magnesium: 400,
  ashwagandha: 600,
  'vitamin-c': 1000,
  zinc: 25,
}

/** Rule toggles + the confidence floor. Flip a flag to roll a rule back. */
export const BUNDLE_RULES = {
  relevanceFloor: true,
  dedupActives: true,
  doseCaps: true,
  /** Non-required slots below this engine confidence (0–100) are filler. */
  confidenceFloor: 10,
}

/** A slot the rules pass removed, and the rule that removed it. */
export interface BundleRuleDrop {
  slotId: string
  productId: string
  rule: BundleRuleId
  /** dedup-active: the active already in the bundle. dose-cap: the active over its cap. */
  active?: string
  /** dose-cap only: the ceiling it would have gone over. */
  capMg?: number
}

export interface BundleRulesReport {
  kept: StackSlotEntry[]
  dropped: BundleRuleDrop[]
}

/**
 * Apply the construction rules to a set of selected slots. Returns a new slot
 * list (never empty when the input isn't — a degenerate all-dropped case keeps
 * the single highest-confidence pick).
 */
export function applyBundleRules(
  slots: StackSlotEntry[],
  catalogue: CatalogueProduct[],
  cfg = BUNDLE_RULES,
  caps: Record<string, number> = DOSE_CAPS,
): StackSlotEntry[] {
  return applyBundleRulesReport(slots, catalogue, cfg, caps).kept
}

/**
 * `applyBundleRules`, plus what it dropped and which rule dropped it. The first
 * rule that fires is the one reported. A slot brought back by the degenerate
 * keep-best case is not reported as dropped.
 */
export function applyBundleRulesReport(
  slots: StackSlotEntry[],
  catalogue: CatalogueProduct[],
  cfg = BUNDLE_RULES,
  caps: Record<string, number> = DOSE_CAPS,
): BundleRulesReport {
  const productOf = (id: string) => catalogue.find((p) => p.id === id)

  const kept: StackSlotEntry[] = []
  const dropped: Array<{ slot: StackSlotEntry; drop: BundleRuleDrop }> = []
  const usedActives = new Set<string>()
  const doseTotals: Record<string, number> = {}

  // Process most-important-first so the redundant/filler product is the one that
  // gets dropped, not the anchor.
  for (const slot of [...slots].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const actives = productOf(slot.selectedProductId)?.actives ?? []
    const drop = (rule: BundleRuleId, extra: Partial<BundleRuleDrop> = {}) =>
      dropped.push({ slot, drop: { slotId: slot.slotId, productId: slot.selectedProductId, rule, ...extra } })

    if (!slot.required) {
      // 1. Relevance floor.
      if (cfg.relevanceFloor && slot.confidenceScore < cfg.confidenceFloor) { drop('relevance-floor'); continue }
      // 2. Active-ingredient dedup — skip if it reintroduces an active already present.
      if (cfg.dedupActives) {
        const shared = actives.find((a) => usedActives.has(a.name))
        if (shared) { drop('dedup-active', { active: shared.name }); continue }
      }
      // 3. Dose caps — skip if adding it would push any active over its ceiling.
      if (cfg.doseCaps) {
        const over = actives.find((a) => a.mg != null && (doseTotals[a.name] ?? 0) + a.mg > (caps[a.name] ?? Infinity))
        if (over) { drop('dose-cap', { active: over.name, capMg: caps[over.name] }); continue }
      }
    }

    kept.push(slot)
    for (const a of actives) {
      usedActives.add(a.name)
      if (a.mg != null) doseTotals[a.name] = (doseTotals[a.name] ?? 0) + a.mg
    }
  }

  // Never return an empty bundle (degenerate config) — keep the best single pick.
  if (kept.length === 0 && slots.length > 0) {
    const best = [...slots].sort((a, b) => b.confidenceScore - a.confidenceScore)[0]
    return { kept: [best], dropped: dropped.filter((d) => d.slot !== best).map((d) => d.drop) }
  }
  return { kept, dropped: dropped.map((d) => d.drop) }
}
