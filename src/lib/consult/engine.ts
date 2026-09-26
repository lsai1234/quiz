/**
 * Stack engine v2 (build H4).
 *
 * Runs once, after the review and the circuit check, with every answer in:
 *
 *   1. Need scoring   — each goal adds weight to its needs (goal 1 ×3, goal 2
 *                       ×2, goal 3 ×1), and each answer adds more: "hardly
 *                       ever" daylight adds 4 to low-sun, two or more gym days
 *                       add to protein, no oily fish adds to omega, and so on.
 *   2. Hard exclusions — from the circuit check (ingredients), diet (a fully
 *                       plant-based plate means vegan products only) and age.
 *   3. Duplicates     — nothing they already take, one product per family.
 *   4. Doses          — one caffeine source at most, counting the shelf; none
 *                       at all at four or more drinks a day.
 *   5. Tiers          — Essentials = top 3, Standard = top 5, Complete = top
 *                       7–8. Each contains the one below.
 *
 * Pure and deterministic: the same answers and catalogue always give the same
 * three lists, down to the order (ties break on price, then id). Only products
 * that are live and in stock can be picked, so every SKU handed over is
 * buyable at handoff time.
 *
 * Rules decide; nothing here calls an AI.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { inStockOnly } from '@/lib/catalogue/filters'
import { claimsFor } from './claims'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { circuitOutcome, type Ingredient } from './circuit'
import {
  GOAL_NEEDS,
  GOAL_WEIGHT,
  NEEDS,
  SHELF_CAFFEINE,
  SHELF_COVERS,
  familyOf,
  ingredientsOf,
  kindOf,
  type NeedId,
} from './knowledge'
import { caffeineCount, sessionsPerWeek, sleepHours } from './reactions'
import { readPlate } from './plate'
import { GOAL_LABEL, SHELF_LABEL } from './summary'
import type { ConsultAnswers, ConsultGoal } from './types'

export const ENGINE_VERSION = 'engine-2'

/** Caffeinated drinks a day at which nothing with caffeine goes in the stack. */
export const CAFFEINE_CEILING = 4
/** A product has to meet a real need to be picked at all. */
export const MIN_SCORE = 1

export interface NeedScore {
  total: number
  /** Where the weight came from, in the member's terms — the strongest becomes the reason. */
  sources: { why: string; weight: number }[]
}

export type Needs = Record<NeedId, NeedScore>

export interface RankedProduct {
  id: string
  title: string
  score: number
  /** The need it's mainly there for. */
  need: NeedId
  /** Why, restating an answer. Never a health claim. */
  reason: string
  /** Register claim IDs its kind may carry (see `claims.ts`). */
  claims: string[]
}

export interface ExcludedEntry {
  /** A product id, or an ingredient family like `fish-oil`. */
  what: string
  why: string
}

export interface EngineResult {
  version: typeof ENGINE_VERSION
  ranked: RankedProduct[]
  tiers: { essentials: string[]; standard: string[]; complete: string[] }
  /** Ingredient families ruled out — carried into extras and checkout (H9). */
  excludedIngredients: Ingredient[]
  /** Individual products ruled out, and why. */
  excluded: ExcludedEntry[]
  /** Lines for the handoff screen: what was kept out and skipped. */
  notes: string[]
  flags: { pharmacistNote: boolean }
  needs: Needs
  /** Goals nothing in the stack meets. */
  unmetGoals: ConsultGoal[]
}

/* ── 1. Needs ───────────────────────────────────────────────────────────── */

