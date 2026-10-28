/**
 * The consult's review pack: every piece of health-related wording and every
 * safety rule, one row each, for pharmacist and legal sign-off
 * (`docs/amp-consult-offer-plan.md`, Phase 1, item 11). `scripts/consult-review-pack.ts` writes it to
 * `docs/consult-review-pack.csv`; a test keeps the committed copy in step, so a
 * change to any line here shows up as a change to the sheet.
 *
 * Built from the code, not copied from it. Rules that live inline in the stack
 * engine are read from its source (`engineSource`), so a reason added there is
 * a row here without anyone remembering to add it. Later phases add their own
 * copy (habit fixes, GP lines, bonus terms, hero rows) to `reviewPackRows`.
 *
 * Columns: a section, where it's used, its current wording, some context (what
 * the rule does, which products carry a claim), then three blank columns for
 * the reviewer: Approved, Change to, Notes. Rules carry what they do in the
 * wording column, so the row says what to check.
 */

import { CLAIMS, CLAIMS_BY_KIND } from './claims'
import { CIRCUIT_COPY, CIRCUIT_GROUPS, CIRCUIT_SHORT } from './circuit-copy'
import { STOP_COPY, circuitOutcome, type StopReason } from './circuit'
import { GLOSSARY } from './glossary'
import { PATTERNS } from './pinpoint/library'
import { PHARMACIST_HANDOFF_NOTE, PHARMACIST_NOTE, PHARMACIST_NOTE_TITLE } from './pharmacist-note'
import { CIRCUIT_LABEL, SYMPTOM_LABEL } from './summary'
import type { CircuitFlag, WeightSymptom } from './types'
import { parseRosterCsv, type RosterRow } from '@/lib/supplier/roster-csv'
import type { SwapGroup } from '@/lib/catalogue/types'
import { DEFAULT_BONUS } from '@/lib/offer/settings'
import { bonusTermRows, freeGiftTermRows, offerCopyRows } from '@/lib/offer/review-rows'
import { gpCheckRows, habitRows, readCopyRows } from './read-review-rows'
import { comboRows, hunchRows } from './hunch-review-rows'
import { proteinRows } from './protein-review-rows'

export const REVIEW_PACK_HEADER = ['Section', 'Where it’s used', 'Current wording', 'Context', 'Approved', 'Change to', 'Notes'] as const

export type ReviewRow = [section: string, where: string, wording: string, context?: string]
type Row = ReviewRow

const FLAGS = Object.keys(CIRCUIT_LABEL) as CircuitFlag[]

function circuitRows(): Row[] {
  const where = 'Circuit check (scenes/CircuitCheck.tsx)'
  const rows: Row[] = [
    ['Circuit check: items', where, CIRCUIT_COPY.question, 'Card heading before an answer'],
    ['Circuit check: items', where, CIRCUIT_COPY.questionTicking, 'Card heading after “Yes, some do”'],
    ['Circuit check: items', where, CIRCUIT_COPY.none],
    ['Circuit check: items', where, CIRCUIT_COPY.some],
  ]
  for (const g of CIRCUIT_GROUPS) {
    for (const f of g.flags) {
      rows.push(['Circuit check: items', `${where}, group “${g.label}”`, CIRCUIT_LABEL[f], `At-a-glance pill: “${CIRCUIT_SHORT[f]}”`])
    }
  }
  rows.push(
    ['Circuit check: consent', where, `${CIRCUIT_COPY.consent} ${CIRCUIT_COPY.consentDetail}`, 'Links: /legal/health-data and /legal/privacy. See docs/consult-privacy-drafts.md §3'],
    ['Circuit check: consent', where, CIRCUIT_COPY.consentNeeded, 'Shown when an answer is tapped before the tick'],
    ['Circuit check: items', where, CIRCUIT_COPY.mentionedEarlier, 'Weight-loss medication, pre-ticked from the goals card'],
    ['Weight loss: tailoring', where, `${CIRCUIT_COPY.tailor} ${CIRCUIT_COPY.tailorDetail}`, 'Second, optional consent'],
    ['Weight loss: tailoring', where, CIRCUIT_COPY.symptomsQuestion],
  )
  for (const s of Object.keys(SYMPTOM_LABEL) as WeightSymptom[]) rows.push(['Weight loss: tailoring', `${where}, symptoms`, SYMPTOM_LABEL[s]])
  rows.push(['Weight loss: tailoring', `${where}, symptoms`, CIRCUIT_COPY.symptomsNone])
  rows.push(['Circuit check: items', where, CIRCUIT_COPY.decline, 'Declines and stops the consult, keeping nothing'])
  return rows
}

