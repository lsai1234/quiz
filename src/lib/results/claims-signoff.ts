/**
 * The claims sign-off sheet: every authorised claim we can show, the products
 * on the roster it would be shown for, and the goals the goal-to-claim map
 * pairs with it. `scripts/claims-signoff.ts` writes it to docs/; a test keeps
 * the committed copy in step with the code.
 *
 * Two files, because they answer different questions:
 * - claims-signoff.csv: one row per kind and claim. "Is this wording right
 *   for these products, and may it be said next to these goals?"
 * - claims-signoff-no-claim.csv: roster products whose kind carries no
 *   authorised claim. Nothing about what they do is shown, and no goal line.
 */

import type { SwapGroup } from '@/lib/catalogue/types'
import { CLAIMS, CLAIMS_BY_KIND } from '@/lib/consult/claims'
import { GOAL_LABELS } from '@/lib/quiz-goals'
import { parseRosterCsv, type RosterRow } from '@/lib/supplier/roster-csv'
import { goalsBackedBy } from './goal-claims'

export const SIGNOFF_HEADER = [
  'swap_group', 'claim_id', 'claim_wording', 'condition_of_use', 'roster_products', 'goals_mapped',
] as const

export const NO_CLAIM_HEADER = ['sku', 'brand', 'name', 'swap_group', 'top25_rank'] as const

/** General health pairs with every claim (goal-claims.ts, ANY_CLAIM). */
export const GENERAL_HEALTH_NOTE = `${GOAL_LABELS.health} (any)`

/** Excel opens a UTF-8 file correctly only with the byte-order mark. */
const BOM = '﻿'

/** RFC 4180: quote a field holding a comma, quote or line break; double inner quotes. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) || value !== value.trim() ? `"${value.replace(/"/g, '""')}"` : value
}

function csv(rows: ReadonlyArray<readonly string[]>): string {
  return BOM + rows.map((r) => r.map(csvField).join(',')).join('\n') + '\n'
}

const productLabel = (r: RosterRow) => [r.sku, r.brand, r.name].filter(Boolean).join(' ')

export function claimsSignoffRows(roster: readonly RosterRow[]): string[][] {
  const rows: string[][] = []
  for (const [kind, ids] of Object.entries(CLAIMS_BY_KIND) as Array<[SwapGroup, string[]]>) {
    const products = roster.filter((r) => r.swapGroup === kind).map(productLabel).join(' | ')
    for (const id of ids) {
      const claim = CLAIMS[id]
      const goals = goalsBackedBy(kind, id).map((g) => GOAL_LABELS[g] ?? g)
      rows.push([
        kind,
        id,
        claim?.wording ?? '',
        claim?.condition ?? '',
        products,
        [...goals, GENERAL_HEALTH_NOTE].join('; '),
      ])
    }
  }
  return rows
}

export function noClaimRows(roster: readonly RosterRow[]): string[][] {
  return roster
    .filter((r) => (CLAIMS_BY_KIND[r.swapGroup] ?? []).length === 0)
    // The roster writes 0 for "not in the Top 25".
    .map((r) => [r.sku, r.brand, r.name, r.swapGroup, r.top25Rank != null && r.top25Rank > 0 ? String(r.top25Rank) : ''])
}

/** Both sheets, as file contents, from the roster CSV's text. */
export function buildClaimsSignoff(rosterCsv: string): { claims: string; noClaim: string; warnings: string[] } {
  const { rows, warnings } = parseRosterCsv(rosterCsv)
  return {
    claims: csv([[...SIGNOFF_HEADER], ...claimsSignoffRows(rows)]),
    noClaim: csv([[...NO_CLAIM_HEADER], ...noClaimRows(rows)]),
    warnings,
  }
}
