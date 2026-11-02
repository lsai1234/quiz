/**
 * Sharing a card from the read's story (Amp Consult and offer plan, Phase 8):
 * what each card may carry onto a 1080×1920 image.
 *
 * A shared image and its link carry no health information, so each card
 * carries less than it shows on screen, and only as data, never as words:
 *
 *   day      the ring's shape: the sleep arc, the last cup or the cup count, the
 *            training time or days, how bright the daylight glow is, the energy
 *            curve. No times or words are printed.
 *   spotted  a pattern id. Its name and line are looked up from the library
 *            on the server, and only for patterns that may be shared
 *            (`SHAREABLE_PATTERNS`). Never their answers.
 *   dots     the constellation: each pattern's place and weight, the names of
 *            the shareable ones they confirmed, the "narrowing" counts.
 *   start    product names: the hero and the classics. No claims, prices or gift.
 *
 * "Try this week" isn't shareable: a fix with their own bedtime in it, under
 * our name, would read as health advice. The stack card (the story's last
 * card) is the existing share sheet, unchanged, with its giveaway.
 *
 * The payload is user input, as every share payload is (`/api/share`):
 * `decodeStoryShare` refuses anything off this shape, any pattern that isn't
 * shareable and any text that isn't a plain product name, so a crafted link
 * can't put health wording on our card.
 */

import { PATTERN_BY_ID } from '@/lib/consult/pinpoint/library'
import type { PatternId } from '@/lib/consult/pinpoint/types'
import type { ConsultAnswers } from '@/lib/consult/types'
import type { StoryCard } from '@/components/consult/story/ReadStory'
import { dayRingData } from '@/lib/consult/day-ring'
import { constellation, narrowing } from '@/lib/consult/constellation'
import { isShareablePattern } from '@/lib/consult/shareable'

export { SHAREABLE_PATTERNS, isShareablePattern } from '@/lib/consult/shareable'

export type ShareableCard = 'day' | 'spotted' | 'dots' | 'start'
export const SHAREABLE_CARDS: readonly ShareableCard[] = ['day', 'spotted', 'dots', 'start']

export interface DayShare {
  v: 1
  card: 'day'
  /** Minutes past midnight. */
  sleep: [number, number] | null
  /** The last cup's time, or the count when there's no time. */
  cup: { at: number } | { count: number } | null
  train: { at: number } | { days: number } | null
  /** The glow, 0–1. */
  daylight: number | null
  /** The drawn day, ten levels 0–10; or the afternoon level, 1–10. */
  energy: { points: number[] } | { level: number } | null
}

export interface SpottedShare {
  v: 1
  card: 'spotted'
  pattern: PatternId
}

export interface DotsShare {
  v: 1
  card: 'dots'
  /** Each eligible pattern: its angle (radians), distance (0–1) and weight (0–1), and whether it's confirmed or ruled out. */
  stars: { a: number; d: number; w: number; s: 'in' | 'yes' | 'out' }[]
  /** Names to print: shareable patterns they confirmed, by id. */
  named: PatternId[]
  narrowing: number[]
}

export interface StartShare {
  v: 1
  card: 'start'
  hero: string | null
  products: string[]
}

export type StoryShare = DayShare | SpottedShare | DotsShare | StartShare

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp

/** The first shareable pattern they confirmed, if any: what "spotted" shares. */
export function sharedPattern(patterns: readonly { id: PatternId }[]): PatternId | null {
  return patterns.find((p) => isShareablePattern(p.id))?.id ?? null
}

/** Which of the story's cards can be shared, for this person. */
export function canShare(card: StoryCard, patterns: readonly { id: PatternId }[]): card is ShareableCard {
  if (card === 'spotted' || card === 'dots') return sharedPattern(patterns) !== null
  return card === 'day' || card === 'start'
}

export function dayShare(a: ConsultAnswers): DayShare {
  const d = dayRingData(a)
  return {
    v: 1,
    card: 'day',
    sleep: d.sleep ? [d.sleep.bed, d.sleep.wake] : null,
    cup: d.caffeine ? ('at' in d.caffeine ? { at: d.caffeine.at } : { count: Math.min(9, d.caffeine.count) }) : null,
    train: d.training ? ('at' in d.training ? { at: d.training.at } : { days: d.training.days }) : null,
    daylight: d.daylight ? round(d.daylight.level) : null,
    energy: d.energy ? ('points' in d.energy ? { points: [...d.energy.points] } : { level: d.energy.level }) : null,
  }
}

export function dotsShare(a: ConsultAnswers, patterns: readonly { id: PatternId }[]): DotsShare {
  const stars = constellation(a).map((n) => ({
    a: round(n.angle, 3),
    d: round(n.distance),
    w: round(n.weight),
    s: (n.state === 'yes' || n.state === 'partly' ? 'yes' : n.state === 'no' || n.state === 'out' ? 'out' : 'in') as DotsShare['stars'][number]['s'],
  }))
  return { v: 1, card: 'dots', stars, named: patterns.map((p) => p.id).filter(isShareablePattern), narrowing: narrowing(a) }
}

