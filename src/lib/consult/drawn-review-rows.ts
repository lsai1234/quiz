/**
 * Shape your day's lines in the review pack (plan Phase 7.4, live as "add"
 * from 2026-10-29): what the drawn day can add to Pinpoint's reasons, and
 * what it can give as "ruled out because". They restate the drawing; they
 * don't interpret it.
 */
import type { ReviewRow } from './review-pack'
import { DRAWN_ITEMS } from './pinpoint/drawn'

export function drawnRows(): ReviewRow[] {
  const where = 'Pinpoint evidence from the day they drew (pinpoint/drawn.ts)'
  return DRAWN_ITEMS.flatMap((item) =>
    item.options.flatMap((o): ReviewRow[] => {
      const line = item.said[o.key]
      if (!line) return []
      const towards = Object.values(o.pulls).some((v) => (v ?? 0) > 0)
      return [['Shape your day', where, line.replace('{dip}', '4pm'), `${o.label}: ${towards ? 'a reason, shown back to them and sent to the hunch AI like any answer' : 'shown as “ruled out because…”'}${line.includes('{dip}') ? '. The time is the dip’s; 4pm here as an example' : ''}`]]
    }),
  )
}
