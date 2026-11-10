/**
 * Warm-up and cool-down matched to the day's lifts (Phase 3). Pure; safe in
 * the browser.
 *
 *   ramp       two lighter sets of the first lift before the working sets
 *   cool-down  three stretches for the muscles the session worked
 *   add-ons    a couple more mobility moves for the same muscles, optional
 *
 * Every move suits their setup (`fits`): anything that loads an area they're
 * working around stays out. The plan never treats an area; that's for a physio.
 */
import { fits } from './generate'
import { EXERCISES, exerciseById } from './library'
import type { Exercise, Muscle, StrengthSession, TrainingPrefs } from './types'

export interface Cooldown {
  /** The first loaded lift, for the ramp sets; null when it's bodyweight or timed. */
  ramp: string | null
  cooldown: string[]
  addOns: string[]
}

const MOBILITY = EXERCISES.filter((e) => e.role === 'mobility')

export function cooldownFor(session: Pick<StrengthSession, 'exercises' | 'warmup'>, prefs: Pick<TrainingPrefs, 'equipment' | 'avoid' | 'experience'>): Cooldown {
  const lifts = session.exercises.map((p) => exerciseById(p.id)).filter((e): e is Exercise => Boolean(e))
  // How much each muscle was worked: compounds count double.
  const worked = new Map<Muscle, number>()
  for (const e of lifts) for (const m of e.muscles) worked.set(m, (worked.get(m) ?? 0) + (e.role === 'compound' ? 2 : 1))
  const warm = new Set(session.warmup)
  const ranked = MOBILITY.filter((e) => fits(e, prefs) && !warm.has(e.id))
    .map((e) => ({ e, score: e.muscles.reduce((s, m) => s + (worked.get(m) ?? 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id))
    .map((x) => x.e.id)
  const first = lifts.find((e) => e.unit === 'reps' && e.role === 'compound' && !e.equipment.includes('bodyweight'))
  return { ramp: first?.id ?? null, cooldown: ranked.slice(0, 3), addOns: ranked.slice(3, 5) }
}
