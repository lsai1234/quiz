/**
 * The consult claims sign-off (plan Phase 5): the sheet for the needs and
 * patterns map (`consult-claims.ts`), and the report of every persona's
 * product reasons it changes. `scripts/consult-claims-signoff.ts` writes both
 * to docs/; a test keeps the committed copies in step.
 *
 *   docs/consult-claims-signoff.csv   one row per need or pattern and claim:
 *                                     "may this be said next to this product?"
 *   docs/consult-reason-changes.md    each persona's products: the reason
 *                                     before Phase 5, now (map not live), and
 *                                     once the map is signed off
 */
import { createHash } from 'crypto'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { CLAIMS } from '@/lib/consult/claims'
import { stopReason } from '@/lib/consult/circuit'
import { runStackEngine, scoreNeeds } from '@/lib/consult/engine'
import { kindOf, NEEDS, type NeedId } from '@/lib/consult/knowledge'
import { PATTERN_BY_ID } from '@/lib/consult/pinpoint/library'
import { PERSONAS } from '@/lib/consult/personas'
import type { PatternId } from '@/lib/consult/pinpoint/types'
import { csvField } from './claims-signoff'
import { CONSULT_CLAIMS_SIGNOFF, NEED_CLAIMS, PATTERN_CLAIMS, previewConsultClaims } from './consult-claims'

const BOM = '﻿'

export const CONSULT_SIGNOFF_HEADER = ['type', 'id', 'name', 'swap_group', 'claim_id', 'claim_wording', 'note'] as const

/** What a need is, in words, for the sheet. */
const NEED_WORDS: Record<NeedId, string> = {
  protein: 'Getting enough protein',
  strength: 'Keeping or building strength',
  recovery: 'Recovering between sessions',
  hydration: 'Fluids and salts',
  joints: 'Joints',
  collagen: 'Collagen',
  'low-sun': 'Too little daylight (vitamin D)',
  omega: 'Little or no oily fish',
  sleep: 'Sleep',
  stress: 'Stress',
  energy: 'Energy through the day',
  focus: 'Focus',
  basics: 'Covering the basics',
  'b12-iron': 'B12 and iron on a plant-based plate',
  gut: 'Gut',
  immunity: 'Immune system',
}

export function consultSignoffRows(): string[][] {
  const rows: string[][] = []
  const push = (type: string, id: string, name: string, links: readonly { kind: string; claimIds: readonly string[] }[]) => {
    if (links.length === 0) {
      rows.push([type, id, name, '', '', '', 'No authorised claim speaks to it: habit fixes only, no product named for it'])
      return
    }
    for (const link of links) for (const claimId of link.claimIds) rows.push([type, id, name, link.kind, claimId, CLAIMS[claimId]?.wording ?? '', ''])
  }
  for (const need of NEEDS) push('need', need, NEED_WORDS[need], NEED_CLAIMS[need])
  for (const [id, links] of Object.entries(PATTERN_CLAIMS) as Array<[PatternId, typeof PATTERN_CLAIMS[PatternId]]>) push('pattern', id, PATTERN_BY_ID[id].name, links)
  return rows
}

export function consultSignoffCsv(): string {
  return BOM + [CONSULT_SIGNOFF_HEADER as readonly string[], ...consultSignoffRows()].map((r) => r.map(csvField).join(',')).join('\n') + '\n'
}

export function consultSignoffSha256(csv = consultSignoffCsv()): string {
  return createHash('sha256').update(csv, 'utf8').digest('hex')
}

/** Signed off when a record exists and it is this exact sheet. */
export function consultSignoffStatus(csv = consultSignoffCsv()): { signed: boolean; sha256: string } {
  const sha256 = consultSignoffSha256(csv)
  return { signed: CONSULT_CLAIMS_SIGNOFF?.sha256 === sha256, sha256 }
}

/** The reason before Phase 5: the strongest source behind the product's top need, whatever it named. */
function reasonBefore(answers: (typeof PERSONAS)[number]['answers'], productId: string): string {
  const needs = scoreNeeds(answers)
  const product = MOCK_CATALOGUE.find((p) => p.id === productId)!
  const kind = kindOf(product)
  let top: { need: NeedId; value: number } | null = null
  for (const [need, affinity] of Object.entries(kind?.meets ?? {}) as [NeedId, number][]) {
    const value = needs[need].total * affinity
    if (value > 0 && (!top || value > top.value)) top = { need, value }
  }
  if (!top) return ''
  return [...needs[top.need].sources].sort((x, y) => y.weight - x.weight || x.why.localeCompare(y.why))[0]?.why ?? ''
}

export function reasonChangesReport(): string {
  const lines = [
    '# Consult product reasons: what Phase 5 changes',
    '',
    'Written by `npm run claims:signoff:consult` from the persona suite and the mock catalogue. For each persona, every product in its Complete tier: the reason before Phase 5, the reason now (the needs and patterns map is not live until signed off), and the reason once it is. A reason names a goal, a need or a pattern only where the claims maps back the claim the product carries; otherwise it restates an answer, or says "Picked from your answers".',
    '',
  ]
  let changed = 0
  for (const persona of PERSONAS) {
    if (stopReason(persona.answers)) continue
    previewConsultClaims(false)
    const now = runStackEngine(persona.answers, MOCK_CATALOGUE)
    previewConsultClaims(true)
    const signed = runStackEngine(persona.answers, MOCK_CATALOGUE)
    previewConsultClaims(null)
    const rows: string[] = []
    for (const r of now.ranked) {
      const before = reasonBefore(persona.answers, r.id)
      const after = signed.ranked.find((x) => x.id === r.id)?.reason ?? r.reason
      if (before === r.reason && after === r.reason) continue
      changed++
      rows.push(`| ${r.title} | ${before} | ${r.reason} | ${after} |`)
    }
    if (rows.length === 0) continue
    lines.push(`## ${persona.id}: ${persona.who}`, '', '| Product | Before | Now | Once signed off |', '| --- | --- | --- | --- |', ...rows, '')
  }
  lines.splice(4, 0, `${changed} reasons change.`, '')
  return lines.join('\n')
}
