'use client'

import type { ReactNode } from 'react'
import { ACCENT, GLASS, tint } from '@/lib/ui/tokens'
import { Icon, type IconName } from './Icon'

/**
 * "Pick one of these" — the quiz's answer row, extracted.
 *
 * `Act2Quiz` has always drawn choices this way: a hairline row that goes accent
 * on selection, with a check that pops. It is most of why the quiz looks
 * considered. The hub asks the member to choose from a list twice — why they're
 * changing a product, and why they're leaving — and both were plain grey
 * rectangles with no selected state at all, because nothing recorded the choice
 * visually before moving on.
 *
 * `selected` is optional: a list that navigates on tap (the hub's two) simply
 * never sets it, and still gets the row, the glyph and the chevron.
 */

export interface OptionRowProps {
  label: ReactNode
  /** A second line under the label. */
  sub?: ReactNode
  /** Leading glyph — gives the list shape to scan by. */
  icon?: IconName
  selected?: boolean
  /** Square check instead of round: this list takes more than one answer. */
  multi?: boolean
  /** Show a trailing chevron instead of a check — the row leads somewhere. */
  navigates?: boolean
  onClick: () => void
  className?: string
}

function CheckMark({ selected, multi }: { selected: boolean; multi?: boolean }) {
  return (
    <div
      className={[
        // Square for multi-select, circle for pick-one — a second, at-a-glance
        // cue for "add more" vs "choose".
        'shrink-0 w-[18px] h-[18px] flex items-center justify-center border transition-all duration-200',
        multi ? 'rounded-[6px]' : 'rounded-full',
      ].join(' ')}
      style={{
        borderColor: selected ? ACCENT : GLASS.hairlineStrong,
        background: selected ? ACCENT : 'transparent',
        animation: selected ? 'check-pop 0.22s cubic-bezier(0.34,1.56,0.64,1) both' : undefined,
      }}
    >
      {selected && (
        <svg width="9" height="7" viewBox="0 0 10 8" fill="none" aria-hidden>
          <path d="M1 4L3.5 6.5L9 1" stroke="#0A0A0A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}

export function OptionRow({
  label,
  sub,
  icon,
  selected,
  multi,
  navigates,
  onClick,
  className,
}: OptionRowProps) {
  const isSelected = selected === true

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected === undefined ? undefined : isSelected}
      className={[
        'w-full flex items-center gap-3 px-4 py-3.5 min-h-14 rounded-xl border text-left',
        'transition-all duration-200 active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2',
        className ?? '',
      ].join(' ')}
      style={{
        background: isSelected ? tint(ACCENT, 7) : GLASS.surface,
        borderColor: isSelected ? tint(ACCENT, 55) : GLASS.hairline,
        ['--tw-ring-color' as string]: tint(ACCENT, 45),
      }}
    >
      {icon && (
        <Icon
          name={icon}
          size={18}
          className={`shrink-0 transition-colors duration-200 ${isSelected ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
        />
      )}
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium leading-snug"
          style={{ color: isSelected ? 'var(--color-text)' : 'var(--color-text-2)', fontFamily: 'var(--font-display)' }}
        >
          {label}
        </div>
        {sub && <div className="text-xs mt-1 leading-snug text-[var(--color-muted)]">{sub}</div>}
      </div>
      {navigates ? (
        <Icon name="chevron-right" size={16} className="shrink-0 text-[var(--color-muted)]" />
      ) : selected !== undefined ? (
        <CheckMark selected={isSelected} multi={multi} />
      ) : null}
    </button>
  )
}
