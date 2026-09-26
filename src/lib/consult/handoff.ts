/**
 * The handoff payload (build H7).
 *
 * The one object the consult produces. Versioned, validated against its
 * schema on every consult, and the only thing that crosses from the consult
 * into the existing results page — through the adapter (H8), so that page
 * needs no redesign.
 *
 *   {
 *     "version": "consult-2.0",
 *     "consult_id": "c_8f2k…",
 *     "goals": ["performance", "sleep"],
 *     "profile": { "training": 80, "energy": 50, … },
 *     "tiers": { "essentials": [ids], "standard": [ids], "complete": [ids] },
 *     "excluded": ["fish-oil", "vitamin-k"],
 *     "flags": { "pharmacist_note": true },
 *     "reasons": { "<product id>": "You hardly ever get daylight" },
 *     "notes": ["Kept out: …"]
 *   }
 *
 * The SKUs are catalogue product ids — what the results page, the basket and
 * checkout all key on — and every one was live and in stock when the engine
 * ran, which is at handoff, against a freshly loaded catalogue.
 *
 * What is deliberately NOT in it: the circuit check's answers. `excluded` and
 * `pharmacist_note` say what the stack must avoid, which is all anything
 * downstream needs to know.
 */

import { CLAIMS } from './claims'
import type { EngineResult } from './engine'
import { ENGINE_VERSION } from './engine'
import type { Ingredient } from './circuit'
import { PROFILE_AREAS, type ChargeProfile } from './profile'
import type { ConsultGoal, Route } from './types'

export const HANDOFF_VERSION = 'consult-2.0' as const

export interface HandoffPayload {
  version: typeof HANDOFF_VERSION
  consult_id: string
  created_at: string
  engine: typeof ENGINE_VERSION
  route: Route
  goals: ConsultGoal[]
  profile: ChargeProfile
  tiers: { essentials: string[]; standard: string[]; complete: string[] }
  excluded: Ingredient[]
  flags: { pharmacist_note: boolean }
  reasons: Record<string, string>
  /** Register claim IDs per SKU in Complete: the only claim wording anything may show (see `claims.ts`). */
  claims: Record<string, string[]>
  notes: string[]
}

const GOALS: ConsultGoal[] = ['performance', 'energy', 'sleep', 'focus', 'ageing', 'allround']
const INGREDIENTS: Ingredient[] = [
  'caffeine', 'stimulant', 'vitamin-k', 'fish-oil', 'ginkgo', 'turmeric', 'st-johns-wort', 'hormone-active', 'shellfish', 'rx-interaction',
]

export function buildHandoff(opts: {
  consultId: string
  route: Route
  goals: ConsultGoal[]
  profile: ChargeProfile
  engine: EngineResult
  now?: Date
}): HandoffPayload {
  const { engine } = opts
  return {
    version: HANDOFF_VERSION,
    consult_id: opts.consultId,
    created_at: (opts.now ?? new Date()).toISOString(),
    engine: ENGINE_VERSION,
    route: opts.route,
    goals: [...opts.goals],
    profile: { ...opts.profile },
    tiers: {
      essentials: [...engine.tiers.essentials],
      standard: [...engine.tiers.standard],
      complete: [...engine.tiers.complete],
    },
    excluded: [...engine.excludedIngredients],
    flags: { pharmacist_note: engine.flags.pharmacistNote },
    reasons: Object.fromEntries(engine.ranked.map((r) => [r.id, r.reason])),
    claims: Object.fromEntries(engine.ranked.map((r) => [r.id, [...r.claims]])),
    notes: [...engine.notes],
  }
}

export type Validation = { ok: true; payload: HandoffPayload } | { ok: false; errors: string[] }

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

/**
 * The schema, checked by hand — it is small, and a hand check can say exactly
 * which rule failed. Structural checks, then the rules the handoff has to keep:
 * tiers nested, every tier SKU given a reason, no duplicates.
 */