function outcomeRows(): Row[] {
  const rows: Row[] = []
  for (const f of FLAGS) {
    const o = circuitOutcome({ circuit: { flags: [f], none: false }, healthConsent: { accepted: true, version: 'review', at: '' } })
    const where = `Circuit outcome for “${CIRCUIT_LABEL[f]}” (circuit.ts)`
    if (o.kind === 'stop') {
      rows.push(['Circuit check: outcomes', where, `STOP (${o.reason})`, 'Stop screen copy below'])
      continue
    }
    const why = [...new Set(Object.values(o.reasons))]
    rows.push([
      'Circuit check: outcomes',
      where,
      `Keep out: ${o.exclude.join(', ')}${o.pharmacistNote ? ' · pharmacist note' : ''}`,
      'Rule. Ingredient families are matched by product kind, title words and catalogue contraindications (knowledge.ts ingredientsOf)',
    ])
    for (const w of why) rows.push(['Circuit check: keep-out reasons', where, w, 'Shown as “Kept out: …, because …”'])
  }
  return rows
}

function stopRows(): Row[] {
  return (Object.keys(STOP_COPY) as StopReason[]).flatMap((r): Row[] => [
    ['Stop screens', `Stop screen: ${r} (circuit.ts STOP_COPY)`, STOP_COPY[r].title],
    ['Stop screens', `Stop screen: ${r}`, STOP_COPY[r].body],
    ['Stop screens', `Stop screen: ${r}`, STOP_COPY[r].who],
  ])
}

function pharmacistRows(): Row[] {
  const where = 'Results page pharmacist note (stack-review/ConsultNote.tsx, pharmacist-note.ts)'
  return [
    ['Pharmacist note', where, PHARMACIST_NOTE_TITLE],
    ['Pharmacist note', `${where}: prescription medicine`, PHARMACIST_NOTE.prescription, 'Blood thinners or other prescription medicine'],
    ['Pharmacist note', `${where}: weight-loss medication`, PHARMACIST_NOTE['weight-meds'], 'New in Phase 1'],
    ['Pharmacist note', `${where}: both`, PHARMACIST_NOTE.both, 'New in Phase 1'],
    ['Pharmacist note', 'Fully charged notes: prescription medicine (engine.ts)', PHARMACIST_HANDOFF_NOTE.prescription],
    ['Pharmacist note', 'Fully charged notes: weight-loss medication (engine.ts)', PHARMACIST_HANDOFF_NOTE['weight-meds'], 'New in Phase 1'],
    ['Pharmacist note', 'Fully charged notes: both (engine.ts)', PHARMACIST_HANDOFF_NOTE.both, 'New in Phase 1'],
  ]
}

/** A string or template literal, as written. */
const LITERAL = String.raw`('(?:[^'\\]|\\.)*'|\x60(?:[^\x60\\]|\\.)*\x60)`
const unquote = (s: string) => s.slice(1, -1)

/**
 * The comment block nearest above `index` (within a few lines), by its first
 * line, as the section a line sits in. Empty when there isn't one close by.
 */
