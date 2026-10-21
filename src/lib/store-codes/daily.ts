/**
 * Today's code — a different 25%-off code every day, 14 October to 30 November.
 *
 * ── Retired ─────────────────────────────────────────────────────────────────
 * Off unless a founder switches it on in the hub, and no new codes are made.
 * Rows already in the database are left alone: they are ordinary store codes,
 * so a typed one is still accepted at checkout on its own day whether the
 * switch is on or off. The schedule stays so the hub can keep those rows off
 * its ordinary list (`isDailyCode`).
 *
 * ── Why a new code each day rather than one code on a countdown ─────────────
 * The checkout card counts down to midnight. A countdown is only honest if
 * something really ends when it reaches zero, so each day's code is valid from
 * the London midnight that starts its day to the one that ends it, and the
 * checkout refuses it either side (`checkCode` reads the same `startsAt` and
 * `endsAt`). What the card says ends is the CODE — "this code expires at
 * midnight" — never the 25% off, because tomorrow there is another one, and
 * saying the discount ends tonight would be the false deadline this replaces.
 *
 * ── How they were made ──────────────────────────────────────────────────────
 * They are ordinary store codes, so every checkout path already knows how to
 * redeem them. `ensureDailyCodes` used to create every missing one from today
 * to the end of the schedule the first time a code was looked up each day, so
 * future days' rows were made well before their day and refused until it
 * started. It now makes nothing.
 *
 * Server-only.
 */
import { kvGet, kvSet } from '@/lib/db/kv'
import { addDays, londonDate, londonEndOfDay } from './deadline'

/** Every daily code is this much off, replacing (never stacking on) the bundle deal. */
export const DAILY_CODE_PCT = 25

/**
 * The words, one per day from 14 October. Each code is the word then "25".
 *
 * Fixed rather than generated, so a code is something a founder can read out,
 * post, or look up — and so nobody can work tomorrow's out from today's. A
 * word that collided with a partner's code was not made for its day.
 */
const FIRST_DAY = '2026-10-14'
const WORDS = [
  // October
  'SPARK', 'SURGE', 'VOLT', 'BOLT', 'PULSE', 'FLASH', 'IGNITE', 'BOOST', 'RALLY',
  'STRIDE', 'SPRINT', 'POWER', 'CHARGE', 'FUEL', 'BLAZE', 'RISE', 'THRIVE', 'GRIT',
  // November
  'FORGE', 'TITAN', 'SUMMIT', 'PEAK', 'FIREWORK', 'STEEL', 'MOMENTUM', 'KINETIC',
  'FLEX', 'HUSTLE', 'RECOVER', 'ENDURE', 'AMPED', 'VIGOUR', 'STRONG', 'RESET',
  'LIFT', 'PACE', 'TEMPO', 'FOCUS', 'ENERGY', 'DRIVE', 'TURBO', 'ROCKET', 'APEX',
  'NOVA', 'BLACKFRIDAY', 'STORM', 'ZENITH', 'FINALE',
] as const

export interface DailyCode {
  /** The London day it is valid on, `YYYY-MM-DD`. */
  date: string
  code: string
  /** The London midnight its day starts at. */
  startsAt: string
  /** The London midnight its day ends at — the countdown's zero. */
  endsAt: string
}

/** The whole schedule, in date order. */
export const DAILY_CODES: DailyCode[] = WORDS.map((word, i) => {
  const date = addDays(FIRST_DAY, i)
  return {
    date,
    code: `${word}${DAILY_CODE_PCT}`,
    startsAt: londonEndOfDay(addDays(date, -1)).toISOString(),
    endsAt: londonEndOfDay(date).toISOString(),
  }
})

const BY_CODE = new Map(DAILY_CODES.map((d) => [d.code, d]))

/** The code for the London day `now` falls on, or null outside the schedule. */
export function dailyCodeFor(now: Date = new Date()): DailyCode | null {
  const today = londonDate(now)
  return DAILY_CODES.find((d) => d.date === today) ?? null
}

/** Whether a code is one of the daily ones — kept off the hub's ordinary list. */
export function isDailyCode(code: string): boolean {
  return BY_CODE.has(code.trim().toUpperCase())
}

// ─── The switch ──────────────────────────────────────────────────────────────

const ENABLED_KEY = 'store-codes:daily'

/**
 * Off unless a founder has switched it on. Off hides the card only: a code
 * already in the database still works at checkout on its own day.
 */
export async function dailyCodesEnabled(): Promise<boolean> {
  const stored = await kvGet<{ enabled: boolean }>(ENABLED_KEY)
  return stored?.enabled === true
}

export async function setDailyCodesEnabled(enabled: boolean): Promise<void> {
  await kvSet(ENABLED_KEY, { enabled })
}

// ─── Making them ─────────────────────────────────────────────────────────────

/**
 * Makes nothing. Kept, with its signature, for the callers that still ask
 * before a lookup (`redeemPartnerCode`). Codes it made before are not touched.
 */
export async function ensureDailyCodes(_now?: Date): Promise<void> {}
