import type { ReactNode } from 'react'
import { ACCENT, tint } from '@/lib/ui/tokens'
import { Icon, type IconName } from './Icon'

/**
 * An aside — a reassurance, a caveat, a demo-mode notice.
 *
 * Built in the language of the quiz's "did you know?" chip rather than the hub's
 * current approach of a paragraph in a tinted box: a glyph in a tinted disc, then
 * the text. The disc is what stops it reading as an error message.
 *
 * `role="alert"` is opt-in via `live`, because most notes are ambient and
 * announcing them interrupts a screen-reader user mid-sentence. Set it only when
 * the note appeared in response to something they just did.
 */
export function Note({
  children,
  icon = 'info',
  color = ACCENT,
  live,
  className,
}: {
  children: ReactNode
  icon?: IconName
  color?: string
  live?: boolean
  className?: string
}) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-3 ${className ?? ''}`}
      role={live ? 'alert' : undefined}
      style={{ background: tint(color, 7), border: `1px solid ${tint(color, 22)}` }}
    >
      <span
        className="mt-0.5 shrink-0 flex items-center justify-center w-6 h-6 rounded-full"
        style={{ background: tint(color, 16), color }}
      >
        <Icon name={icon} size={13} />
      </span>
      <div className="min-w-0 text-[12.5px] leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
        {children}
      </div>
    </div>
  )
}
