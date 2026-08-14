'use client'

import { Chip } from '@/components/ui/Chip'
import { TONE } from '@/lib/ui/tokens'
import type { IconName } from '@/components/ui/Icon'
import type { StatusTone } from '@/lib/feedback'

/** The tone colours moved to `@/lib/ui/tokens`; re-exported so callers don't move. */
export function toneColor(tone: StatusTone): string {
  return TONE[tone]
}

interface Props {
  label: string
  /** A glyph name — not a character. See `LineStatus.statusIcon`. */
  icon: IconName
  tone: StatusTone
}

/**
 * A small, glanceable status pill used on product cards.
 *
 * The `icon` prop used to be a `string` and rendered whatever character it was
 * handed, which is how `🌱` and `⚡` got onto a subscription screen. It takes a
 * glyph name now, so an emoji cannot reach this component at all.
 */
export function StatusBadge({ label, icon, tone }: Props) {
  return <Chip color={TONE[tone]} icon={icon}>{label}</Chip>
}