export function validateHandoff(value: unknown): Validation {
  const errors: string[] = []
  const v = value as Partial<HandoffPayload> | null
  if (!v || typeof v !== 'object') return { ok: false, errors: ['not an object'] }

  if (v.version !== HANDOFF_VERSION) errors.push(`version must be ${HANDOFF_VERSION}`)
  if (typeof v.consult_id !== 'string' || !/^c_[a-z0-9]{6,32}$/.test(v.consult_id)) errors.push('consult_id is malformed')
  if (typeof v.created_at !== 'string' || Number.isNaN(Date.parse(v.created_at))) errors.push('created_at is not a date')
  if (v.engine !== ENGINE_VERSION) errors.push(`engine must be ${ENGINE_VERSION}`)
  if (v.route !== 'speed' && v.route !== 'deep') errors.push('route must be speed or deep')

  if (!isStringArray(v.goals) || v.goals.length < 1 || v.goals.length > 3 || !v.goals.every((g) => GOALS.includes(g as ConsultGoal))) {
    errors.push('goals must be one to three known goals')
  }

  if (!v.profile || typeof v.profile !== 'object') errors.push('profile is missing')
  else {
    for (const area of PROFILE_AREAS) {
      const n = (v.profile as Record<string, unknown>)[area]
      if (typeof n !== 'number' || n < 0 || n > 100 || !Number.isInteger(n)) errors.push(`profile.${area} must be an integer 0–100`)
    }
  }

  const t = v.tiers
  if (!t || !isStringArray(t.essentials) || !isStringArray(t.standard) || !isStringArray(t.complete)) {
    errors.push('tiers must hold three lists of SKUs')
  } else {
    const prefix = (a: string[], b: string[]) => a.every((id, i) => b[i] === id)
    if (t.essentials.length < 1) errors.push('essentials is empty')
    if (!prefix(t.essentials, t.standard)) errors.push('standard must contain essentials')
    if (!prefix(t.standard, t.complete)) errors.push('complete must contain standard')
    if (new Set(t.complete).size !== t.complete.length) errors.push('complete has duplicates')
    if (v.reasons && typeof v.reasons === 'object') {
      for (const id of t.complete) if (typeof v.reasons[id] !== 'string' || !v.reasons[id]) errors.push(`no reason for ${id}`)
    }
  }

  if (!isStringArray(v.excluded) || !v.excluded.every((i) => INGREDIENTS.includes(i as Ingredient))) errors.push('excluded must list known ingredient families')
  if (!v.flags || typeof v.flags.pharmacist_note !== 'boolean') errors.push('flags.pharmacist_note must be a boolean')
  if (!v.reasons || typeof v.reasons !== 'object') errors.push('reasons is missing')
  if (!v.claims || typeof v.claims !== 'object') errors.push('claims is missing')
  else {
    for (const [sku, ids] of Object.entries(v.claims)) {
      if (!isStringArray(ids)) errors.push(`claims for ${sku} must be a list`)
      else for (const id of ids) if (!(id in CLAIMS)) errors.push(`unknown claim ${id} for ${sku}`)
    }
  }
  if (!isStringArray(v.notes)) errors.push('notes must be a list of strings')

  return errors.length ? { ok: false, errors } : { ok: true, payload: v as HandoffPayload }
}

/* ── Saved against the consult ID ───────────────────────────────────────── */

export const HANDOFF_STORAGE_KEY = 'chrgd-consult-handoff'

/**
 * The last handoff, on this device: what "change my answers" (H10) reopens
 * and what extras read their exclusions from (H9). Same week-long life as the
 * consult save, and it holds no circuit answers — only what they rule out.
 */
export function saveHandoffLocally(payload: HandoffPayload): void {
  try {
    window.localStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), payload }))
  } catch {
    // Storage unavailable: the results page still works; H9/H10 degrade.
  }
}

export function loadHandoffLocally(maxAgeMs = 7 * 24 * 60 * 60 * 1000): HandoffPayload | null {
  try {
    const raw = window.localStorage.getItem(HANDOFF_STORAGE_KEY)
    if (!raw) return null
    const { savedAt, payload } = JSON.parse(raw) as { savedAt: number; payload: unknown }
    if (typeof savedAt !== 'number' || Date.now() - savedAt > maxAgeMs) return null
    const checked = validateHandoff(payload)
    return checked.ok ? checked.payload : null
  } catch {
    return null
  }
}

/** Save it against the consult ID on the server too, so support can reload it. Best-effort. */
export async function saveHandoffRemotely(payload: HandoffPayload): Promise<boolean> {
  try {
    const res = await fetch('/api/consult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    return false
  }
}
