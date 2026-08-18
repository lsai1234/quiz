import type { ReactNode } from 'react'

/**
 * The house icon set — one monoline glyph vocabulary for the whole app.
 *
 * Construction rules, which every glyph obeys and any new one must:
 * a 24×24 viewBox, `fill="none"`, `stroke="currentColor"`, `strokeWidth={1.6}`,
 * round caps and joins. Colour and size come from the parent, so a glyph can sit
 * in muted text, go accent on selection, and scale from an 11px badge to a 40px
 * product tile without a second asset.
 *
 * This exists because the member-facing app had two icon systems: this one (as
 * `QuizIcon`, on the quiz and the stack reveal) and OS emoji (everywhere in the
 * hub). Emoji render as somebody else's artwork — a different style per platform,
 * unstyleable, and cartoonish next to the rest of the design.
 *
 * The glyph map below is the full set: the 42 that `QuizIcon` already carried,
 * plus the interface glyphs the hub needs to stop typing `✕`, `▲`, `+` and `−`
 * as text. `QuizIcon` is collapsed into a re-export of this file in Phase 1 of
 * `docs/MYHUB_REDESIGN.md`; until then the quiz keeps its own copy so this phase
 * changes nothing that already ships.
 */

const GLYPHS = {
  // ── Performance goals ──
  dumbbell: <><path d="M6.5 9v6M9.5 7.5v9M14.5 7.5v9M17.5 9v6M9.5 12h5" /></>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2 3z" />,
  bolt: <path d="M13 2 4 14h7l-1 8 10-12h-7l1-8z" />,
  peak: <path d="M3 19 9 8l4 6 2-3 6 8z" />,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v4h-4" /></>,
  heart: <path d="M19 13.6c1.5-1.4 3-3.1 3-5.4A5.5 5.5 0 0 0 12 5 5.5 5.5 0 0 0 2 8.2c0 2.3 1.5 4 3 5.4l7 6.9z" />,
  'trending-up': <><path d="M3 17 9 11l4 4 8-8" /><path d="M16 7h5v5" /></>,
  droplet: <path d="M12 3 6.3 9.3a8 8 0 1 0 11.3 0z" />,

  // ── Wellbeing goals ──
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />,
  wave: <><path d="M2 9c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0" /><path d="M2 15c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0" /></>,
  crosshair: <><circle cx="12" cy="12" r="8" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  sparkle: <path d="M12 3c.5 3.5 1.5 4.5 5 5-3.5.5-4.5 1.5-5 5-.5-3.5-1.5-4.5-5-5 3.5-.5 4.5-1.5 5-5z" />,
  spiral: <path d="M12 12.5a1.5 1.5 0 1 1 1.6 1.5 3.5 3.5 0 1 1-3.6-3.6 5.5 5.5 0 1 1 5.6 5.6" />,
  thermometer: <path d="M12 4a2 2 0 0 0-2 2v8.2a4 4 0 1 0 4 0V6a2 2 0 0 0-2-2z" />,
  leaf: <><path d="M4 20c0-7 5-13 16-15-1 9-6 14-13 14a4 4 0 0 1-3-1z" /><path d="M5 19c3-4 6-6 10-7" /></>,

  // ── Lifestyle ──
  monitor: <><rect x="2.5" y="3.5" width="19" height="13" rx="2" /><path d="M8.5 21h7M12 16.5V21" /></>,
  brain: <><path d="M12 5a3 3 0 0 0-5 2.2A3 3 0 0 0 5 12a3 3 0 0 0 2 5 3 3 0 0 0 5 .5z" /><path d="M12 5a3 3 0 0 1 5 2.2A3 3 0 0 1 19 12a3 3 0 0 1-2 5 3 3 0 0 1-5 .5z" /><path d="M12 5v13" /></>,
  bone: <path d="M17 10c.7-.7 1.7 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .8.7 1.8 0 2.5l-7 7c-.7.7-1.7 0-2.5 0a2.5 2.5 0 0 0 0 5c.3 0 .5.2.5.5a2.5 2.5 0 1 0 5 0c0-.8-.7-1.8 0-2.5z" />,
  bloom: <><circle cx="12" cy="7" r="2.4" /><circle cx="12" cy="17" r="2.4" /><circle cx="7" cy="12" r="2.4" /><circle cx="17" cy="12" r="2.4" /><circle cx="12" cy="12" r="2.4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  'trending-down': <><path d="M3 7 9 13l4-4 8 8" /><path d="M16 17h5v-5" /></>,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,

  // ── Supplements / vitamins ──
  shaker: <><path d="M7 8h10l-1 11a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" /><path d="M6.5 8 7.5 4h9l1 4" /><path d="M8.5 12.5h7" /></>,
  flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /><path d="M7.5 16h9" /></>,
  capsule: <><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7z" /><path d="m8.5 8.5 7 7" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  hexagon: <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z" />,
  citrus: <><circle cx="12" cy="12" r="9" /><path d="M12 12 5.6 5.6M12 12l6.4-6.4M12 12l-6.4 6.4M12 12l6.4 6.4" /></>,
  diamond: <path d="M12 3 21 12 12 21 3 12z" />,
  bar: <><rect x="3" y="8.5" width="18" height="7" rx="2" /><path d="M7.5 8.5v7M11.5 8.5v7M15.5 8.5v7" /></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  minus: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,

  // Bundle tiers — an ascending bar chart whose height/count grows with the tier.
  bundle1: <path d="M4.5 19v-4" />,
  bundle2: <><path d="M4.5 19v-4" /><path d="M10.5 19v-7" /></>,
  bundle3: <><path d="M4.5 19v-4" /><path d="M10.5 19v-7" /><path d="M16.5 19v-10" /></>,
  bundle4: <><path d="M4.5 19v-4" /><path d="M10.5 19v-7" /><path d="M16.5 19v-10" /><path d="M22.5 19v-13" /></>,

  // ── Interface ──
  // These replace characters the hub was typing as text: ✕ ▲ ▼ + − ← →.
  x: <path d="M6 6l12 12M18 6 6 18" />,
  'chevron-down': <path d="M6 9.5 12 15.5l6-6" />,
  'chevron-up': <path d="M6 14.5 12 8.5l6 6" />,
  'chevron-right': <path d="M9.5 6 15.5 12l-6 6" />,
  'chevron-left': <path d="M14.5 6 8.5 12l6 6" />,
  'arrow-left': <><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></>,
  'arrow-right': <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  dash: <path d="M5 12h14" />,
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  // The share glyph is the OS one — a box with an arrow leaving the top —
  // because that is what the button actually opens on a phone, and inventing a
  // different mark for it would be inventing a different promise.
  share: <><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></>,
  download: <><path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M5 19h14" /></>,
  link: <><path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.2 1.2" /><path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.2-1.2" /></>,
  'alert-triangle': <><path d="M12 4 2.7 20h18.6z" /><path d="M12 10v4" /><path d="M12 17.2h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.8h.01" /></>,
  star: <path d="M12 3.5l2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.9l6.1-.8z" />,
  /** The neutral fallback for a glyph name we don't recognise. */
  dot: <circle cx="12" cy="12" r="2.5" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  'log-out': <><path d="M9.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4.5" /><path d="M16 8l4 4-4 4" /><path d="M20 12H9.5" /></>,

  // ── Subscription / delivery ──
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  box: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
  truck: <><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="18.5" r="2" /></>,
  'credit-card': <><rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20" /><path d="M6 15h4" /></>,
  pause: <path d="M9 5v14M15 5v14" />,
  play: <path d="M7 4.5 19 12 7 19.5z" />,
  'skip-forward': <><path d="M5 5l9 7-9 7z" /><path d="M19 5v14" /></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  swap: <><path d="M4 8h13" /><path d="M13 4l4 4-4 4" /><path d="M20 16H7" /><path d="M11 20l-4-4 4-4" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 4h4" /><path d="M6.5 7l1 13a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-13" /><path d="M10 11v6M14 11v6" /></>,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof GLYPHS

/** Every glyph name, for tests and for tooling that wants to enumerate the set. */
export const ICON_NAMES = Object.keys(GLYPHS) as IconName[]

export interface IconProps {
  name: IconName
  /** Square edge length in px. */
  size?: number
  className?: string
  /**
   * Give the glyph an accessible name. Omit it (the default) for decorative
   * icons sitting next to text that already says the same thing — those are
   * marked `aria-hidden` so screen readers don't read the label twice.
   */
  label?: string
}

export function Icon({ name, size = 18, className, label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {GLYPHS[name]}
    </svg>
  )
}

/**
 * Resolve a glyph name that arrived as a plain string — a catalogue field, a
 * quiz option, a slot visual. Falls back to a neutral hexagon rather than
 * rendering nothing, so bad data degrades to a designed placeholder.
 */
export function iconName(name: string | null | undefined, fallback: IconName = 'hexagon'): IconName {
  return name && name in GLYPHS ? (name as IconName) : fallback
}
