/**
 * Each answer in words, for the review cards and anywhere else the consult
 * reads an answer back. Restates what was said — no interpretation.
 */

import { pinpointed } from './pinpoint/effects'
import { probeSteps, stepSaid } from './pinpoint/leads'
import { caffeineCount, sleepHours } from './reactions'
import { ACTIVITIES, countsByType, sessionsLabel, sessionsPerWeek } from './training'
import type {
  AgeingChange,
  TrainingAim,
  AgeBand,
  BodySpot,
  CircuitFlag,
  ConsultAnswers,
  ConsultGoal,
  Daylight,
  DayType,
  Food,
  Intensity,
  SceneId,
  Sex,
  ShelfItem,
  SleepQuality,
  WeightSymptom,
} from './types'

export const GOAL_LABEL: Record<ConsultGoal, string> = {
  performance: 'Performance',
  energy: 'Energy',
  sleep: 'Sleep & recovery',
  focus: 'Focus',
  ageing: 'Healthy ageing',
  allround: 'All-round health',
  weight: 'Weight loss',
}

export const AGE_LABEL: Record<AgeBand, string> = {
  'under-18': 'Under 18',
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

export const INTENSITY_LABEL: Record<Intensity, string> = {
  easy: 'Easy',
  steady: 'Steady',
  hard: 'Flat out',
}

export const QUALITY_LABEL: Record<SleepQuality, string> = {
  restful: 'Great',
  ok: 'OK',
  broken: 'Restless',
}

/**
 * How often they're outside in daylight for twenty minutes or more. Days a
 * week, not "some" or "most": the same answer should mean the same thing to
 * everyone who gives it.
 */
export const DAYLIGHT_LABEL: Record<Daylight, string> = {
  hardly: 'Rarely',
  some: '1–2 days a week',
  most: '3–5 days a week',
  daily: 'Every day',
}

/** What each step looks like in an ordinary week, so people can place themselves. */
export const DAYLIGHT_EXAMPLE: Record<Daylight, string> = {
  hardly: 'Home, car, office. Mostly indoors',
  some: 'A weekend walk, the odd sunny lunch',
  most: 'Out most weekdays: a walk, the school run',
  daily: 'Outdoors every day, or work outside',
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

export const AIM_LABEL: Record<TrainingAim, string> = {
  muscle: 'Build muscle',
  strength: 'Get stronger',
  sport: 'Play my sport better',
  endurance: 'Go further',
}

export const CHANGE_LABEL: Record<AgeingChange, string> = {
  'getting-about': 'Getting about',
  strength: 'Keeping strong',
  'staying-sharp': 'Staying sharp',
  energy: 'Energy through the day',
  'sleeping-through': 'Sleeping through',
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
  shellfish: 'Shellfish allergy',
  'weight-meds': 'Weight-loss medication (injections or tablets)',
}

export const SYMPTOM_LABEL: Record<WeightSymptom, string> = {
  'low-appetite': 'Low appetite',
  nausea: 'Nausea',
  constipation: 'Constipation',
  tiredness: 'Tiredness',
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
      if (!a.training) return ''
      const n = sessionsPerWeek(a.training)
      if (n === 0) return 'No training right now'
      const by = countsByType(a.training)
      const counts = ACTIVITIES.filter((t) => by[t] > 0).map((t) => `${sessionsLabel(by[t])} ${DAY_LABEL[t].toLowerCase()}`)
      const effort = a.intensity ? ` · ${INTENSITY_LABEL[a.intensity].toLowerCase()}` : ''
      const lead = a.training.mode === 'average' ? `About ${sessionsLabel(n)} a week, it varies` : `${sessionsLabel(n)} a week`
      return `${lead} · ${counts.join(', ')}${effort}`
    }
    case 'aim':
      return a.aim ? AIM_LABEL[a.aim] : ''
    case 'changes':
      if (a.changes === null) return ''
      return a.changes.length === 0 ? 'Nothing’s changed' : list(a.changes.map((c) => CHANGE_LABEL[c]))
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
    case 'follow-move':
    case 'follow-rest':
    case 'follow-fuel': {
      const step = probeSteps(a.pinpoint).find((s) => s.stage === scene)
      if (!step) return ''
      return step.unsure ? 'Not sure' : stepSaid(step) ?? 'Answered'
    }
    case 'pinpoint': {
      const found = pinpointed(a)
      return found.length ? found.map((l) => l.pattern.name).join(', ') : ''
    }
    case 'circuit': {
      if (!a.circuit) return ''
      if (a.circuit.none) return 'None of these apply'
      const flags = a.circuit.flags.map((f) => (f === 'weight-meds' ? 'Weight-loss medication' : CIRCUIT_LABEL[f]))
      const feeling = a.tailorConsent?.accepted && a.symptoms?.length ? ` · since starting: ${a.symptoms.map((s) => SYMPTOM_LABEL[s].toLowerCase()).join(', ')}` : ''
      return list(flags) + feeling
    }
  }
}
