/**
 * Amp's scripted reactions.
 *
 * A short line at the top of each scene reacting to the answer just given
 * ("Four a week, solid."). Scripted now; the AI layer (V4) words them later and
 * falls back to these. They restate what was said and never mention products,
 * doses or results.
 */

import type { AgeBand, ConsultAnswers, ConsultGoal, SceneId } from './types'

const GOAL_WORDS: Record<ConsultGoal, string> = {
  performance: 'performance',
  energy: 'energy',
  sleep: 'sleep',
  focus: 'focus',
  ageing: 'healthy ageing',
  allround: 'all-round health',
}

const AGE_WORDS: Record<AgeBand, string> = {
  '18-24': '18–24',
  '25-34': '25–34',
  '35-44': '35–44',
  '45-54': '45–54',
  '55-64': '55–64',
  '65-plus': '65+',
}

export function sessionsPerWeek(week: ConsultAnswers['week']): number {
  return (week ?? []).filter((d) => d !== 'rest').length
}

export function sleepHours(sleep: ConsultAnswers['sleep']): number {
  if (!sleep) return 0
  const minutes = (sleep.wake - sleep.bed + 24 * 60) % (24 * 60)
  return Math.round((minutes / 60) * 4) / 4
}

export function caffeineCount(c: ConsultAnswers['caffeine']): number {
  return c ? c.coffee + c.tea + c.energy : 0
}

/** Amp's line about the answer to `scene`. Empty when there's nothing to say. */
export function reactionTo(scene: SceneId, a: ConsultAnswers): string {
  switch (scene) {
    case 'goals': {
      if (a.goals.length === 0) return ''
      return `${capitalise(GOAL_WORDS[a.goals[0]])} first. Got it.`
    }
    case 'about':
      return a.age ? `${AGE_WORDS[a.age]}. Noted.` : ''
    case 'training': {
      const n = sessionsPerWeek(a.week)
      if (n === 0) return 'A rest-heavy week. Fair.'
      if (n <= 2) return `${n === 1 ? 'One session' : 'Two sessions'} a week. Good start.`
      if (n <= 4) return `${WORDS[n]} a week, solid.`
      return `${WORDS[n]} a week. Serious.`
    }
    case 'energy': {
      if (a.energy === null) return ''
      if (a.energy <= 3) return 'Running low. Heard.'
      if (a.energy <= 6) return 'Middling. Noted.'
      return 'Charged up. Nice.'
    }
    case 'sleep': {
      if (!a.sleep) return ''
      const h = sleepHours(a.sleep)
      return h < 7 ? `${formatHours(h)} hours. Short.` : `${formatHours(h)} hours. Decent.`
    }
    case 'daylight':
      return a.daylight === 'hardly' ? 'Not much sun. Common.' : a.daylight ? 'Some sun. Good.' : ''
    case 'caffeine': {
      const n = caffeineCount(a.caffeine)
      if (!a.caffeine) return ''
      if (n === 0) return 'No caffeine. Clean.'
      if (n >= 4) return `${n} a day. Noted.`
      return `${n} a day. Steady.`
    }
    case 'food':
      return a.plate ? 'Plate noted.' : ''
    case 'body':
      return a.body === null ? '' : a.body.length === 0 ? 'All good. Great.' : 'Noted the sore spots.'
    case 'shelf':
      return a.shelf === null ? '' : a.shelf.length === 0 ? 'Fresh start.' : "I won't double up."
    case 'review':
      return 'All checked.'
    case 'circuit':
      return ''
  }
}

const WORDS: Record<number, string> = {
  1: 'One',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Quarter hours read naturally as decimals: 7, 7.25, 7.5. */
function formatHours(h: number): string {
  return String(h)
}
