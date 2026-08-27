/**
 * Reading a curated roster CSV — the list of products a founder has decided to
 * sell, with the judgement calls PowerBody cannot make for us.
 *
 * WHAT THIS FILE IS FOR
 * ─────────────────────
 * The supplier answers "what is this product": name, picture, category, cost,
 * stock. It cannot answer "what is it FOR" — which swap group it belongs to,
 * what is in it, who must not take it, whether it counts as a drink. Those are
 * the fields the quiz actually reads, and they are decided offline in a
 * spreadsheet because deciding them a product at a time in a web form is how a
 * hundred-product roster never gets finished.
 *
 * So the CSV is the curation and `getProductInfo` is the description. Neither is
 * complete alone: a row here with no supplier behind it has no picture, and a
 * supplier product with no row has no idea what slot it fills.
 *
 * PRICES ARE NOT READ FROM THE SHEET AT ALL. A cost column is a snapshot of what
 * the supplier charged on the day it was typed, and pricing a live shop off that
 * is how a stale figure becomes a real margin. Cost comes from PowerBody, and
 * the shelf price is computed from it by our own rule — so a product we cannot
 * reach the supplier for arrives UNPRICED and says so, rather than arriving
 * confidently wrong.
 *
 * Pure parsing — no I/O, no network — so the column handling is testable without
 * standing up a request or a supplier.
 */
import type { SwapGroup, DietaryTag, SafetyFlag } from '@/lib/catalogue/types'

/** Every swap group the engine actually knows. A row naming anything else is
 *  reported rather than quietly filed under `general`, which is a readiness
 *  failure and silently costs the product its swap depth and affinity bonus. */
const VALID_SWAP_GROUPS = new Set<string>([
  'protein-whey', 'protein-plant', 'protein-mass', 'protein-clear', 'creatine',
  'pre-workout-stim', 'pre-workout-stim-free', 'aminos', 'electrolytes', 'omega-3',
  'magnesium', 'vitamin-d', 'multivitamin', 'collagen', 'joint-support', 'sleep-support', 'fat-burner',
  'adaptogen', 'probiotic', 'greens', 'fibre', 'menopause', 'vitamin-c',
  'protein-bar', 'nootropic', 'vitamin-b', 'zma', 'energy-gel', 'accessory', 'general',
])

/**
 * Spreadsheet spellings that mean a group the engine has under another name.
 *
 * Only for genuine synonyms. A group the engine has no equivalent for is NOT
 * mapped to something adjacent — being wrong about what a product is for is
 * worse than admitting we do not know, because the engine will then recommend
 * it to the wrong person with full confidence.
 */
const SWAP_GROUP_ALIASES: Record<string, SwapGroup> = {
  'mass-gainer': 'protein-mass',
  'mass gainer': 'protein-mass',
  gainer: 'protein-mass',
  whey: 'protein-whey',
  'plant-protein': 'protein-plant',
  'clear-whey': 'protein-clear',
  electrolyte: 'electrolytes',
  omega3: 'omega-3',
  'vitamin-d3': 'vitamin-d',
  probiotics: 'probiotic',
  'protein bar': 'protein-bar',
  bar: 'protein-bar',
  'vitamin-b-complex': 'vitamin-b',
  'b-complex': 'vitamin-b',
  'vitamin b': 'vitamin-b',
  gel: 'energy-gel',
  nootropics: 'nootropic',
  shaker: 'accessory',
  accessories: 'accessory',
}

export interface RosterRow {
  sku: string
  brand: string
  name: string
  swapGroup: SwapGroup
  /** The spelling the sheet used, when it was not one the engine knows. */
  unrecognisedSwapGroup: string | null
  servings: number | null
  weightGrams: number | null
  stock: number | null
  formats: string[]
  dietaryTags: DietaryTag[]
  hasStimulants: boolean
  contraindications: SafetyFlag[]
  /** Free-text safety notes the engine has no flag for — kept as a warning so a
   *  real contraindication is never silently dropped on the floor. */
  otherWarnings: string[]
  actives: Array<{ name: string; mg?: number }>
  subscriptionEligible: boolean
  /** Every SKU that is a flavour of this one product, this one included. */
  variantSkus: string[]
  top25Rank: number | null
  recommendationPriority: number | null
  shortReason: string
}

