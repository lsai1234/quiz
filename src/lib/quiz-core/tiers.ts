/**
 * Value-first depth tiers (config). Each tier is a ranked prefix of the full
 * ("complete") stack; the results screen prices them so the customer sees value
 * before price. Centralised here so the depths/labels are editable in one place.
 */
import type { StackLevel } from '@/lib/types'

export const TIER_ORDER: StackLevel[] = ['essentials', 'performance', 'complete']

/** How many of the ranked slots each depth includes. */
export const TIER_SIZES: Record<StackLevel, number> = { essentials: 3, performance: 5, complete: 7 }

export const TIER_META: Record<StackLevel, { label: string; blurb: string; badge?: string }> = {
  essentials: { label: 'Essentials', blurb: 'The core that moves the needle most' },
  performance: { label: 'Balanced', blurb: 'A well-rounded daily stack', badge: 'Recommended' },
  complete: { label: 'Complete', blurb: 'Every angle covered' },
}
