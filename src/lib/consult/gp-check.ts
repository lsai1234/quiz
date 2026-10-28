/**
 * "Worth a GP check" (Amp Consult and offer plan, Phase 5): scripted lines for
 * answer combinations a supplement shouldn't paper over. Calm, never
 * diagnostic: each says what to mention and to whom, never what it might be.
 * Sourced from NHS pages, in the review pack, and shown only once approved
 * (`approvedGpChecks`). Approved by the owner on 2026-10-28.
 */
import { pinpointed } from './pinpoint/effects'
import type { ConsultAnswers } from './types'
import type { HabitSource } from './habits'

export interface GpCheck {
  id: string
  /** The combination of answers it is for, in plain words, for the review pack. */
  when: string
  applies: (a: ConsultAnswers) => boolean
  text: string
  source: HabitSource
  approved: boolean
}

const confirmed = (a: ConsultAnswers, id: string) => pinpointed(a).some((l) => l.pattern.id === id && l.state === 'yes')

export const GP_CHECKS: readonly GpCheck[] = [
  {
    id: 'broken-nights',
    when: 'Broken sleep most nights (restless sleep, or Broken nights pinpointed)',
    applies: (a) => a.sleep?.quality === 'broken' || confirmed(a, 'broken-nights'),
    text: 'Waking in the night most nights is worth mentioning to your GP, especially if it’s been going on for a while or is affecting your days.',
    source: { label: 'NHS: Insomnia', url: 'https://www.nhs.uk/conditions/insomnia/' },
    approved: true,
  },
  {
    id: 'losing-the-thread',
    when: 'Losing the thread more than they used to (Staying sharp pinpointed)',
    applies: (a) => confirmed(a, 'staying-sharp'),
    text: 'If you’re forgetting things more than you used to, or someone close to you has noticed, it’s worth a chat with your GP.',
    source: { label: 'NHS: Memory loss (amnesia)', url: 'https://www.nhs.uk/conditions/memory-loss-amnesia/' },
    approved: true,
  },
  {
    id: 'flagging-eating-less',
    when: 'Flagging while eating less (Eating less, running low pinpointed, or weight loss as the goal with low afternoon energy)',
    applies: (a) => confirmed(a, 'eating-less') || (a.goals[0] === 'weight' && a.energy !== null && a.energy <= 3),
    text: 'Feeling tired a lot while you’re eating less is worth mentioning to your GP, or to whoever is supporting your weight loss.',
    source: { label: 'NHS: Tiredness and fatigue', url: 'https://www.nhs.uk/conditions/tiredness-and-fatigue/' },
    approved: true,
  },
  {
    id: 'always-tired',
    when: 'Very low energy (2 out of 10 or less by the afternoon)',
    applies: (a) => a.energy !== null && a.energy <= 2,
    text: 'If you’ve felt this tired for a few weeks without an obvious reason, it’s worth seeing your GP.',
    source: { label: 'NHS: Tiredness and fatigue', url: 'https://www.nhs.uk/conditions/tiredness-and-fatigue/' },
    approved: true,
  },
]

export const GP_CHECK_BY_ID: Readonly<Record<string, GpCheck>> = Object.fromEntries(GP_CHECKS.map((g) => [g.id, g]))

export interface GpLine {
  id: string
  text: string
  source: HabitSource
}

/** Every line that applies, approved or not; `approvedGpChecks` is what may be shown. */
export function gpChecksFor(a: ConsultAnswers): GpLine[] {
  return GP_CHECKS.filter((g) => g.applies(a)).map((g) => ({ id: g.id, text: g.text, source: g.source }))
}

export function approvedGpChecks<T extends { id: string }>(lines: readonly T[], approved: (id: string) => boolean = (id) => GP_CHECK_BY_ID[id]?.approved === true): T[] {
  return lines.filter((l) => approved(l.id))
}