export interface RosterParse {
  rows: RosterRow[]
  /** Row-level problems, each naming the SKU, for a person to read. */
  warnings: string[]
}

const clean = (v: string | undefined): string => (v ?? '').trim().replace(/^"|"$/g, '')

function num(v: string | undefined): number | null {
  const s = clean(v)
  if (s === '') return null
  const n = Number(s.replace(/[£,]/g, ''))
  return Number.isFinite(n) ? n : null
}

function bool(v: string | undefined): boolean {
  return /^(true|yes|1|y)$/i.test(clean(v))
}

/** A list column: comma-separated, tolerant of stray spaces and empty entries. */
function list(v: string | undefined): string[] {
  return clean(v)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '' && s !== '-')
}

const DIETARY: Record<string, DietaryTag> = {
  vegan: 'vegan', vegetarian: 'vegetarian', 'gluten-free': 'gluten-free',
  'dairy-free': 'dairy-free', 'nut-free': 'nut-free', halal: 'halal', 'keto-friendly': 'keto-friendly',
}

/**
 * Read the safety column into the flags the engine gates on, keeping anything it
 * cannot represent as a visible warning.
 *
 * The engine gates on three flags, because those are the three the safety screen
 * asks about. A sheet saying "thyroid medication" or "SSRIs" means medication;
 * "crustacean" means shellfish. Anything it cannot represent is kept as a
 * visible warning rather than dropped, because silently discarding a
 * contraindication is the worst possible handling of a safety field.
 */
function safety(v: string | undefined): { flags: SafetyFlag[]; other: string[] } {
  const flags = new Set<SafetyFlag>()
  const other: string[] = []
  for (const entry of list(v)) {
    const lower = entry.toLowerCase()
    if (lower.includes('pregnan') || lower.includes('breastfeed')) flags.add('pregnancy')
    else if (lower.includes('shellfish') || lower.includes('crustacean')) flags.add('shellfish')
    else if (lower.includes('medication') || lower.includes('ssri') || lower.includes('thinner')) flags.add('medication')
    else other.push(entry)
  }
  return { flags: [...flags], other }
}

/** "ashwagandha 300mg, magnesium 400 mg" → the dose data dedup and caps read. */
export function parseActives(v: string | undefined): Array<{ name: string; mg?: number }> {
  return list(v).map((raw) => {
    // Real sheets write the dose with a basis attached — "22g/serving",
    // "500mg per serving". The number is the useful part and the basis is
    // already implied (everything here is per serving), so it is trimmed rather
    // than defeating the match: without this every dose in the file parses as
    // a nameless blob and the dedup and cap rules have nothing to compare.
    const entry = raw.replace(/\s*(\/|\bper\b)\s*(serving|serve|dose|capsule|cap|scoop|tablet)s?\s*$/i, '').trim()
    const match = entry.match(/^(.*?)[\s,]*([\d.]+)\s*(mg|g|mcg|iu|bn|billion)?\s*$/i)
    if (!match) return { name: entry.toLowerCase() }
    const name = match[1].trim().toLowerCase()
    const value = Number(match[2])
    const unit = (match[3] ?? 'mg').toLowerCase()
    if (name === '' || !Number.isFinite(value)) return { name: entry.toLowerCase() }
    // Only milligrams are comparable against the dose caps; anything counted in
    // IU or billions of cultures is a different scale and is carried unmeasured
    // rather than converted into a number that would be compared wrongly.
    if (unit === 'mg') return { name, mg: value }
    if (unit === 'g') return { name, mg: value * 1000 }
    if (unit === 'mcg') return { name, mg: value / 1000 }
    return { name }
  })
}

