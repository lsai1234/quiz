/**
 * Charge levels (Option 1): the box's size, named, and what it comes with.
 *
 *   Charged        any box             the services every box gets, 13% monthly
 *   Supercharged   4 or more products  15% monthly
 *   Fully charged  6 or more           20% monthly
 *
 * The steps are the box's own (`LEVEL_FROM` in `./box`), which already set the
 * monthly rate, so a level and its rate always agree. One-off and monthly get
 * the same services; the levels only add the monthly rate, so a one-off box
 * has no levels to climb and says only what it comes with. A service shows
 * only while its switch is on (`ServiceSettings`).
 *
 * Pure. Nothing here prices anything: the rates are read, not set.
 */
import type { StackLevel } from '@/lib/types'
import { LEVEL_FROM, levelForCount } from './box'
import { LEVEL_COPY } from './levels-copy'
import type { ServiceSettings } from './settings'

export type ChargeLevelId = 'charged' | 'supercharged' | 'fully'
export type ServiceId = 'guide' | 'reminders' | 'training' | 'deals' | 'checkIns' | 'swaps' | 'guarantee' | 'rate'

const LEVEL_OF: Record<StackLevel, ChargeLevelId> = { essentials: 'charged', performance: 'supercharged', complete: 'fully' }
const ORDER: ChargeLevelId[] = ['charged', 'supercharged', 'fully']

export interface Service {
  id: ServiceId
  label: string
  /** The level it comes with. */
  level: ChargeLevelId
  /** True when this box has it. */
  unlocked: boolean
}

export interface ChargeView {
  level: ChargeLevelId
  /** The levels worth showing: more than one only when a level adds something. */
  levels: { id: ChargeLevelId; name: string; from: number; reached: boolean }[]
  next: { id: ChargeLevelId; name: string; more: number } | null
  services: Service[]
}

export function chargeLevelFor(count: number): ChargeLevelId {
  return LEVEL_OF[levelForCount(Math.max(1, count))]
}

/**
 * What a box of `count` products comes with, on this plan, with these
 * switches. `ratePct` gives a level's monthly rate in whole percent.
 */
export function chargeView(input: {
  count: number
  plan: 'oneoff' | 'subscription'
  services: ServiceSettings
  ratePct: (level: StackLevel) => number
}): ChargeView {
  const { count, plan, services: on } = input
  const level = chargeLevelFor(count)
  const reached = (l: ChargeLevelId) => ORDER.indexOf(l) <= ORDER.indexOf(level)
  const sub = plan === 'subscription'
  const c = LEVEL_COPY.service

  const all: Omit<Service, 'unlocked'>[] = [
    { id: 'guide', label: c.guide, level: 'charged' },
    { id: 'reminders', label: c.reminders, level: 'charged' },
    ...(on.training ? [{ id: 'training' as const, label: c.training, level: 'charged' as const }] : []),
    ...(on.deals ? [{ id: 'deals' as const, label: c.deals, level: 'charged' as const }] : []),
    ...(on.checkIns ? [{ id: 'checkIns' as const, label: c.checkIns, level: 'charged' as const }] : []),
    ...(sub ? [{ id: 'swaps' as const, label: c.swaps, level: 'charged' as const }] : []),
    ...(on.guarantee ? [{ id: 'guarantee' as const, label: c.guarantee, level: 'charged' as const }] : []),
  ]
  // Monthly: each level's rate, as a service of that level.
  if (sub) {
    for (const step of LEVEL_FROM) {
      const id = LEVEL_OF[step.level]
      all.push({ id: 'rate', label: c.rate(input.ratePct(step.level)), level: id })
    }
  }
  // A level is worth naming when something comes with it; Charged always is.
  const levelsShown = ORDER.filter((l) => l === 'charged' || all.some((s) => s.level === l))
  // Monthly rates: the one they're on, and the next level's.
  const here = ORDER.indexOf(level)
  const services: Service[] = []
  for (const s of all) {
    const at = ORDER.indexOf(s.level)
    if (s.id === 'rate') {
      if (at === here || at === here + 1) services.push({ ...s, unlocked: at === here })
      continue
    }
    services.push({ ...s, unlocked: reached(s.level) })
  }

  const from = Object.fromEntries(LEVEL_FROM.map((s) => [LEVEL_OF[s.level], s.count])) as Record<ChargeLevelId, number>
  const nextId = levelsShown.find((l) => !reached(l)) ?? null
  return {
    level,
    levels: levelsShown.length > 1 ? levelsShown.map((id) => ({ id, name: LEVEL_COPY.level[id], from: from[id], reached: reached(id) })) : [],
    next: nextId ? { id: nextId, name: LEVEL_COPY.level[nextId], more: Math.max(1, from[nextId] - count) } : null,
    services,
  }
}