/** A product name as it may go on a card: the catalogue's own, anything else in it dropped. */
export function cardName(title: string): string {
  return title.replace(/[^\p{L}\p{N} &+'’.,()/-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 48)
}

/** "Start here" as names: the hero and the classics, nothing else (no claims, prices or gift). */
export function startShare(start: { hero: { product: { title: string; shortName?: string | null } } | null; classics: { product: { title: string; shortName?: string | null } }[] }): StartShare {
  const name = (p: { title: string; shortName?: string | null }) => cardName(p.shortName || p.title)
  return { v: 1, card: 'start', hero: start.hero ? name(start.hero.product) || null : null, products: start.classics.map((c) => name(c.product)).filter(Boolean).slice(0, 8) }
}

/* ── The codec ─────────────────────────────────────────────────────────── */

const DAY = 24 * 60
const isMinute = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < DAY + 1
const isUnit = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1
const isLevel = (n: unknown, lo = 0) => Number.isInteger(n) && (n as number) >= lo && (n as number) <= 10
/** A product name as the catalogue writes one: letters, numbers, a little punctuation. */
const NAME = /^[\p{L}\p{N} &+'’.,()/-]{1,48}$/u

export function encodeStoryShare(s: StoryShare): string {
  const json = JSON.stringify(s)
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The payload back, checked field by field; null for anything off its shape. */
export function decodeStoryShare(encoded: string): StoryShare | null {
  if (!encoded || encoded.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null
  let raw: unknown
  try {
    const bin = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
    raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
  } catch {
    return null
  }
  const o = raw as Record<string, unknown>
  if (!o || typeof o !== 'object' || o.v !== 1) return null
  switch (o.card) {
    case 'day':
      return checkDay(o)
    case 'spotted':
      return typeof o.pattern === 'string' && isShareablePattern(o.pattern) && PATTERN_BY_ID[o.pattern] ? { v: 1, card: 'spotted', pattern: o.pattern } : null
    case 'dots':
      return checkDots(o)
    case 'start': {
      const products = o.products
      const hero = o.hero
      if (!Array.isArray(products) || products.length > 8 || !products.every((p) => typeof p === 'string' && NAME.test(p))) return null
      if (hero !== null && !(typeof hero === 'string' && NAME.test(hero))) return null
      return { v: 1, card: 'start', hero, products: products as string[] }
    }
    default:
      return null
  }
}

function checkDay(o: Record<string, unknown>): DayShare | null {
  const sleep = o.sleep
  if (sleep !== null && !(Array.isArray(sleep) && sleep.length === 2 && sleep.every(isMinute))) return null
  const cup = o.cup as Record<string, unknown> | null
  if (cup !== null && !(cup && typeof cup === 'object' && ((Object.keys(cup).join() === 'at' && isMinute(cup.at)) || (Object.keys(cup).join() === 'count' && isLevel(cup.count))))) return null
  const train = o.train as Record<string, unknown> | null
  if (train !== null && !(train && typeof train === 'object' && ((Object.keys(train).join() === 'at' && isMinute(train.at)) || (Object.keys(train).join() === 'days' && Number.isInteger(train.days) && (train.days as number) >= 0 && (train.days as number) <= 7)))) return null
  if (o.daylight !== null && !isUnit(o.daylight)) return null
  const energy = o.energy as Record<string, unknown> | null
  const okEnergy =
    energy === null ||
    (energy && typeof energy === 'object' && ((Object.keys(energy).join() === 'points' && Array.isArray(energy.points) && energy.points.length === 10 && energy.points.every((p) => isLevel(p))) || (Object.keys(energy).join() === 'level' && isLevel(energy.level, 1))))
  if (!okEnergy) return null
  return { v: 1, card: 'day', sleep: sleep as DayShare['sleep'], cup: cup as DayShare['cup'], train: train as DayShare['train'], daylight: o.daylight as number | null, energy: energy as DayShare['energy'] }
}

function checkDots(o: Record<string, unknown>): DotsShare | null {
  const stars = o.stars
  if (!Array.isArray(stars) || stars.length < 1 || stars.length > 20) return null
  for (const s of stars) {
    if (!s || typeof s !== 'object') return null
    const t = s as Record<string, unknown>
    if (typeof t.a !== 'number' || !Number.isFinite(t.a) || Math.abs(t.a) > 7 || !isUnit(t.d) || !isUnit(t.w) || !['in', 'yes', 'out'].includes(t.s as string)) return null
  }
  const named = o.named
  if (!Array.isArray(named) || named.length > 3 || !named.every((n) => typeof n === 'string' && isShareablePattern(n))) return null
  const counts = o.narrowing
  if (!Array.isArray(counts) || counts.length < 1 || counts.length > 4 || !counts.every((n) => Number.isInteger(n) && n >= 0 && n <= 20)) return null
  return { v: 1, card: 'dots', stars: stars as DotsShare['stars'], named: named as PatternId[], narrowing: counts as number[] }
}

/** The words that go with the image in the share sheet: our name and where to start, nothing about them. */
export const STORY_SHARE_TEXT = 'My read from the Amp Consult at CHRGD'

/** A pattern's name and line for the card, only when it may be shared. */
export function patternWords(id: PatternId): { name: string; line: string } | null {
  if (!isShareablePattern(id)) return null
  const p = PATTERN_BY_ID[id]
  return p ? { name: p.name, line: p.line } : null
}
