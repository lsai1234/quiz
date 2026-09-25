/**
 * The consult's glyph set (build S2).
 *
 * Drawn for this surface rather than borrowed: goals, training types, the
 * battery and bolt, and the handful of UI marks the scenes need. Every glyph is
 * on a 24-unit grid with a 2-unit stroke, whole-number coordinates where a line
 * is straight, and round joins — which is what keeps them crisp at 16, 24 and
 * 48px rather than going soft at the small end. They paint in `currentColor`,
 * so the scene decides the tone.
 *
 * Decorative by default (`aria-hidden`). Pass `title` when the glyph is the only
 * thing naming a control.
 */

import type { ReactNode } from 'react'

export type GlyphName =
  // Goals
  | 'performance'
  | 'energy'
  | 'sleep'
  | 'focus'
  | 'ageing'
  | 'allround'
  // Training types
  | 'rest'
  | 'gym'
  | 'cardio'
  | 'sport'
  // Signature
  | 'bolt'
  | 'battery'
  // Scenes
  | 'sun'
  | 'cup'
  | 'plate'
  | 'body'
  | 'shelf'
  | 'shield'
  | 'profile'
  // Food & drink
  | 'fish'
  | 'meat'
  | 'poultry'
  | 'egg'
  | 'dairy'
  | 'beans'
  | 'leaf'
  | 'fruit'
  | 'nut'
  | 'grain'
  | 'tea'
  | 'can'
  // UI marks
  | 'back'
  | 'next'
  | 'check'
  | 'plus'
  | 'minus'
  | 'close'
  | 'edit'
  | 'info'
  | 'spark'
  | 'mic'
  | 'camera'
  | 'comfort'

