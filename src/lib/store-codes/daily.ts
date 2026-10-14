/**
 * Today's code — a different 25%-off code every day, 14 October to 30 November.
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
 * ── Why they are made lazily ────────────────────────────────────────────────
 * They are ordinary store codes, so every checkout path already knows how to
 * redeem them. They have to exist in the database to be redeemed, so
 * `ensureDailyCodes` creates any that are missing the first time a code is
 * looked up each day — from the code box, the cart or the checkout alike.
 * Past days are never created; a code is made before its day, and refused
 * until its day starts.
 *
 * Server-only.
 */
import { kvGet, kvSet } from '@/lib/db/kv'
import { HOUSE_PARTNER_ID } from '@/lib/partners/house'
import * as repo from '@/lib/partners/repo'
import { addDays, londonDate, londonEndOfDay } from './deadline'
import { ensureHousePartner } from './house-account'

/** Every daily code is this much off, replacing (never stacking on) the bundle deal. */
export const DAILY_CODE_PCT = 25

/**
 * The words, one per day from 14 October. Each code is the word then "25".
 *
 * Fixed rather than generated, so a code is something a founder can read out,
 * post, or look up — and so nobody can work tomorrow's out from today's. Any
 * word that collides with a partner's code is skipped for its day.
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

/** On unless a founder has switched it off. Off hides the card; codes already made still work until their day ends. */
export async function dailyCodesEnabled(): Promise<boolean> {
  const stored = await kvGet<{ enabled: boolean }>(ENABLED_KEY)
  return stored?.enabled !== false
}

export async function setDailyCodesEnabled(enabled: boolean): Promise<void> {
  await kvSet(ENABLED_KEY, { enabled })
}

// ─── Making them ─────────────────────────────────────────────────────────────

/** The London day this process last checked, so the check costs one query a day. */
let checkedOn: string | null = null

/**
 * Create every daily code from today to the end of the schedule that does not
 * exist yet. Idempotent and safe to race: a code another request created first
 * is simply left alone.
 *
 * Never throws — a code that could not be made is a code the customer is told
 * we don't recognise, which is not worth failing a checkout over.
 */
export async function ensureDailyCodes(now: Date = new Date()): Promise<void> {
  const today = londonDate(now)
  if (checkedOn === today) return
  const due = DAILY_CODES.filter((d) => d.date >= today)
  if (due.length === 0) {
    checkedOn = today
    return
  }
  try {
    await ensureHousePartner()
    for (const d of due) {
      if (await repo.getCode(d.code)) continue
      try {
        await repo.createCode({
          code: d.code,
          partnerId: HOUSE_PARTNER_ID,
          discountPct: DAILY_CODE_PCT / 100,
          terms: {
            firstOrderOnly: false,
            maxUses: null,
            uses: 0,
            startsAt: d.startsAt,
            endsAt: d.endsAt,
            minSpend: null,
          },
        })
      } catch {
        /* Another request made it first, or a partner holds the name. */
      }
    }
    checkedOn = today
  } catch {
    /* Database unavailable — try again on the next lookup. */
  }
}

/** For tests: forget that today has been checked, after the database is reset. */
export function resetDailyCodeCheck(): void {
  checkedOn = null
}
