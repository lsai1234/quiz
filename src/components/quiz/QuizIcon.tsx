import type { ReactNode } from 'react'

/**
 * Editorial monoline icon set for the quiz options. A single consistent stroke
 * weight, currentColor, no fills — the premium replacement for emojis. Each
 * option carries a small line glyph so you can scan by shape again without the
 * cartoonish OS-emoji look. Unknown names fall back to a neutral dot.
 */

const GLYPHS: Record<string, ReactNode> = {
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
}

export function QuizIcon({ name, size = 18, className }: { name?: string; size?: number; className?: string }) {
  const glyph = (name && GLYPHS[name]) || <circle cx="12" cy="12" r="2.5" />
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
      aria-hidden
    >
      {glyph}
    </svg>
  )
}
