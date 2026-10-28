/**
 * Reactions that connect answers (Amp Consult and offer plan, Phase 6): two
 * answers that together point at a pattern, said together. Scripted here, one
 * file, in the review pack.
 *
 * When one fires it replaces the single-answer reaction on the next scene,
 * and the copy AI is told which answers it connects, so its own `react` line
 * can connect them too, under the same guards (`isClean`, the length cap).
 *
 * Every line restates what they said, side by side. Never why, never what it
 * means for their health, never what to do about it. Every combination reads
 * only answers the copy AI is already sent (`copyAnswersFor`), so the server
 * can work out the same combination from the same answers and nothing new
 * leaves the browser.
 */

import { caffeineCount, sessionsPerWeek, sleepHours } from './reactions'
import type { ConsultAnswers, SceneId } from './types'

export interface ComboReaction {
  id: string
  /** The scene whose answer completes it: the line is the reaction on the scene after. */
  on: SceneId
  when: (a: ConsultAnswers) => boolean
  /** Amp's line. */
  line: (a: ConsultAnswers) => string
  /** The answers it connects, plainly, for the copy AI. */
  connects: (a: ConsultAnswers) => string
}

const hours = (a: ConsultAnswers) => sleepHours(a.sleep)
const cups = (a: ConsultAnswers) => caffeineCount(a.caffeine)
const sessions = (a: ConsultAnswers) => Math.round(a.training ? sessionsPerWeek(a.training) : 0)
const short = (a: ConsultAnswers) => a.sleep !== null && hours(a) < 7
const flat = (a: ConsultAnswers) => a.energy !== null && a.energy <= 4

/** First match wins, so the more specific come first. */
export const COMBO_REACTIONS: readonly ComboReaction[] = [
  {
    id: 'short-nights-and-coffee',
    on: 'caffeine',
    when: (a) => short(a) && cups(a) >= 3,
    line: (a) => `${hours(a)} hours’ sleep and ${cups(a)} a day. I’m joining those up.`,
    connects: (a) => `about ${hours(a)} hours’ sleep a night and ${cups(a)} caffeinated drinks a day`,
  },
  {
    id: 'flat-afternoons-and-coffee',
    on: 'caffeine',
    when: (a) => flat(a) && cups(a) >= 3,
    line: (a) => `Flat afternoons and ${cups(a)} a day. Noted together.`,
    connects: (a) => `afternoon energy of ${a.energy}/10 and ${cups(a)} caffeinated drinks a day`,
  },
  {
    id: 'big-week-short-nights',
    on: 'sleep',
    when: (a) => short(a) && sessions(a) >= 5,
    line: (a) => `${sessions(a)} sessions a week on ${hours(a)} hours’ sleep. Noted.`,
    connects: (a) => `${sessions(a)} training sessions a week and about ${hours(a)} hours’ sleep a night`,
  },
  {
    id: 'short-nights-flat-afternoons',
    on: 'sleep',
    when: (a) => short(a) && flat(a),
    line: (a) => `${hours(a)} hours a night, and flat by the afternoon. Noted both.`,
    connects: (a) => `about ${hours(a)} hours’ sleep a night and afternoon energy of ${a.energy}/10`,
  },
  {
    id: 'big-week-flat-afternoons',
    on: 'energy',
    when: (a) => flat(a) && sessions(a) >= 5,
    line: (a) => `${sessions(a)} sessions a week, and flat by the afternoon. Noted.`,
    connects: (a) => `${sessions(a)} training sessions a week and afternoon energy of ${a.energy}/10`,
  },
  {
    id: 'indoors-flat-afternoons',
    on: 'daylight',
    when: (a) => a.daylight === 'hardly' && flat(a),
    line: () => 'Not much daylight, and flat afternoons. Noted both.',
    connects: (a) => `hardly any daylight on most days and afternoon energy of ${a.energy}/10`,
  },
]

/** The combination the answer to `scene` completes, if any. */
export function comboFor(scene: SceneId, a: ConsultAnswers): ComboReaction | null {
  return COMBO_REACTIONS.find((c) => c.on === scene && c.when(a)) ?? null
}
