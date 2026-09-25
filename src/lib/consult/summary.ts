/**
 * Each answer in words, for the review cards and anywhere else the consult
 * reads an answer back. Restates what was said — no interpretation.
 */

import { caffeineCount, sessionsPerWeek, sleepHours } from './reactions'
import type {
  AgeBand,
  BodySpot,
  CircuitFlag,
  ConsultAnswers,
  ConsultGoal,
  Daylight,
  DayType,
  Food,
  SceneId,
  Sex,
  ShelfItem,
  SleepQuality,
} from './types'

export const GOAL_LABEL: Record<ConsultGoal, string> = {
  performance: 'Performance',
  energy: 'Energy',
  sleep: 'Sleep & recovery',
  focus: 'Focus',
  ageing: 'Healthy ageing',
  allround: 'All-round health',
}

export const AGE_LABEL: Record<AgeBand, string> = {
  '18-24': '18–24',
  '25-34': '25–34',
  '35-44': '35–44',
  '45-54': '45–54',
  '55-64': '55–64',
  '65-plus': '65+',
}

export const SEX_LABEL: Record<Sex, string> = {
  female: 'Female',
  male: 'Male',
  unsaid: 'Prefer not to say',
}

export const DAY_LABEL: Record<DayType, string> = {
  rest: 'Rest',
  gym: 'Gym',
  cardio: 'Cardio',
  sport: 'Sport',
}

export const QUALITY_LABEL: Record<SleepQuality, string> = {
  broken: 'Broken',
  ok: 'OK',
  restful: 'Restful',
}

export const DAYLIGHT_LABEL: Record<Daylight, string> = {
  hardly: 'Hardly ever',
  some: 'Some days',
  most: 'Most days',
  daily: 'Every day',
}

export const FOOD_LABEL: Record<Food, string> = {
  'oily-fish': 'Oily fish',
  'red-meat': 'Red meat',
  poultry: 'Chicken',
  eggs: 'Eggs',
  dairy: 'Dairy',
  beans: 'Beans & lentils',
  greens: 'Leafy greens',
  fruit: 'Fruit',
  nuts: 'Nuts & seeds',
  wholegrains: 'Wholegrains',
}

export const BODY_LABEL: Record<BodySpot, string> = {
  neck: 'Neck',
  shoulders: 'Shoulders',
  'lower-back': 'Lower back',
  hips: 'Hips',
  knees: 'Knees',
}

export const SHELF_LABEL: Record<ShelfItem, string> = {
  multivitamin: 'Multivitamin',
  'vitamin-d': 'Vitamin D',
  creatine: 'Creatine',
  protein: 'Protein',
  'omega-3': 'Omega-3',
  'pre-workout': 'Pre-workout',
  magnesium: 'Magnesium',
  collagen: 'Collagen',
}

export const CIRCUIT_LABEL: Record<CircuitFlag, string> = {
  pregnancy: 'Pregnant, breastfeeding or trying',
  'blood-thinners': 'Blood-thinning medicine',
  'other-prescription': 'Other prescription medicine',
  heart: 'Heart condition or high blood pressure',
  'kidney-liver': 'Kidney or liver condition',
}

export function clock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function list(items: string[]): string {
  return items.length === 0 ? '' : items.join(', ')
}

/** One scene's answer, in a line. Empty when unanswered. */
export function summarise(scene: SceneId, a: ConsultAnswers): string {
  switch (scene) {
    case 'goals':
      return a.goals.map((g, i) => `${i + 1}. ${GOAL_LABEL[g]}`).join('  ')
    case 'about':
      return [a.age && AGE_LABEL[a.age], a.sex && SEX_LABEL[a.sex]].filter(Boolean).join(' · ')
    case 'training': {
      if (!a.week) return ''
      const n = sessionsPerWeek(a.week)
      if (n === 0) return 'All rest days'
      const counts = (['gym', 'cardio', 'sport'] as const)
        .map((t) => [t, a.week!.filter((d) => d === t).length] as const)
        .filter(([, c]) => c > 0)
        .map(([t, c]) => `${c} ${DAY_LABEL[t].toLowerCase()}`)
      return `${n} a week · ${counts.join(', ')}`
    }
    case 'energy':
      return a.energy === null ? '' : `${a.energy} / 10`
    case 'sleep':
      if (!a.sleep) return ''
      return [
        `${clock(a.sleep.bed)}–${clock(a.sleep.wake)}`,
        `${sleepHours(a.sleep)}h`,
        a.sleep.quality && QUALITY_LABEL[a.sleep.quality],
      ]
        .filter(Boolean)
        .join(' · ')
    case 'daylight':
      return a.daylight ? DAYLIGHT_LABEL[a.daylight] : ''
    case 'caffeine': {
      if (!a.caffeine) return ''
      const n = caffeineCount(a.caffeine)
      if (n === 0) return 'None'
      const parts = [
        a.caffeine.coffee && `${a.caffeine.coffee} coffee`,
        a.caffeine.tea && `${a.caffeine.tea} tea`,
        a.caffeine.energy && `${a.caffeine.energy} energy drink`,
      ].filter(Boolean)
      return `${n} a day · ${parts.join(', ')}`
    }
    case 'food':
      return a.plate ? list(a.plate.map((f) => FOOD_LABEL[f])) : ''
    case 'body':
      if (a.body === null) return ''
      return a.body.length === 0 ? 'Nothing sore' : list(a.body.map((b) => BODY_LABEL[b]))
    case 'shelf':
      if (a.shelf === null) return ''
      return a.shelf.length === 0 ? 'Nothing yet' : list(a.shelf.map((s) => SHELF_LABEL[s]))
    case 'review':
      return ''
    case 'circuit':
      if (!a.circuit) return ''
      return a.circuit.none ? 'None of these' : list(a.circuit.flags.map((f) => CIRCUIT_LABEL[f]))
  }
}
