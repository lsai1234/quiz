'use client'

import { Badge } from '@/components/system'
import type { IconName } from '@/components/ui/Icon'
import type { StatusTone } from '@/lib/feedback'

/**
 * A small, glanceable status pill used on product cards.
 *
 * The `icon` prop used to be a `string` and rendered whatever character it was
 * handed, which is how `🌱` and `⚡` got onto a subscription screen. It takes a
 * glyph name now, so an emoji cannot reach this component at all.
 *
 * The four feedback tones map onto the system's semantic set rather than
 * carrying colours of their own. `building` is the accent because a line that is
 * still working towards its effect window is the house's own signal, not a
 * warning — that mapping is the whole reason this indirection exists.
 */
const TONE: Record<StatusTone, 'positive' | 'accent' | 'info' | 'attention'> = {
  good: 'positive',
  building: 'accent',
  essential: 'info',
  review: 'attention',
}

interface Props {
  label: string
  /** A glyph name — not a character. See `LineStatus.statusIcon`. */
  icon: IconName
  tone: StatusTone
}

/**
 * The raw colour for a tone, for the two places that draw rather than label: a
 * progress ring's stroke and a check-in journey's dot. Everything else should
 * use `StatusBadge` or a `Badge` tone and let the system own the colour.
 */
export function toneColor(tone: StatusTone): string {
  return TONE[tone] === 'accent' ? 'var(--accent)' : `var(--tone-${TONE[tone]})`
}

export function StatusBadge({ label, icon, tone }: Props) {
  return (
    <Badge tone={TONE[tone]} icon={icon}>
      {label}
    </Badge>
  )
}