export function scoreNeeds(a: ConsultAnswers): Needs {
  const needs = Object.fromEntries(NEEDS.map((n) => [n, { total: 0, sources: [] }])) as unknown as Needs
  const add = (need: NeedId, weight: number, why: string) => {
    if (weight <= 0) return
    needs[need].total += weight
    needs[need].sources.push({ why, weight })
  }

  a.goals.slice(0, 3).forEach((goal, i) => {
    const w = GOAL_WEIGHT[i]
    const why = i === 0 ? `${GOAL_LABEL[goal]} is your top goal` : `${GOAL_LABEL[goal]} is one of your goals`
    for (const [need, base] of Object.entries(GOAL_NEEDS[goal]) as [NeedId, number][]) add(need, base * w, why)
  })

  // Training.
  const week = a.week ?? []
  const gym = week.filter((d) => d === 'gym').length
  const endurance = week.filter((d) => d === 'cardio' || d === 'sport').length
  const sessions = sessionsPerWeek(a.week)
  if (gym >= 2) {
    add('protein', 2 + (gym - 2), `You're in the gym ${gym} days a week`)
    add('strength', gym >= 3 ? 2 : 1, `You're in the gym ${gym} days a week`)
  }
  if (sessions >= 4) {
    add('recovery', 2, `You train ${sessions} days a week`)
    add('hydration', 1, `You train ${sessions} days a week`)
  }
  if (endurance >= 2) add('hydration', 2, `${endurance} cardio or sport days a week`)
  if (a.intensity === 'hard' && sessions > 0) {
    add('recovery', 1, 'Most sessions are flat out')
    add('hydration', 1, 'Most sessions are flat out')
  }

  // Energy.
  if (a.energy !== null && a.energy <= 4) {
    add('energy', a.energy <= 2 ? 3 : 2, `Afternoon energy at ${a.energy}/10`)
    add('basics', 1, `Afternoon energy at ${a.energy}/10`)
  }

  // Sleep.
  if (a.sleep) {
    const h = sleepHours(a.sleep)
    if (h < 7) add('sleep', h < 6 ? 3 : 2, `About ${h} hours a night`)
    if (a.sleep.quality === 'broken') {
      add('sleep', 2, 'Your sleep is restless')
      add('stress', 1, 'Your sleep is restless')
    }
  }

  // Daylight.
  if (a.daylight === 'hardly') add('low-sun', 4, 'You hardly ever get daylight')
  else if (a.daylight === 'some') add('low-sun', 2, 'You only get daylight some days')
  if (a.age === '55-64' || a.age === '65-plus') {
    add('low-sun', 1, 'Vitamin D needs rise with age')
    add('joints', 1, 'Joints need more care with age')
  }

  // Caffeine.
  if (caffeineCount(a.caffeine) >= CAFFEINE_CEILING) add('sleep', 1, `${caffeineCount(a.caffeine)} caffeinated drinks a day`)

  // Food.
  if (a.plate && a.plate.length > 0) {
    const plate = readPlate(a.plate)
    if (plate.noOilyFish) add('omega', 3, 'No oily fish most weeks')
    if (plate.plantBased) {
      add('b12-iron', 3, 'Your plate is fully plant-based')
      add('protein', 1, 'Your plate is fully plant-based')
    }
    if (a.plate.length < 4) add('basics', 2, 'A narrow plate most weeks')
    if (!a.plate.includes('greens') && !a.plate.includes('fruit')) {
      add('basics', 1, 'Not much fruit or veg most weeks')
      add('gut', 1, 'Not much fruit or veg most weeks')
    }
  }

  // Body.
  const spots = a.body ?? []
  if (spots.length) {
    add('joints', Math.min(6, spots.length * 1.5), `Stiff or sore ${spots.length === 1 ? 'spot' : 'spots'} to look after`)
    add('collagen', 1, 'Stiff or sore spots to look after')
  }

  return needs
}

/* ── 2–4. Exclusions, duplicates, doses ─────────────────────────────────── */

interface Candidate {
  product: CatalogueProduct
  score: number
  need: NeedId
  reason: string
  ingredients: Set<Ingredient>
}

function score(product: CatalogueProduct, needs: Needs): Omit<Candidate, 'ingredients'> | null {
  const kind = kindOf(product)
  if (!kind) return null
  let total = 0
  let top: { need: NeedId; value: number } | null = null
  for (const [need, affinity] of Object.entries(kind.meets) as [NeedId, number][]) {
    const value = needs[need].total * affinity
    total += value
    if (value > 0 && (!top || value > top.value)) top = { need, value }
  }
  if (!top || total < MIN_SCORE) return null
  const sources = [...needs[top.need].sources].sort((x, y) => y.weight - x.weight || x.why.localeCompare(y.why))
  return { product, score: Math.round(total * 100) / 100, need: top.need, reason: sources[0].why }
}

