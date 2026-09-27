/**
 * Amp's scripted reactions.
 *
 * A short line at the top of each scene reacting to the answer just given
 * ("Four a week, solid."). Scripted now; the AI layer (V4) words them later and
 * falls back to these. They restate what was said and never mention products,
 * doses or results.
 */

import type { AmpReaction } from './motion'
import { countsByType, sessionsPerWeek } from './training'
import type { AgeBand, ConsultAnswers, ConsultGoal, SceneId } from './types'

const GOAL_WORDS: Record<ConsultGoal, string> = {
  performance: 'performance',
  energy: 'energy',
  sleep: 'sleep',
  focus: 'focus',
  ageing: 'healthy ageing',
  allround: 'all-round health',
  weight: 'weight loss',
}

const AGE_WORDS: Record<AgeBand, string> = {
  'under-18': 'Under 18',
  '18-24': '18–24',
  '25-34': '25–34',
  '35-44': '35–44',
  '45-54': '45–54',
  '55-64': '55–64',
  '65-plus': '65+',
}

export { sessionsPerWeek } from './training'

export function sleepHours(sleep: ConsultAnswers['sleep']): number {
  if (!sleep) return 0
  const minutes = (sleep.wake - sleep.bed + 24 * 60) % (24 * 60)
  return Math.round((minutes / 60) * 4) / 4
}

export function caffeineCount(c: ConsultAnswers['caffeine']): number {
  return c ? c.coffee + c.tea + c.energy : 0
}

/**
 * Amp's line about the answer to `scene`. Empty when there's nothing to say.
 * A scene answered in words (a "Tell Amp more" note, batch 4) gets a line that
 * says it was heard, never one read off an empty widget.
 */
export function reactionTo(scene: SceneId, a: ConsultAnswers): string {
  return fromWidget(scene, a) || (a.notes[scene] ? 'Heard you. That helps.' : '')
}

function fromWidget(scene: SceneId, a: ConsultAnswers): string {
  switch (scene) {
    case 'goals': {
      if (a.goals.length === 0) return ''
      return `${capitalise(GOAL_WORDS[a.goals[0]])} first. Got it.`
    }
    case 'about':
      return a.age ? `${AGE_WORDS[a.age]}. Noted.` : ''
    case 'training': {
      if (!a.training) return ''
      const n = Math.round(sessionsPerWeek(a.training))
      if (n === 0) return 'A rest-heavy week. Fair.'
      const count = n === 1 ? 'one session' : n === 2 ? 'two sessions' : (WORDS[n] ?? String(n)).toLowerCase()
      // "It varies" is an average, so Amp says "about".
      const said = a.training?.mode === 'average' ? `About ${count}` : capitalise(count)
      if (n <= 2) return `${said} a week. Good start.`
      if (n <= 4) return `${said} a week, solid.`
      return `${said} a week. Serious.`
    }
    case 'aim':
      return a.aim === 'muscle' ? 'Building. Got it.' : a.aim === 'strength' ? 'Stronger it is.' : a.aim === 'sport' ? 'Match fit. Noted.' : a.aim ? 'Going the distance. Noted.' : ''
    case 'changes':
      return a.changes === null ? '' : a.changes.length === 0 ? 'Nothing’s changed. Great.' : 'Thanks. That helps a lot.'
    case 'energy':
      return a.energy === null ? '' : `Energy ${a.energy}/10. Noted.`
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
    case 'follow-move':
    case 'follow-rest':
    case 'follow-fuel':
    case 'pinpoint':
      // Pinpoint reacts inside its own screens (hot and cold).
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

/**
 * Amp's micro-reaction to an answer as it's given (build U6), or null. Read
 * off what changed — the answer before and the patch — so it can only ever
 * follow something the person just did.
 */
export function ampReactionTo(before: ConsultAnswers, patch: Partial<ConsultAnswers>): AmpReaction | null {
  if (patch.training && countsByType(patch.training).gym > countsByType(before.training).gym) return 'flex'
  if (patch.energy === 10 && before.energy !== 10) return 'burst'
  if (patch.daylight && patch.daylight !== before.daylight) return 'sun'
  return null
}
