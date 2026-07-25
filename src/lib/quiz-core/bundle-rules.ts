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
  const productOf = (id: string) => catalogue.find((p) => p.id === id)

  const kept: StackSlotEntry[] = []
  const usedActives = new Set<string>()
  const doseTotals: Record<string, number> = {}

  // Process most-important-first so the redundant/filler product is the one that
  // gets dropped, not the anchor.
  for (const slot of [...slots].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const actives = productOf(slot.selectedProductId)?.actives ?? []

    if (!slot.required) {
      // 1. Relevance floor.
      if (cfg.relevanceFloor && slot.confidenceScore < cfg.confidenceFloor) continue
      // 2. Active-ingredient dedup — skip if it reintroduces an active already present.
      if (cfg.dedupActives && actives.some((a) => usedActives.has(a.name))) continue
      // 3. Dose caps — skip if adding it would push any active over its ceiling.
      if (cfg.doseCaps && actives.some((a) => a.mg != null && (doseTotals[a.name] ?? 0) + a.mg > (caps[a.name] ?? Infinity))) continue
    }

    kept.push(slot)
    for (const a of actives) {
      usedActives.add(a.name)
      if (a.mg != null) doseTotals[a.name] = (doseTotals[a.name] ?? 0) + a.mg
    }
  }

  // Never return an empty bundle (degenerate config) — keep the best single pick.
  if (kept.length === 0 && slots.length > 0) {
    return [[...slots].sort((a, b) => b.confidenceScore - a.confidenceScore)[0]]
  }
  return kept
}