function sectionAt(source: string, index: number): string {
  const before = source.slice(0, index).split('\n').reverse().slice(1, 16)
  const at = before.findIndex((l) => /^\s*\/\//.test(l))
  if (at < 0) return ''
  let first = at
  while (first + 1 < before.length && /^\s*\/\//.test(before[first + 1])) first++
  return before[first].replace(/^\s*\/\/\s?/, '').trim()
}

/** Whether the code just above `index` is about weight-loss medication. */
function aboutWeightLoss(source: string, index: number): boolean {
  const near = source.slice(0, index).split('\n').slice(-4).join('\n')
  return /weight-loss|tailor/i.test(sectionAt(source, index)) || /weight-meds|isTailored/.test(near)
}

/**
 * The stack engine's own words, read from its source: every reason a need is
 * raised for (`add(need, weight, why)`), every keep-out reason (`why… = '…'`,
 * `excluded.push({ why })`, the tailoring swaps in `proteinOut`) and every
 * fixed note. Template literals are listed as written, `${…}` and all.
 */
export function engineRows(engineSource: string): Row[] {
  const rows: Row[] = []
  const seen = new Set<string>()
  const push = (section: string, where: string, wording: string, notes?: string) => {
    const key = `${section}|${wording}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push([section, where, wording, notes])
  }
  const weightLoss = (index: number) => aboutWeightLoss(engineSource, index)

  for (const m of engineSource.matchAll(new RegExp(String.raw`add\('([a-z0-9-]+)',\s*(\d+(?:\.\d+)?),\s*${LITERAL}(?:,\s*(NEED))?\)`, 'g'))) {
    const section = weightLoss(m.index!) ? 'Weight loss: rules' : 'Engine reasons'
    // A reason that names a need is shown only where the consult claims map backs the product's claim (Phase 5).
    const shown = m[4] ? 'Names a need: shown only where the consult claims map backs the product’s claim, beside it' : 'Shown as the product’s reason'
    push(section, `Stack engine reason (engine.ts scoreNeeds)${sectionAt(engineSource, m.index!) ? `: ${sectionAt(engineSource, m.index!)}` : ''}`, unquote(m[3]), `Raises need “${m[1]}” by ${m[2]}. ${shown}`)
  }
  for (const m of engineSource.matchAll(new RegExp(String.raw`why(?:\.[a-z-]+|\[[^\]]+\])?\s*\?\?=\s*${LITERAL}`, 'g'))) {
    push('Engine keep-out reasons', `Stack engine keep-out (engine.ts runStackEngine)${sectionAt(engineSource, m.index!) ? `: ${sectionAt(engineSource, m.index!)}` : ''}`, unquote(m[1]), 'Shown as “Kept out: …, because …”')
  }
  for (const m of engineSource.matchAll(new RegExp(String.raw`why:\s*(?:[a-zA-Z]+\s*\?\s*|[^,}'\x60]*\?\?\s*)?${LITERAL}(?:\s*:\s*${LITERAL})?`, 'g'))) {
    for (const lit of [m[1], m[2]].filter(Boolean)) {
      push('Engine keep-out reasons', 'Stack engine keep-out (engine.ts runStackEngine)', unquote(lit), 'Shown as “Kept out: …” or “Skipped: …”')
    }
  }
  // The gate's own reasons (`consultGate` → `keepOut`): returned, or the fallback after `??`.
  const gateStart = engineSource.indexOf('keepOut(product) {')
  if (gateStart >= 0) {
    const gate = engineSource.slice(gateStart, engineSource.indexOf('\n  }\n}', gateStart))
    for (const m of gate.matchAll(new RegExp(String.raw`(?:return|\?\?)\s+${LITERAL}`, 'g'))) {
      push('Engine keep-out reasons', 'Stack engine keep-out (engine.ts consultGate)', unquote(m[1]), 'Shown as “Kept out: …” or “Skipped: …”')
    }
  }
  const protein = engineSource.slice(engineSource.indexOf('function proteinOut'), engineSource.indexOf('export function scoreNeeds'))
  for (const m of protein.matchAll(new RegExp(String.raw`return\s+${LITERAL}`, 'g'))) {
    push('Weight loss: rules', 'Stack engine, tailoring opt-in: protein kept out (engine.ts proteinOut)', unquote(m[1]), 'Shown as “Kept out: …, because …”')
  }
  for (const m of engineSource.matchAll(new RegExp(String.raw`notes\.push\(${LITERAL}\)`, 'g'))) {
    const section = weightLoss(m.index!) ? 'Weight loss: rules' : 'Engine reasons'
    push(section, 'Fully charged notes (engine.ts)', unquote(m[1]))
  }
  return rows
}

function weightLossRuleRows(): Row[] {
  return [
    [
      'Weight loss: rules',
      'Essentials, weight-loss medication with the tailoring opt-in (engine.ts pinnedNeeds)',
      'Essentials starts with protein (clear whey, then a bar, then plant protein, first, when they have nausea or a low appetite), then a multivitamin; then fibre if they have constipation; then electrolytes if they have nausea',
      'Rule',
    ],
  ]
}

function creatineRows(): Row[] {
  return [
    [
      'Creatine for older adults',
      'Pinpoint pattern “Keeping strong” (pinpoint/library.ts)',
      'The pattern adds protein (4) and vitamin D (2) but not creatine, until a pharmacist signs off creatine for older adults',
      'Rule. Creatine can still reach an older adult through a performance goal or a strength aim (engine.ts GOAL_NEEDS, scoreNeeds). Decide whether that should be gated too',
    ],
  ]
}

function patternRows(): Row[] {
  const rows: Row[] = []
  for (const p of PATTERNS) {
    const where = `Pinpoint pattern “${p.id}” (pinpoint/library.ts)`
    rows.push(['Patterns', `${where}: name`, p.name])
    rows.push(['Patterns', `${where}: line`, p.line])
    rows.push(['Patterns', `${where}: because`, p.because, `Product reason for: ${p.effects.map((e) => `${e.need} ${e.weight}`).join(', ')}`])
    if (p.keepOut) rows.push(['Patterns', `${where}: keep-out`, p.keepOut.why, `Keeps out: ${p.keepOut.ingredients.join(', ')}`])
    for (const n of p.nudges) {
      if (typeof n.why === 'string') rows.push(['Patterns', `${where}: evidence line`, n.why, `Nudge ${n.towards}${n.bodyMap ? ' · from the body map, never sent to AI' : ''}`])
    }
  }
  return rows
}

function glossaryRows(): Row[] {
  return Object.entries(GLOSSARY).map(([key, e]): Row => ['Glossary', `“What’s this?”: ${key} (glossary.ts)`, `${e.title}: ${e.body}`])
}

const productLabel = (r: RosterRow) => [r.sku, r.brand, r.name].filter(Boolean).join(' ')

function claimRows(roster: readonly RosterRow[]): Row[] {
  const rows: Row[] = []
  for (const [kind, ids] of Object.entries(CLAIMS_BY_KIND) as Array<[SwapGroup, string[]]>) {
    const products = roster.filter((r) => r.swapGroup === kind).map(productLabel)
    for (const id of ids) {
      const claim = CLAIMS[id]
      rows.push([
        'Claims',
        `CLAIMS_BY_KIND “${kind}” → ${id} (claims.ts)`,
        claim?.wording ?? '',
        `Condition of use: ${claim?.condition ?? '—'}. Products on the roster that would carry it: ${products.length ? products.join(' | ') : 'none'}`,
      ])
    }
  }
  return rows
}

/** Every row, in review order. */
export function reviewPackRows(input: { engineSource: string; rosterCsv: string }): Row[] {
  const roster = parseRosterCsv(input.rosterCsv).rows
  return [
    ...circuitRows(),
    ...outcomeRows(),
    ...stopRows(),
    ...pharmacistRows(),
    ...weightLossRuleRows(),
    ...creatineRows(),
    ...engineRows(input.engineSource),
    ...patternRows(),
    // Your read, Try this week and Worth a GP check (plan Phase 5).
    ...readCopyRows(),
    ...habitRows(),
    ...gpCheckRows(),
    // The hunch teaser and invite, and reactions that connect answers (plan Phase 6).
    ...hunchRows(),
    ...comboRows(),
    // The protein check (Phase 5 proposal 2, approved 2026-10-28).
    ...proteinRows(),
    ...glossaryRows(),
    ...claimRows(roster),
    // The free bonus's terms (plan Phase 2, 5): the conditions it has to
    // carry, as set by default; the results page's offer wording; and the
    // customer terms as drafted (plan Phase 4).
    ...bonusTermRows(DEFAULT_BONUS),
    ...offerCopyRows(DEFAULT_BONUS),
    ...freeGiftTermRows(DEFAULT_BONUS),
  ]
}

const field = (v: string) => (/[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v)

/** Rows as the sheet's CSV, with a BOM so Excel reads the curly quotes. */
export function reviewPackCsv(rows: readonly ReviewRow[]): string {
  const lines = [REVIEW_PACK_HEADER.map(field).join(',')]
  for (const [section, where, wording, context] of rows) {
    lines.push([section, where, wording, context ?? '', '', '', ''].map(field).join(','))
  }
  return '\uFEFF' + lines.join('\n') + '\n'
}

/** The whole sheet. */
export function buildReviewPack(input: { engineSource: string; rosterCsv: string }): string {
  return reviewPackCsv(reviewPackRows(input))
}