function splitDelimited(line: string, delimiter: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      // A doubled quote inside a quoted field is one literal quote.
      if (quoted && line[i + 1] === '"') { field += '"'; i++ } else quoted = !quoted
    } else if (c === delimiter && !quoted) {
      out.push(field)
      field = ''
    } else field += c
  }
  out.push(field)
  return out
}

/**
 * Parse a roster CSV.
 *
 * Handles the comma files a spreadsheet exports and the semicolon ones
 * PowerBody's own feed uses, and quoted fields containing either — product
 * names are full of commas ("Ashwagandha, 300mg - 120 vcaps") and a naive split
 * turns one product into two.
 */
export function parseRosterCsv(text: string): RosterParse {
  const warnings: string[] = []
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return { rows: [], warnings: ['The file has no rows under its header.'] }

  const delimiter = lines[0].split(';').length > lines[0].split(',').length ? ';' : ','
  const header = splitDelimited(lines[0], delimiter).map((h) => clean(h))
  const at = (cells: string[], name: string): string | undefined => {
    const i = header.indexOf(name)
    return i === -1 ? undefined : cells[i]
  }
  if (!header.includes('sku')) {
    return { rows: [], warnings: [`No "sku" column. Found: ${header.join(', ')}`] }
  }

  const rows: RosterRow[] = []
  const seen = new Set<string>()

  for (const line of lines.slice(1)) {
    const cells = splitDelimited(line, delimiter)
    const sku = clean(at(cells, 'sku'))
    if (sku === '') continue
    if (seen.has(sku)) {
      warnings.push(`${sku}: listed more than once — only the first row is used.`)
      continue
    }
    seen.add(sku)

    const rawGroup = clean(at(cells, 'swapGroup')).toLowerCase()
    const aliased = SWAP_GROUP_ALIASES[rawGroup]
    let swapGroup: SwapGroup = 'general'
    let unrecognised: string | null = null
    if (aliased) swapGroup = aliased
    else if (VALID_SWAP_GROUPS.has(rawGroup)) swapGroup = rawGroup as SwapGroup
    else if (rawGroup !== '') {
      unrecognised = rawGroup
      warnings.push(
        `${sku}: swap group "${rawGroup}" is not one the engine knows, so it imports as "general" — ` +
          'which means no swap alternatives and no targeted scoring. Pick a real group before approving.',
      )
    }

    const { flags, other } = safety(at(cells, 'contraindications'))
    if (other.length > 0) {
      warnings.push(`${sku}: "${other.join(', ')}" kept as a warning — the quiz has no question to gate it on.`)
    }

    const variants = list(at(cells, 'variantSkus'))
    if (variants.length > 0 && !variants.includes(sku)) {
      warnings.push(`${sku}: its own SKU is missing from variantSkus (${variants.join(', ')}) — check for a typo.`)
    }

    rows.push({
      sku,
      brand: clean(at(cells, 'brand')),
      name: clean(at(cells, 'name')),
      swapGroup,
      unrecognisedSwapGroup: unrecognised,
      servings: num(at(cells, 'servings')),
      weightGrams: num(at(cells, 'weightGrams')),
      stock: num(at(cells, 'stock')),
      formats: list(at(cells, 'formats')).map((f) => f.toLowerCase()),
      dietaryTags: list(at(cells, 'dietaryTags'))
        .map((t) => DIETARY[t.toLowerCase()])
        .filter((t): t is DietaryTag => Boolean(t)),
      hasStimulants: bool(at(cells, 'hasStimulants')),
      contraindications: flags,
      otherWarnings: other,
      actives: parseActives(at(cells, 'actives')),
      subscriptionEligible: bool(at(cells, 'subscriptionEligible')),
      variantSkus: variants.length > 0 ? variants : [sku],
      top25Rank: num(at(cells, 'top25Rank')),
      recommendationPriority: num(at(cells, 'recommendationPriority')),
      shortReason: clean(at(cells, 'shortReason')),
    })
  }

  return { rows, warnings }
}
