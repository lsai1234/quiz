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

/**
 * The profile in Amp's words (build V8): "You train hard, sleep short and
 * rarely see daylight."
 *
 * Built from the answers by rule, not by a model, because the one thing it
 * must do is only restate what the person said — and a rule can guarantee
 * that. Up to three phrases, the most notable first; nothing about health,
 * products or what the stack will do.
 */
export function profileInWords(a: ConsultAnswers): string {
  const phrases: { text: string; weight: number }[] = []
  const sessions = sessionsPerWeek(a.week)
  if (a.week) {
    if (sessions >= 5) phrases.push({ text: a.intensity === 'easy' ? 'train most days' : 'train hard', weight: 3 })
    else if (sessions >= 3) phrases.push({ text: 'train regularly', weight: 2 })
    else if (sessions >= 1) phrases.push({ text: 'train now and then', weight: 1 })
    else phrases.push({ text: 'aren’t training right now', weight: 1 })
  }
  if (a.sleep) {
    const h = sleepHours(a.sleep)
    if (h < 7) phrases.push({ text: 'sleep short', weight: 3 })
    else if (a.sleep.quality === 'broken') phrases.push({ text: 'sleep restlessly', weight: 2.5 })
    else if (a.sleep.quality === 'restful') phrases.push({ text: 'sleep well', weight: 1 })
  }
  if (a.daylight === 'hardly') phrases.push({ text: 'rarely see daylight', weight: 3 })
  else if (a.daylight === 'daily') phrases.push({ text: 'get daylight every day', weight: 1 })
  if (a.energy !== null) {
    if (a.energy <= 3) phrases.push({ text: 'run low by the afternoon', weight: 2.5 })
    else if (a.energy >= 8) phrases.push({ text: 'stay charged all day', weight: 1.5 })
  }
  if (a.caffeine && a.caffeine.coffee + a.caffeine.tea + a.caffeine.energy >= 4) phrases.push({ text: 'lean on caffeine', weight: 2 })
  if (a.plate && readPlate(a.plate).plantBased) phrases.push({ text: 'eat fully plant-based', weight: 2 })

  // Stable: by weight, then in the order they were asked.
  const top = phrases
    .map((p, i) => ({ ...p, i }))
    .sort((x, y) => y.weight - x.weight || x.i - y.i)
    .slice(0, 3)
    .sort((x, y) => x.i - y.i)
    .map((p) => p.text)
  if (top.length === 0) return ''
  const list = top.length === 1 ? top[0] : `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}`
  return `You ${list}.`
}
