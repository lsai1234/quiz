'use client'

import { QuizIcon } from './QuizIcon'

/**
 * The answer control, shared by both quizzes.
 *
 * Lifted out of `Act2Quiz` unchanged when the v2 adaptive interview arrived.
 * Two quizzes drawing their own version of the same control is how they drift
 * apart visually, and a visual difference between the arms would contaminate
 * the experiment: a conversion gap has to be attributable to the questions, not
 * to one arm's options having a nicer press state.
 */

// Editorial-minimal selection mark — a small precise check, accent on select.
export function CheckMark({ selected, reduced, multi }: { selected: boolean; reduced?: boolean; multi?: boolean }) {
  return (
    <div
      className={[
        // Square (checkbox) for multi-select, circle (radio) for single — a
        // second, at-a-glance cue for "add more" vs "pick one".
        'shrink-0 w-[18px] h-[18px] flex items-center justify-center border transition-all duration-200',
        multi ? 'rounded-[6px]' : 'rounded-full',
        selected ? 'border-[#00D4FF] bg-[#00D4FF]' : 'border-white/15 bg-transparent',
      ].join(' ')}
      style={selected && !reduced ? { animation: 'check-pop 0.22s cubic-bezier(0.34,1.56,0.64,1) both' } : undefined}
    >
      {selected && (
        <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="#0A0A0A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}

// One refined option card. A leading monoline icon (muted, accent on select)
// gives back at-a-glance scannability without the emoji look; confident type, a
// hairline border, and a crisp accent-selected state with a small check. `multi`
// lays out a compact grid card; otherwise a full-width row with optional sub.
export function AnswerOption({
  label, sub, icon, selected, multi, onClick, inactive,
}: {
  label: string; sub?: string; icon?: string; selected: boolean
  multi?: boolean; onClick: () => void
  /**
   * Readable, but not yet answerable — the safety screen's health options
   * before the Article 9 tick is given.
   *
   * Dimmed rather than removed, because the question is what the tick is ABOUT:
   * nobody can agree to answer something they have not been allowed to read.
   * And dimmed rather than left looking live, because an option that takes a
   * tap and does nothing is the one state worse than either.
   *
   * Not `disabled` — the click still fires, so the caller can point at what
   * would switch it on. A dead button gives no feedback at all.
   */
  inactive?: boolean
}) {
  const base = selected
    ? 'border-[#00D4FF]/55 bg-[#00D4FF]/[0.07]'
    : 'border-white/[0.08] bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.04]'
  const iconColor = selected ? 'text-[#00D4FF]' : 'text-white/40'

  if (multi) {
    return (
      <button
        onClick={onClick}
        aria-pressed={selected}
        className={[
          'relative w-full flex items-center gap-2 text-left rounded-xl border px-3 py-3 pr-8',
          'transition-all duration-200 active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40',
          inactive ? 'opacity-40' : '',
          base,
        ].join(' ')}
      >
        {icon && <QuizIcon name={icon} size={17} className={`shrink-0 transition-colors duration-200 ${iconColor}`} />}
        {/* The compact card used to render the label only, so a `sub` passed to
            a multi option was silently thrown away — "Young children · Nursery
            or primary school" arrived as "Young children". It shows now. */}
        <span className="min-w-0">
          <span
            className={`block text-[13px] font-medium leading-snug ${selected ? 'text-white' : 'text-white/70'}`}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {label}
          </span>
          {sub && <span className="block text-[11px] mt-0.5 text-white/35 leading-snug">{sub}</span>}
        </span>
        <div className="absolute top-1/2 right-3 -translate-y-1/2">
          <CheckMark selected={selected} multi />
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'w-full flex items-center gap-3.5 px-5 py-4 rounded-xl border text-left',
        'transition-all duration-200 active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00D4FF]/40',
        base,
      ].join(' ')}
    >
      {icon && <QuizIcon name={icon} size={20} className={`shrink-0 transition-colors duration-200 ${iconColor}`} />}
      <div className="flex-1 min-w-0">
        <div
          className={`text-[15px] font-medium leading-snug ${selected ? 'text-white' : 'text-white/80'}`}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {label}
        </div>
        {sub && <div className="text-[13px] mt-1 text-white/35 leading-snug">{sub}</div>}
      </div>
      <CheckMark selected={selected} />
    </button>
  )
}
