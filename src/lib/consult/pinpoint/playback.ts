/**
 * What Amp says in Pinpoint, scripted (plan v5 §5.3). The AI may reword these
 * later; these are always the fallback, and they only ever restate answers.
 */

import type { Ingredient } from '../circuit'
import { PATTERN_BY_ID } from './library'
import { isOut, leads, type Lead } from './leads'
import type { Answers, PatternId } from './types'

/** "the 3pm crash" in a sentence, "Wired and tired" as it is. */
export function nameInText(name: string): string {
  return /^The /.test(name) ? `the${name.slice(3)}` : name.charAt(0).toLowerCase() + name.slice(1)
}

/** "Why I'm asking": what this question separates. */
export function whyAsking(tells: PatternId[]): string {
  const names = tells.map((id) => nameInText(PATTERN_BY_ID[id].name))
  if (names.length >= 2) return `It tells ${names[0]} apart from ${names[1]}.`
  if (names.length === 1) return `It checks whether it’s ${names[0]}.`
  return 'It’s the most useful thing left to ask.'
}

/** Hot and cold: Amp's line after an answer, from how the leads moved. */
export function pinpointReaction(before: Answers, after: Answers): string {
  const was = new Map(leads(before).map((l) => [l.pattern.id, l]))
  const now = leads(after)
  const gone = now.find((l) => isOut(l) && was.get(l.pattern.id) && !isOut(was.get(l.pattern.id)!))
  if (gone) return `Ah. Not ${nameInText(gone.pattern.name)}, then.`
  let rise = 0
  for (const l of now) rise = Math.max(rise, l.p - (was.get(l.pattern.id)?.p ?? l.p))
  if (rise > 0.2) return 'Thought so.'
  if (rise > 0.1) return 'Warmer.'
  if (rise > 0.03) return 'Interesting.'
  return 'Noted.'
}

/** After a verdict. */
export const VERDICT_LINE = {
  yes: 'Knew it. Locked in.',
  partly: 'Partly. One more question on that.',
  no: 'Crossing that off.',
} as const

/**
 * The hunch card's play-back: at most three lines, so the card and its three
 * answers fit a small phone. Core answers read first; what you said in the
 * round gets two of the three when there's core evidence too, since that's
 * what the hunch rests on.
 */
export function hunchEvidence(lead: Lead): string[] {
  const core = [...new Set(lead.support.filter((e) => e.from === 'core').map((e) => e.text))]
  const said = [...new Set(lead.support.filter((e) => e.from === 'answer').map((e) => e.text))].filter((t) => !core.includes(t))
  const keepSaid = said.slice(0, core.length ? 2 : 3)
  return [...core.slice(0, 3 - keepSaid.length), ...keepSaid]
}

/** Why something was ruled out, in one line. */
export function ruledOutBecause(lead: Lead): string {
  if (lead.state === 'no') return 'You said it isn’t you.'
  return lead.against ?? 'Your answers pointed elsewhere.'
}

/** Ingredient families, as a person would say them. */
const INGREDIENT_WORDS: Partial<Record<Ingredient, string>> = {
  caffeine: 'caffeine',
  stimulant: 'stimulant pre-workouts',
  'fat-burner': 'fat burners',
}

/** "Kept out: caffeine and stimulant pre-workouts, because …", for a pattern the person said was them. */
export function keepOutLine(lead: Lead): string | null {
  const k = lead.pattern.keepOut
  if (!k || lead.state !== 'yes') return null
  const words = k.ingredients.map((i) => INGREDIENT_WORDS[i] ?? i.replace(/-/g, ' '))
  const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0]
  return `Kept out: ${list}, because ${k.why}.`
}
