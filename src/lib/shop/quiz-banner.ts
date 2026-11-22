import { GOALS_DATA } from '@/lib/quiz-goals'
import type { Goal } from '@/lib/types'
import type { IconName } from '@/components/ui/Icon'

/**
 * The shop's quiz banner: what it shows and the arithmetic of laying it out.
 * Pure and DOM-free, so the parts that are easy to get subtly wrong (labels
 * that overlap, a dot that never switches off) are tested
 * (`__tests__/quiz-banner.test.ts`). The drawing is `ShopQuizStrip`.
 *
 * The examples are made up and the banner labels them as examples wherever
 * they appear. They describe a person's week, never their health, and name
 * products without saying what they do.
 */

export interface BannerExample {
  who: string
  /** Three answers, as the quiz would record them. */
  said: [string, string, string]
  /** How the title ends while this example plays: "A stack built around …". */
  phrase: string
  /** The stack: hour of the day (0–24), product, capsule render. */
  day: Array<[hour: number, name: string, capsule: string]>
}

export const BANNER_EXAMPLES: BannerExample[] = [
  {
    who: 'Sam',
    said: ['Lifts 4× a week', 'Vegan', 'Trains at 6pm'],
    phrase: 'your 6pm sessions.',
    day: [[7.5, 'Creatine', '/hero/capsule-1.webp'], [17, 'Electrolytes', '/hero/capsule-5.webp'], [19, 'Plant protein', '/hero/capsule-2.webp']],
  },
  {
    who: 'Priya',
    said: ['Runs 3× a week', 'No caffeine', 'Early starts'],
    phrase: 'your early runs.',
    day: [[6, 'Stim-free pre', '/hero/capsule-4.webp'], [7.5, 'Electrolytes', '/hero/capsule-5.webp'], [13, 'Multivitamin', '/hero/capsule-1.webp']],
  },
  {
    who: 'Jo',
    said: ['Desk job', 'Just the basics', 'Capsules'],
    phrase: 'your desk job.',
    day: [[8, 'Vitamin D3 + K2', '/hero/capsule-2.webp'], [13, 'Omega-3', '/hero/capsule-3.webp'], [21.5, 'Magnesium', '/hero/capsule-4.webp']],
  },
]

/** Where the title settles: the reader's own turn. */
export const BANNER_FINAL_PHRASE = 'you.'

/** The goals the banner's first question offers, labelled as the quiz labels them. */
const BANNER_GOAL_IDS: Array<[Goal, IconName]> = [['muscle', 'dumbbell'], ['cutting', 'flame'], ['energy', 'bolt'], ['hydration', 'droplet']]
export const BANNER_GOALS = BANNER_GOAL_IDS.map(([id, icon]) => ({
  id,
  icon,
  label: GOALS_DATA.find((g) => g.id === id)?.label ?? id,
}))

/** The day the line covers, 5am to 11pm. */
export const DAY_START = 5
export const DAY_END = 23

export const hhmm = (hour: number) => `${String(Math.floor(hour)).padStart(2, '0')}:${hour % 1 ? '30' : '00'}`

/** Where on a line `width` wide an hour falls. */
export function dayX(hour: number, width: number): number {
  return ((hour - DAY_START) / (DAY_END - DAY_START)) * width
}

export type LabelAlign = 'l' | 'c' | 'r'
export interface PlacedLabel {
  align: LabelAlign
  /** 0 is the row nearest the line. */
  row: number
  /** Left edge, for checking. */
  start: number
}

/** Rows above the line. Three products, three rows: there is always one free. */
export const LABEL_ROWS = 3

/**
 * Place one-line labels above points on the line so no two touch.
 *
 * Each label is centred over its point unless that would push it past an end
 * of the line, in which case it hangs from the point towards the middle
 * (`inset` past the point, so it still reads as belonging to it). Then each
 * takes the lowest row on which it clears every label already there by `gap`.
 * With three labels and three rows the last fallback never triggers, but it is
 * there so a fourth product would overlap visibly rather than vanish.
 */
export function placeLabels(items: Array<{ x: number; w: number }>, width: number, gap = 10, inset = 8): PlacedLabel[] {
  const ends = Array.from({ length: LABEL_ROWS }, () => -Infinity)
  return items.map(({ x, w }) => {
    let align: LabelAlign
    let start: number
    if (x - w / 2 < 0) { align = 'l'; start = x - inset }
    else if (x + w / 2 > width) { align = 'r'; start = x + inset - w }
    else { align = 'c'; start = x - w / 2 }
    let row = ends.findIndex((end) => start >= end + gap)
    if (row < 0) row = LABEL_ROWS - 1
    ends[row] = start + w
    return { align, row, start }
  })
}

/**
 * Which dots survive for each example, as (column, row) fractions of the
 * field, so the same few light up whatever size the field is drawn at.
 */
const PICKS: Array<Array<[number, number]>> = [
  [[0.18, 0.25], [0.55, 0.75], [0.86, 0.5]],
  [[0.1, 0.75], [0.42, 0.25], [0.78, 1]],
  [[0.3, 0.5], [0.62, 0], [0.95, 0.75]],
]

export function pickDots(example: number, cols: number, rows: number): number[] {
  const picks = PICKS[example % PICKS.length].map(([fc, fr]) => Math.round(fr * (rows - 1)) * cols + Math.round(fc * (cols - 1)))
  return [...new Set(picks)]
}

/**
 * The order the other dots switch off in: three waves, one per answer, the
 * last taking every dot that is left. Seeded, so an example always plays the
 * same way.
 */
export function dotWaves(example: number, count: number, picks: number[]): [number[], number[], number[]] {
  let seed = 97 * (example + 1) + 13
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const rest: number[] = []
  for (let i = 0; i < count; i++) if (!picks.includes(i)) rest.push(i)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  const a = Math.floor(rest.length * 0.55)
  const b = Math.floor(rest.length * 0.86)
  return [rest.slice(0, a), rest.slice(a, b), rest.slice(b)]
}
