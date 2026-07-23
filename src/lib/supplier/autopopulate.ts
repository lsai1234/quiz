/**
 * AI attribute autopopulate (Phase 1b).
 *
 * PowerBody sends commerce basics; our `CatalogueProduct` needs the CHRGD-only
 * attributes on top. This layers over the existing classifier
 * (`portal/ai-classify` — OpenAI with a deterministic heuristic fallback) and
 * adds the two things it doesn't cover:
 *   • a claim-safe `shortReason` (card copy), and
 *   • `effectOnset` + stimulant `warnings`.
 *
 * Claim safety is HARD-GATED: generated copy may only be grounded in
 * `APPROVED_CLAIMS` for the product's swap group. Anything that isn't is
 * dropped and replaced with an approved phrase (or left blank) — the model can
 * never introduce a new health claim. The founder reviews everything in the
 * Products editor before it goes live.
 */
import type { CatalogueProduct, SwapGroup } from '@/lib/catalogue/types'
import { aiClassifyProduct } from '@/lib/portal/ai-classify'
import { APPROVED_CLAIMS } from '@/lib/stack-blueprint/approved-claims'
import { onsetForSlot } from '@/lib/feedback'

/** Turn an approved structure/function claim into a short, sentence-case card line. */
function toCardLine(claim: string): string {
  const s = claim.trim()
  const sentence = s.charAt(0).toUpperCase() + s.slice(1)
  return sentence.endsWith('.') ? sentence : `${sentence}.`
}

/**
 * The claim-safety gate. A reason is safe when it is empty, or grounded in one
 * of the approved claims for its swap group (case-insensitive substring match in
 * either direction, tolerant of the sentence-case/period wrapping we add).
 */
export function isClaimSafe(reason: string, swapGroup: SwapGroup): boolean {
  const text = reason.trim().toLowerCase().replace(/\.$/, '')
  if (!text) return true
  const claims = APPROVED_CLAIMS[swapGroup] ?? []
  return claims.some((c) => {
    const cl = c.toLowerCase()
    return text.includes(cl) || cl.includes(text)
  })
}

/**
 * A claim-safe short reason for a swap group. `candidate` (e.g. AI-written copy)
 * is used only if it passes the gate; otherwise we fall back to the first
 * approved claim, or '' when a group has none (e.g. 'general').
 */
export function claimSafeReason(swapGroup: SwapGroup, candidate?: string): string {
  if (candidate && isClaimSafe(candidate, swapGroup)) return candidate.trim()
  const approved = APPROVED_CLAIMS[swapGroup] ?? []
  return approved.length > 0 ? toCardLine(approved[0]) : ''
}

export interface AutopopulateResult {
  patch: Partial<CatalogueProduct>
  source: 'ai' | 'heuristic'
}

/**
 * Full autopopulate for a product: classification (via the shared classifier)
 * plus claim-safe copy, effect onset and stimulant warnings. Returns a patch to
 * merge onto the mapped product before it's added / for the founder to review.
 */
export async function autopopulateProduct(product: CatalogueProduct): Promise<AutopopulateResult> {
  const { patch: classification, source } = await aiClassifyProduct(product)

  const swapGroup = (classification.swapGroup ?? product.swapGroup) as SwapGroup
  const stackSlots = classification.stackSlots ?? product.stackSlots
  const primarySlot = stackSlots[0] ?? 'health'
  const hasStimulants = classification.hasStimulants ?? product.hasStimulants

  // Only generate copy when the product doesn't already have it, so re-running
  // never clobbers a founder's hand-written reason.
  const shortReason = product.shortReason?.trim() ? product.shortReason : claimSafeReason(swapGroup)

  const warnings = new Set(product.warnings ?? [])
  if (hasStimulants) warnings.add('Contains caffeine')

  return {
    source,
    patch: {
      ...classification,
      shortReason,
      effectOnset: product.effectOnset ?? onsetForSlot(primarySlot),
      warnings: [...warnings],
    },
  }
}
