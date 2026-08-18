'use client'

import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'

/**
 * "Pick one of these."
 *
 * The quiz has always drawn a choice this way — a hairline row that goes accent
 * on selection, with a check that pops — and it is most of why the quiz looks
 * considered next to the rest of the app. Both hubs ask this question and
 * neither drew it: My Hub's two "why are you changing / leaving" lists were grey
 * rectangles with no selected state at all, and the Founders Hub's three mode
 * pickers were bordered cards whose only state was a colour and the word
 * "Selected".
 *
 * ── Button, or radio ────────────────────────────────────────────────────────
 * It is a `<button>` by default, because two of these lists navigate on tap
 * rather than record an answer — and a radio that moves you to the next screen
 * is a radio that lies about what it does. Leave `selected` off for those and
 * the row is an ordinary one with a chevron.
 *
 * Set `role="radio"` when the row genuinely is one answer out of a set, and put
 * the rows in an element with `role="radiogroup"`. That is not decoration: a
 * radiogroup containing buttons is invalid, arrow keys stop working, and each
 * option loses the "2 of 5" a screen reader would otherwise announce. The two
 * have to be set together, which is why this is explicit rather than guessed
 * from whether `selected` was passed.
 *
 * `multi` squares the check off. A second, at-a-glance cue for "add more" versus
 * "choose one", which the shape of a control should carry rather than the copy.
 */

export interface OptionRowProps {
  label: ReactNode
  /** A second line under the label. */
  sub?: ReactNode
  /** Leading glyph — gives a list shape to scan by. */
  icon?: IconName
  /** Omit entirely for a row that navigates rather than answers. */
  selected?: boolean
  /** Square check instead of round: this list takes more than one answer. */
  multi?: boolean
  /** Trailing chevron instead of a check — the row leads somewhere. */
  navigates?: boolean
  /**
   * `radio` when the row is one answer out of a set. The caller must also wrap
   * the rows in `role="radiogroup"` with a name; see the note above.
   */
  role?: 'radio'
  disabled?: boolean
  onClick: () => void
  className?: string
}

function CheckMark({ selected, multi }: { selected: boolean; multi?: boolean }) {
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center"
      style={{
        width: 'var(--space-5)',
        height: 'var(--space-5)',
        borderRadius: multi ? 'var(--radius-chip)' : 'var(--radius-pill)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--edge-strong)'}`,
        background: selected ? 'var(--fill-accent)' : 'transparent',
        color: 'var(--ink-on-accent)',
        transition: 'background var(--duration-fast) var(--ease-settle), border-color var(--duration-fast) var(--ease-settle)',
      }}
    >
      {selected && <Icon name="check" size={12} />}
    </span>
  )
}

export function OptionRow({
  label,
  sub,
  icon,
  selected,
  multi,
  navigates,
  role,
  disabled,
  onClick,
  className,
}: OptionRowProps) {
  const isSelected = selected === true

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role={role}
      // A radio reports `aria-checked`; a toggle reports `aria-pressed`; a row
      // that navigates reports neither. Undefined rather than false in that last
      // case — a pressed state on something that does not toggle tells a screen
      // reader the wrong story.
      aria-checked={role === 'radio' ? isSelected : undefined}
      aria-pressed={role === 'radio' || selected === undefined ? undefined : isSelected}
      className={`system-control system-focus w-full flex items-center text-left ${className ?? ''}`}
      style={{
        gap: 'var(--space-3)',
        minHeight: 'var(--control-lg)',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-row)',
        border: `1px solid ${isSelected ? 'var(--accent-line)' : 'var(--edge)'}`,
        background: isSelected ? 'var(--accent-fill)' : 'var(--surface-1)',
        ['--hover-bg' as string]: isSelected ? 'var(--accent-fill)' : 'var(--surface-hover)',
        ['--hover-edge' as string]: isSelected ? 'var(--accent-line)' : 'var(--edge-strong)',
      }}
    >
      {icon && (
        <span className="shrink-0" style={{ color: isSelected ? 'var(--accent)' : 'var(--ink-3)' }}>
          <Icon name={icon} size={18} />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span
          className="block"
          style={{
            fontSize: 'var(--text-body-sm)',
            fontWeight: 'var(--weight-strong)',
            lineHeight: 'var(--leading-snug)',
            color: 'var(--ink-1)',
          }}
        >
          {label}
        </span>
        {sub && (
          <span
            className="block"
            style={{
              fontSize: 'var(--text-meta)',
              lineHeight: 'var(--leading-snug)',
              color: 'var(--ink-3)',
              marginTop: 'var(--space-1)',
            }}
          >
            {sub}
          </span>
        )}
      </span>

      {navigates ? (
        <span className="shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden>
          <Icon name="chevron-right" size={16} />
        </span>
      ) : (
        selected !== undefined && <CheckMark selected={isSelected} multi={multi} />
      )}
    </button>
  )
}
