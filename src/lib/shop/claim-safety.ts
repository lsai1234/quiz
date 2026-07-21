/**
 * Claim-safety guard for authored product copy.
 *
 * Supplement copy has to stay structure/function ("supports", "helps you…",
 * "made for…") and must not promise medical outcomes or guaranteed results.
 * This flags the clear-cut offenders — proven / cure / treat / prevent /
 * guarantee / "see results" / "speeds up" / eliminates — so a copy pass (and a
 * unit test over the catalogue) can keep every card and sheet on the safe side.
 *
 * It is a deliberately conservative lint over copy WE author (the mock catalogue,
 * and anything a future seed writes into `chrgd.safe_wording`). It intentionally
 * leaves the accepted structure/function verbs ("support", "help", "maintain")
 * alone, and isn't run at request time.
 */

interface RiskyPattern {
  re: RegExp
  /** Why it's risky — surfaced in the flag so a fix is obvious. */
  why: string
}

const RISKY_PATTERNS: RiskyPattern[] = [
  { re: /\bproven\b/i, why: 'implies a proven/guaranteed effect' },
  { re: /\bclinically proven\b/i, why: 'medical efficacy claim' },
  { re: /\bcures?\b/i, why: 'medical (cure) claim' },
  { re: /\bcured\b/i, why: 'medical (cure) claim' },
  { re: /\btreats?\b/i, why: 'implies treating a condition' },
  { re: /\bprevents?\b/i, why: 'implies preventing a condition' },
  { re: /\bguarantee[ds]?\b/i, why: 'guaranteed-result claim' },
  { re: /\b(?:see|get)\s+results\b/i, why: 'promises a result' },
  { re: /\bspeeds?\s+up\b/i, why: 'efficacy (speeds up) claim' },
  { re: /\beliminates?\b/i, why: 'absolute (eliminates) claim' },
]

export interface ClaimFlag {
  /** The exact text that tripped the check. */
  match: string
  why: string
}

/** Every risky phrase in a single string of copy (empty when it's clean). */
export function claimFlags(copy: string | null | undefined): ClaimFlag[] {
  if (!copy) return []
  const flags: ClaimFlag[] = []
  for (const { re, why } of RISKY_PATTERNS) {
    const m = copy.match(re)
    if (m) flags.push({ match: m[0], why })
  }
  return flags
}

/** True when a string of copy is free of risky claims. */
export function isClaimSafe(copy: string | null | undefined): boolean {
  return claimFlags(copy).length === 0
}
