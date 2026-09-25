/**
 * The charge profile (build H5): the answers as six scores, 0–100.
 *
 * Each score reads straight off the answers, so it can be explained in a
 * sentence and matches what the person told us. Higher is more charged —
 * more training, more energy, better sleep, more daylight, a fuller plate,
 * fewer sore spots — which is what makes the shape read at a glance: a big
 * even hexagon is someone in good shape, a dent is where the stack will lean.
 */

import { readPlate } from './plate'
import { sessionsPerWeek, sleepHours } from './reactions'
import type { ConsultAnswers, Daylight, SleepQuality } from './types'

export type ProfileArea = 'training' | 'energy' | 'sleep' | 'daylight' | 'nutrition' | 'recovery'

export const PROFILE_AREAS: ProfileArea[] = ['training', 'energy', 'sleep', 'daylight', 'nutrition', 'recovery']

export const PROFILE_LABEL: Record<ProfileArea, string> = {
  training: 'Training',
  energy: 'Energy',
  sleep: 'Sleep',
  daylight: 'Daylight',
  nutrition: 'Nutrition',
  recovery: 'Recovery',
}

export type ChargeProfile = Record<ProfileArea, number>

const DAYLIGHT_SCORE: Record<Daylight, number> = { hardly: 15, some: 45, most: 75, daily: 100 }
const QUALITY_FACTOR: Record<SleepQuality, number> = { restful: 1, ok: 0.85, broken: 0.6 }

const clamp = (n: number) => Math.round(Math.max(0, Math.min(100, n)))

export function chargeProfile(a: ConsultAnswers): ChargeProfile {
  const sessions = sessionsPerWeek(a.week)
  // Five sessions is full marks; effort adds a little on top of the count.
  const effort = a.intensity === 'hard' ? 10 : a.intensity === 'steady' ? 5 : 0
  const training = sessions === 0 ? 0 : sessions * 20 + effort

  const energy = a.energy === null ? 50 : a.energy * 10

  let sleep = 50
  if (a.sleep) {
    const h = sleepHours(a.sleep)
    // 7–9 hours is full; each hour short costs 25; oversleeping costs a little.
    const hours = h >= 7 && h <= 9 ? 100 : h < 7 ? 100 - (7 - h) * 25 : 100 - (h - 9) * 10
    sleep = hours * (a.sleep.quality ? QUALITY_FACTOR[a.sleep.quality] : 0.85)
  }

  const daylight = a.daylight ? DAYLIGHT_SCORE[a.daylight] : 50

  let nutrition = 50
  if (a.plate && a.plate.length) {
    const variety = Math.min(1, a.plate.length / 8) * 70
    const fish = readPlate(a.plate).noOilyFish ? 0 : 15
    const plants = a.plate.includes('greens') || a.plate.includes('fruit') ? 15 : 0
    nutrition = variety + fish + plants
  }

  // Sore spots and a hard week with short sleep both pull recovery down.
  const spots = a.body?.length ?? 0
  const shortSleep = a.sleep ? sleepHours(a.sleep) < 7 : false
  const recovery = 100 - spots * 15 - (sessions >= 5 && shortSleep ? 15 : 0) - (a.sleep?.quality === 'broken' ? 10 : 0)

  return {
    training: clamp(training),
    energy: clamp(energy),
    sleep: clamp(sleep),
    daylight: clamp(daylight),
    nutrition: clamp(nutrition),
    recovery: clamp(recovery),
  }
}
