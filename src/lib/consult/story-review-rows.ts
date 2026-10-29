/**
 * The read's story in the review pack (plan Phase 8): every line it adds.
 * The read's own content (patterns, evidence, fixes, claims, the gift's terms)
 * is already in the pack from Phase 5 and the offer.
 */
import type { ReviewRow } from './review-pack'
import { STORY_COPY } from './story-copy'
import { withChange, type DayRingData } from './day-ring'

const WHERE = 'The read’s story, after the charge-up (story-copy.ts)'

/** A day with a bedtime and a last cup, for the "Try this week" lines on the ring. */
const DAY: DayRingData = { sleep: { bed: 23 * 60 + 30, wake: 6 * 60 + 30 }, caffeine: { at: 16 * 60 }, training: null, daylight: null, energy: null }

export function storyRows(): ReviewRow[] {
  const rows: ReviewRow[] = (Object.entries(STORY_COPY) as [string, string][]).map(([key, line]) => ['Your read, the story', WHERE, line, `story-copy.ts “${key}”`])
  const tries = [
    withChange(DAY, { kind: 'lights-out', at: 22 * 60 + 30 }),
    withChange(DAY, { kind: 'last-caffeine', at: 14 * 60, from: 16 * 60 }),
    withChange(DAY, { kind: 'daylight', at: 12 * 60 + 30, minutes: 20 }),
    withChange(DAY, { kind: 'move', at: 7 * 60, minutes: 10 }),
  ]
  for (const t of tries) rows.push(['Your read, the story', '“Try this week”, on the day ring (day-ring.ts withChange)', t.text!, 'Under the ring when a fix is tapped; the times are their own, these are examples'])
  return rows
}