const PATHS: Record<GlyphName, ReactNode> = {
  performance: (
    <>
      <path d="M3 9v6M6 7v10M18 7v10M21 9v6" />
      <path d="M6 12h12" />
    </>
  ),
  energy: <path d="M13 2 5 13h6l-1 9 8-11h-6l1-9Z" />,
  sleep: (
    <>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      <path d="M15 4h4l-4 4h4" />
    </>
  ),
  focus: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  ageing: (
    <>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
      <path d="M8 12h2l1-2 2 4 1-2h2" />
    </>
  ),
  allround: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18" />
      <path d="M5.6 5.6c3.5 2.4 9.3 2.4 12.8 0M5.6 18.4c3.5-2.4 9.3-2.4 12.8 0" />
    </>
  ),
  rest: (
    <>
      <path d="M4 18h16" />
      <path d="M6 18v-5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v5" />
      <path d="M14 3h4l-4 4h4" />
    </>
  ),
  gym: (
    <>
      <path d="M4 9v6M7 6v12M17 6v12M20 9v6" />
      <path d="M7 12h10" />
    </>
  ),
  cardio: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  sport: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7l4 3-1.5 5h-5L8 10l4-3Z" />
      <path d="M12 3v4M20.5 9.5 16 10M17 20l-2.5-5M7 20l2.5-5M3.5 9.5 8 10" />
    </>
  ),
  bolt: <path d="M13 2 5 13h6l-1 9 8-11h-6l1-9Z" />,
  battery: (
    <>
      <rect x="2" y="7" width="18" height="10" rx="2" />
      <path d="M22 11v2" />
      <path d="M12 9l-3 3h4l-3 3" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  cup: (
    <>
      <path d="M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6V8Z" />
      <path d="M17 10h1a3 3 0 0 1 0 6h-1.5" />
      <path d="M8 2v3M12 2v3" />
    </>
  ),
  plate: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
    </>
  ),
  body: (
    <>
      <circle cx="12" cy="4.5" r="2.5" />
      <path d="M12 7v7M6 10l6-2 6 2M9 22l3-8 3 8" />
    </>
  ),
  shelf: (
    <>
      <path d="M3 20h18" />
      <rect x="5" y="9" width="5" height="11" rx="1.5" />
      <rect x="14" y="6" width="5" height="14" rx="1.5" />
      <path d="M5 12h5M14 9h5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  profile: (
    <>
      <path d="M12 3l8 5v8l-8 5-8-5V8l8-5Z" />
      <path d="M12 7l4 3v4l-4 3-4-3v-4l4-3Z" />
    </>
  ),
  fish: (
    <>
      <path d="M3 12c3-4.5 7-6 11-6 3 0 5.5 2.5 6.5 6-1 3.5-3.5 6-6.5 6-4 0-8-1.5-11-6Z" />
      <path d="M3 12 1.5 8.5M3 12l-1.5 3.5" />
      <circle cx="16" cy="11" r="1" />
    </>
  ),
  meat: (
    <>
      <path d="M6 4c5-2 13 1 14 7 1 5-3 9-8 9-6 0-10-4-10-9 0-3 1.5-5.5 4-7Z" />
      <circle cx="13" cy="12" r="3" />
    </>
  ),
  poultry: (
    <>
      <path d="M15 3a6 6 0 0 1 3 11l-3 1-4 4" />
      <path d="M15 3a6 6 0 0 0-6 6l-1 3 3 3" />
      <path d="M8 19a2 2 0 1 1-3-2 2 2 0 1 1 2-3" />
    </>
  ),
  egg: <path d="M12 3c-4 0-7 6.5-7 11a7 7 0 0 0 14 0c0-4.5-3-11-7-11Z" />,
  dairy: (
    <>
      <path d="M8 2h8M9 2v4l-3 4v11h12V10l-3-4V2" />
      <path d="M6 14h12" />
    </>
  ),
  beans: (
    <>
      <path d="M5 13c-2-3 0-8 4-8 3 0 3 3 2 5s-1 4 1 5-1 5-4 4-2-3-3-6Z" />
      <path d="M15 9c3-1 6 2 5 6s-4 5-6 4 0-3-1-5-1-4 2-5Z" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19C4 11 9 4 20 4c0 11-7 16-15 15Z" />
      <path d="M5 19 13 11" />
    </>
  ),
  fruit: (
    <>
      <path d="M12 7c-2-1.5-7-1.5-8 3-1 5 2 11 5 11 1.5 0 2-.5 3-.5s1.5.5 3 .5c3 0 6-6 5-11-1-4.5-6-4.5-8-3Z" />
      <path d="M12 7c0-2 1-4 3-5" />
    </>
  ),
  nut: (
    <>
      <path d="M5 10h14" />
      <path d="M6 10a6 6 0 0 1 12 0" />
      <path d="M6 10c0 6 3 10 6 11 3-1 6-5 6-11" />
    </>
  ),
  grain: (
    <>
      <path d="M12 22V8" />
      <path d="M12 8c-2-1-3-3-2-6 2 1 3 3 2 6Zm0 0c2-1 3-3 2-6-2 1-3 3-2 6Z" />
      <path d="M12 13c-2.5 0-4-1.5-4.5-4 2.5 0 4 1.5 4.5 4Zm0 0c2.5 0 4-1.5 4.5-4-2.5 0-4 1.5-4.5 4Z" />
      <path d="M12 18c-2.5 0-4-1.5-4.5-4 2.5 0 4 1.5 4.5 4Zm0 0c2.5 0 4-1.5 4.5-4-2.5 0-4 1.5-4.5 4Z" />
    </>
  ),
  tea: (
    <>
      <path d="M3 10h14v3a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-3Z" />
      <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M2 21h17" />
    </>
  ),
  can: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M7 7h10M7 17h10" />
      <path d="M13 9l-3 3h4l-3 3" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="M13 7l4 4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7v1" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M12 8l1.2 2.8L16 12l-2.8 1.2L12 16l-1.2-2.8L8 12l2.8-1.2L12 8Z" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  camera: (
    <>
      <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  comfort: (
    <>
      <path d="M4 18 9 6l5 12M5.6 14h6.8" />
      <path d="M15 18l3-7 3 7M16 16h4" />
    </>
  ),
}

/** Glyphs drawn as a solid shape rather than a line. */
const FILLED: ReadonlySet<GlyphName> = new Set<GlyphName>(['bolt'])

export const GLYPH_NAMES = Object.keys(PATHS) as GlyphName[]

interface Props {
  name: GlyphName
  /** Rendered size in px. The set is checked at 16, 24 and 48. */
  size?: number
  /** Accessible name. Omit for a decorative glyph. */
  title?: string
  className?: string
}

export function Glyph({ name, size = 24, title, className }: Props) {
  const filled = FILLED.has(name)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      data-glyph={name}
    >
      {PATHS[name]}
    </svg>
  )
}
