/**
 * The ring "Your day" is drawn on: midnight at the top, clockwise, round
 * (50, 50), as the consult's day ring draws it. Kept here, small, so the
 * results page doesn't load the consult's ring to place a few dots.
 */
const DAY = 24 * 60

export function ringPoint(minutes: number, r: number): { x: number; y: number } {
  const a = (((((minutes % DAY) + DAY) % DAY) / DAY) * 360 - 90) * (Math.PI / 180)
  return { x: Math.round((50 + r * Math.cos(a)) * 100) / 100, y: Math.round((50 + r * Math.sin(a)) * 100) / 100 }
}

/** An arc clockwise from one time to another. */
export function ringArc(from: number, to: number, r: number): string {
  const span = (((to - from) % DAY) + DAY) % DAY || DAY
  const a = ringPoint(from, r)
  const b = ringPoint(from + Math.min(span, DAY - 1), r)
  return `M${a.x} ${a.y}A${r} ${r} 0 ${span > DAY / 2 ? 1 : 0} 1 ${b.x} ${b.y}`
}

/** A time as people say it: "7am", "6:30pm", "Noon", "Midnight". */
export function spokenClock(minutes: number): string {
  const m = ((Math.round(minutes) % DAY) + DAY) % DAY
  if (m === 0) return 'Midnight'
  if (m === 720) return 'Noon'
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
}
