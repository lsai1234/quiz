import { Icon, iconName } from '@/components/ui/Icon'

/**
 * The quiz's icon component — now a thin adapter over the shared set.
 *
 * The glyphs themselves moved to `@/components/ui/Icon`, because the hub needed
 * exactly the same drawings and had been typing `✕`, `▲`, `+` and `−` as text
 * instead. What stays here is the loose signature: quiz options, catalogue rows
 * and slot visuals all carry their glyph as a plain `string` from data, so this
 * takes one and resolves it, falling back to the neutral dot it always did.
 *
 * New code should reach for `Icon` directly and get a checked name.
 */
export function QuizIcon({ name, size = 18, className }: { name?: string; size?: number; className?: string }) {
  return <Icon name={iconName(name, 'dot')} size={size} className={className} />
}