export function runStackEngine(a: ConsultAnswers, catalogue: CatalogueProduct[]): EngineResult {
  if (a.age === 'under-18') throw new Error('Stack engine called for an under-18 consult')
  const outcome = circuitOutcome(a)
  if (outcome.kind === 'stop') {
    // Belt and braces: the flow never calls the engine after a stop.
    throw new Error(`Stack engine called after a circuit stop (${outcome.reason})`)
  }

  const needs = scoreNeeds(a)
  const excluded: ExcludedEntry[] = []
  const notes: string[] = []
  const exclude = new Set<Ingredient>(outcome.exclude)
  const why: Partial<Record<Ingredient, string>> = { ...outcome.reasons }

  const drinks = caffeineCount(a.caffeine)
  const shelf = a.shelf ?? []
  const shelfCaffeine = shelf.some((s) => SHELF_CAFFEINE.includes(s))
  if (drinks >= CAFFEINE_CEILING) {
    exclude.add('caffeine')
    exclude.add('stimulant')
    why.caffeine ??= `you already have ${drinks} caffeinated drinks a day`
  }
  if (a.goals.includes('sleep')) {
    exclude.add('caffeine')
    why.caffeine ??= 'sleep is one of your goals'
  }
  if (a.age === '65-plus') {
    exclude.add('stimulant')
    exclude.add('caffeine')
    why.stimulant ??= 'stimulants are best avoided at 65 and over'
    why.caffeine ??= 'stimulants are best avoided at 65 and over'
  }

  const plantBased = a.plate ? readPlate(a.plate).plantBased : false
  const minLinePrice = getPricingConfig().minQuizProductPrice

  const pool = inStockOnly(catalogue).filter((p) => !p.isSubscriptionOnly && (minLinePrice <= 0 || p.basePrice >= minLinePrice))

  const candidates: Candidate[] = []
  for (const product of pool) {
    const scored = score(product, needs)
    if (!scored) continue
    const ingredients = ingredientsOf(product)
    const hit = [...ingredients].find((i) => exclude.has(i))
    if (hit) {
      excluded.push({ what: product.id, why: why[hit] ?? 'ruled out by your circuit check' })
      continue
    }
    if (plantBased && !product.dietaryTags.includes('vegan')) {
      excluded.push({ what: product.id, why: 'it isn’t vegan and your plate is fully plant-based' })
      continue
    }
    const covered = shelf.find((s) => SHELF_COVERS[s].includes(product.swapGroup))
    if (covered) {
      excluded.push({ what: product.id, why: `you already take ${SHELF_LABEL[covered].toLowerCase()}` })
      continue
    }
    candidates.push({ ...scored, ingredients })
  }

  // Rank: score, then cheaper first, then id — fully deterministic.
  candidates.sort((x, y) => y.score - x.score || x.product.basePrice - y.product.basePrice || x.product.id.localeCompare(y.product.id))

  // Walk the ranking, keeping one per family and one caffeine source at most.
  const picked: Candidate[] = []
  const families = new Set<string>()
  let caffeineSources = shelfCaffeine ? 1 : 0
  for (const c of candidates) {
    const family = familyOf(c.product)
    if (families.has(family)) continue
    if (c.ingredients.has('caffeine')) {
      if (caffeineSources >= 1) {
        excluded.push({ what: c.product.id, why: shelfCaffeine ? 'your pre-workout is already a caffeine source' : 'one caffeine source is enough' })
        continue
      }
      caffeineSources++
    }
    families.add(family)
    picked.push(c)
    if (picked.length === 8) break
  }

  // Complete is 7, or 8 when the eighth still clearly earns its place.
  const completeSize = picked.length >= 8 && picked[7].score >= picked[0].score * 0.25 ? 8 : Math.min(7, picked.length)
  const ids = picked.map((c) => c.product.id)
  const tiers = {
    essentials: ids.slice(0, Math.min(3, ids.length)),
    standard: ids.slice(0, Math.min(5, ids.length)),
    complete: ids.slice(0, completeSize),
  }
  const ranked: RankedProduct[] = picked.slice(0, completeSize).map((c) => ({
    id: c.product.id,
    title: c.product.title,
    score: c.score,
    need: c.need,
    reason: c.reason,
    claims: claimsFor(c.product.swapGroup),
  }))

  // Notes for the handoff screen, in the member's terms: what was kept out or
  // skipped, by name, and why. Only products that would otherwise have made
  // the stack are worth a line — everything else was never in the running.
  const excludedIngredients = [...exclude].sort()
  const titleOf = new Map(pool.map((p) => [p.id, p.shortName || p.title]))
  const cutoff = picked.length ? picked[Math.min(picked.length, completeSize) - 1].score : 0
  const scoreOf = new Map(pool.map((p) => [p.id, score(p, needs)?.score ?? 0]))
  const byReason = new Map<string, string[]>()
  for (const e of excluded) {
    if ((scoreOf.get(e.what) ?? 0) < cutoff) continue
    const list = byReason.get(e.why) ?? []
    list.push(titleOf.get(e.what) ?? e.what)
    byReason.set(e.why, list)
  }
  for (const [reason, titles] of byReason) {
    const names = [...new Set(titles)].join(', ')
    notes.push(reason.startsWith('you already take') ? `Skipped: ${names}, because ${reason}` : `Kept out: ${names}, because ${reason}`)
  }
  if (outcome.pharmacistNote) {
    notes.push('Pharmacist note travels with the stack: check before starting, as you take prescription medicine.')
  }

  const unmetGoals = a.goals.filter((goal) => {
    const wanted = Object.keys(GOAL_NEEDS[goal]) as NeedId[]
    return !ranked.some((r) => wanted.includes(r.need))
  })

  return {
    version: ENGINE_VERSION,
    ranked,
    tiers,
    excludedIngredients,
    excluded,
    notes,
    flags: { pharmacistNote: outcome.pharmacistNote },
    needs,
    unmetGoals,
  }
}
