/**
 * The consult flow's new lines in the review pack (plan Phase 6): Amp's
 * hunch teaser and invite, one row per pattern, and the reactions that
 * connect answers, each for an example person who sets it off.
 */
import type { ReviewRow } from './review-pack'
import { COMBO_REACTIONS } from './combo-reactions'
import { HUNCH_AREA, INVITE_COPY, inviteLine, teaserLine } from './hunch-copy'
import { PATTERN_BY_ID } from './pinpoint/library'
import type { PatternId } from './pinpoint/types'
import { trainingDays } from './training'
import { EMPTY_ANSWERS, type ConsultAnswers } from './types'

/** Sets off every combination: six hours a night, four coffees, flat afternoons, five sessions, hardly any daylight. */
const EXAMPLE: ConsultAnswers = {
  ...EMPTY_ANSWERS,
  goals: ['energy'],
  energy: 3,
  sleep: { bed: 24 * 60 - 30, wake: 5 * 60 + 30, quality: 'ok' },
  caffeine: { coffee: 4, tea: 0, energy: 0 },
  daylight: 'hardly',
  training: trainingDays(['gym', 'gym', 'cardio', 'gym', 'gym', 'rest', 'rest']),
}

export function hunchRows(): ReviewRow[] {
  const where = 'The consult, after the core scenes (hunch-copy.ts)'
  const rows: ReviewRow[] = (Object.keys(HUNCH_AREA) as PatternId[]).flatMap((id): ReviewRow[] => [
    ['Hunch', `Teaser after the Rest section, for “${PATTERN_BY_ID[id].name}”`, teaserLine(id), 'Amp’s reaction on the scene after the Rest section, when this lead is at even odds or better. Names the area, never a cause'],
    ['Hunch', `Invite before the circuit check, for “${PATTERN_BY_ID[id].name}”`, `${inviteLine(id, 4).heading} ${inviteLine(id, 4).body}`, 'Heading and line. The number is how many questions Pinpoint expects to ask; 4 here as an example'],
  ])
  return [
    ...rows,
    ['Hunch', where, INVITE_COPY.kicker, 'Invite: above the heading'],
    ['Hunch', where, INVITE_COPY.check, 'Invite: button, into Pinpoint'],
    ['Hunch', where, INVITE_COPY.build, 'Invite: button, on to the circuit check'],
    ['Hunch', where, INVITE_COPY.note, 'Invite: under the buttons'],
    ['Hunch', 'Scene one (AmpConsult.tsx)', 'Short on time? Do the 1-minute version', 'Link on the first scene: switches to the Speed run'],
  ]
}

export function comboRows(): ReviewRow[] {
  return COMBO_REACTIONS.map((c) => [
    'Reactions that connect answers',
    `combo-reactions.ts “${c.id}”: on the ${c.on} answer`,
    c.line(EXAMPLE),
    `Example person: ${c.connects(EXAMPLE)}. Replaces the single-answer reaction; the copy AI is told the same connection for its own line`,
  ])
}
