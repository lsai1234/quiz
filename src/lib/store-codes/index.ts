/**
 * Store codes — simple percentage-off codes the founders make for campaigns.
 *
 * A name and a percentage, and optionally a day it ends. `SUMMER15` takes 15%
 * off, for anyone, on anything — single shop products included, which partner
 * codes are not — until it is deleted or its end date passes. The shop
 * exception lives in `redeemPartnerCode`.
 *
 * One code at a time can be advertised on the results page, with the day it is
 * valid until (`liveCheckoutPromo`).
 *
 * ── Why these are partner codes underneath ─────────────────────────────────
 * A partner code already does everything a store code needs to, on every
 * checkout path that exists: the quiz stack, the curated bundles and the
 * subscription all re-validate it server-side through `redeemPartnerCode`, and
 * each of them treats it the same way — the code's rate REPLACES the bundle,
 * subscribe-&-save or intro rate rather than stacking on it (`replaceDiscount`,
 * `firstMonthRate`), and one order carries exactly one code. The margin floor
 * still applies per line underneath, so no code can sell below cost.
 *
 * A second, parallel code domain would have had to re-implement all of that on
 * every path, and the path it got wrong would be the one that stacked. So a
 * store code is a partner code owned by one fixed "house" account that earns no
 * commission and is hidden from every partner screen.
 *
 * Server-only.
 */
import { kvGet, kvSet } from '@/lib/db/kv'
import { ensureHousePartner } from './house-account'
import { DAILY_CODES, dailyCodeFor, dailyCodesEnabled, isDailyCode } from './daily'
import { isExpired, normaliseCode } from '@/lib/partners/codes'
import { HOUSE_PARTNER_ID } from '@/lib/partners/house'
import * as repo from '@/lib/partners/repo'
import type { CodeTerms, PartnerCode } from '@/lib/partners/types'

export { ensureHousePartner } from './house-account'
import { isIsoDate, londonDate, londonEndOfDay } from './deadline'

/** The deepest a store code may go — the same ceiling a partner code has. */
export const MAX_STORE_CODE_PCT = 50

export interface StoreCode {
  code: string
  /** Whole percent, e.g. 15. */
  percent: number
  /** How many orders have used it. */
  uses: number
  createdAt: string
  /** When it stops working at checkout, or null for "until deleted". A London midnight. */
  endsAt: string | null
  /** Past its end: still listed, so the founders can see it ran, but refused at checkout. */
  ended: boolean
  /** The code advertised on the results page. At most one. */
  atCheckout: boolean
}

function toStoreCode(code: PartnerCode, promoted: string | null, now = new Date()): StoreCode {
  return {
    code: code.code,
    percent: Math.round(code.discountPct * 100),
    uses: code.terms.uses,
    createdAt: code.createdAt,
    endsAt: code.terms.endsAt,
    ended: isExpired(code, now),
    atCheckout: promoted === code.code,
  }
}

/**
 * Anyone, any order, no end date — the "simple" in simple codes.
 *
 * Not first-order-only, unlike a partner's code: a store code is ours to run a
 * campaign with and ours to delete when the campaign ends.
 */
function storeCodeTerms(): CodeTerms {
  return { firstOrderOnly: false, maxUses: null, uses: 0, startsAt: null, endsAt: null, minSpend: null }
}

/**
 * Every store code, newest first — ended ones included, marked as such.
 *
 * Not the daily codes: there are up to forty-eight of them, made by the
 * schedule rather than by a founder, so they are summarised separately
 * (`dailyCodeStatus`) rather than burying the founders' own codes.
 */
export async function listStoreCodes(): Promise<StoreCode[]> {
  const codes = (await repo.listCodes(HOUSE_PARTNER_ID)).filter((c) => !isDailyCode(c.code))
  const promoted = await promotedCode()
  return codes.map((c) => toStoreCode(c, promoted))
}

export type StoreCodeResult = { ok: true; code: StoreCode } | { ok: false; reason: string }

/** Why a name or a percentage cannot be used, or null if it can. */
export function validateStoreCode(name: string, percent: number): string | null {
  const code = normaliseCode(name)
  if (code.length < 3) return 'Give the code a name of at least 3 letters or numbers.'
  if (code.length > 24) return 'Keep the code to 24 characters or fewer.'
  // `FH-` is the founder codes' prefix, and a store code shaped like one would
  // be read as a founder code and never reach the partner path at all.
  if (code.startsWith('FH-')) return 'Codes starting FH- are reserved for founder codes.'
  if (!Number.isInteger(percent) || percent < 1 || percent > MAX_STORE_CODE_PCT) {
    return `Pick a whole percentage between 1 and ${MAX_STORE_CODE_PCT}.`
  }
  return null
}

export async function createStoreCode(input: { name: string; percent: number }): Promise<StoreCodeResult> {
  const reason = validateStoreCode(input.name, input.percent)
  if (reason) return { ok: false, reason }

  const code = normaliseCode(input.name)
  // Against every code, partners' included — one string can only mean one thing
  // at checkout.
  if (await repo.getCode(code)) return { ok: false, reason: `${code} is already in use.` }

  await ensureHousePartner()
  const created = await repo.createCode({
    code,
    partnerId: HOUSE_PARTNER_ID,
    discountPct: input.percent / 100,
    terms: storeCodeTerms(),
  })
  return { ok: true, code: toStoreCode(created, await promotedCode()) }
}

/**
 * Delete a store code. It stops working at checkout immediately.
 *
 * Only ever a house code: this is not a way to delete a partner's code, whose
 * commission and history hang off it.
 */
export async function deleteStoreCode(input: string): Promise<boolean> {
  const code = await repo.getCode(normaliseCode(input))
  if (!code || code.partnerId !== HOUSE_PARTNER_ID) return false
  await repo.deleteCode(code.code)
  // Otherwise a new code made later under the same name would start being
  // advertised at checkout without anybody having asked for that.
  if ((await promotedCode()) === code.code) await setCheckoutPromo(null)
  return true
}

/** A store code by name, or null if the name is not one of ours. */
async function storeCode(input: string): Promise<PartnerCode | null> {
  const code = await repo.getCode(normaliseCode(input))
  return code && code.partnerId === HOUSE_PARTNER_ID ? code : null
}

/**
 * Set when a store code stops working: at the midnight closing London's day
 * `date` (`YYYY-MM-DD`), or never (`null`).
 *
 * ── Why a day and not a time ───────────────────────────────────────────────
 * Because "valid until Wed 28 Oct" is what the card at checkout says, and that
 * has to be kept by the thing that actually refuses the code — which is
 * `checkCode`, reading this same `endsAt`. Ending a code earlier than the
 * founders meant is the safe direction to be wrong in; this cannot do that,
 * since a day ends when it ends.
 */
export async function setStoreCodeEnd(input: string, date: string | null, now = new Date()): Promise<StoreCodeResult> {
  const code = await storeCode(input)
  if (!code) return { ok: false, reason: 'That is not one of the store codes.' }
  if (date !== null) {
    if (!isIsoDate(date)) return { ok: false, reason: 'Pick a day for the code to end.' }
    if (date < londonDate(now)) return { ok: false, reason: 'Pick today or a later day.' }
  }
  const terms: CodeTerms = { ...code.terms, endsAt: date === null ? null : londonEndOfDay(date).toISOString() }
  await repo.updateCode(code.code, { terms })
  return { ok: true, code: toStoreCode({ ...code, terms }, await promotedCode(), now) }
}

// ─── Advertised at checkout ────────────────────────────────────────────────

const PROMO_KEY = 'store-codes:checkout-promo'

async function promotedCode(): Promise<string | null> {
  const stored = await kvGet<{ code: string | null }>(PROMO_KEY)
  return stored?.code ?? null
}

/**
 * Choose the code the results page advertises, or `null` to advertise none.
 *
 * One at a time: the card is a single offer, and two would be two offers
 * arguing with each other above one basket.
 */
export async function setCheckoutPromo(input: string | null, now = new Date()): Promise<StoreCodeResult | { ok: true; code: null }> {
  if (input === null) {
    await kvSet(PROMO_KEY, { code: null })
    return { ok: true, code: null }
  }
  const code = await storeCode(input)
  if (!code) return { ok: false, reason: 'That is not one of the store codes.' }
  if (isExpired(code, now)) return { ok: false, reason: `${code.code} has ended. Give it a new end date first.` }
  await kvSet(PROMO_KEY, { code: code.code })
  return { ok: true, code: toStoreCode(code, code.code, now) }
}

export interface CheckoutPromo {
  code: string
  /** Whole percent, e.g. 25. */
  percent: number
  /** When checkout stops accepting it, or null for no end. The card gives the day, never a countdown. */
  endsAt: string | null
  /** `daily`: today's code, a new one tomorrow. `store`: a code chosen in the hub. */
  kind: 'daily' | 'store'
}

/**
 * The offer to advertise at checkout right now, or null.
 *
 * Null unless the chosen code would actually be accepted this minute — not yet
 * started, ended, used up or deleted all hide the card. That is what keeps the
 * card true: the day it says the code is valid until is read from the same
 * `endsAt` that `checkCode` refuses the code after. It never counts down to it:
 * a founder can move the end, so it is not a final deadline.
 */
export async function liveCheckoutPromo(now = new Date()): Promise<CheckoutPromo | null> {
  // Today's code first, only while the schedule runs and a founder has
  // switched the daily codes on (off by default).
  const daily = await liveDailyCode(now)
  if (daily) return daily

  const name = await promotedCode()
  if (!name) return null
  const code = await storeCode(name)
  if (!code || code.status !== 'active' || isExpired(code, now)) return null
  if (code.terms.startsAt && now < new Date(code.terms.startsAt)) return null
  return { code: code.code, percent: Math.round(code.discountPct * 100), endsAt: code.terms.endsAt, kind: 'store' }
}

/**
 * Today's code, if the schedule covers today, the switch is on, and the code
 * already exists and really works. Nothing makes a missing one any more.
 */
async function liveDailyCode(now: Date): Promise<CheckoutPromo | null> {
  const today = dailyCodeFor(now)
  if (!today || !(await dailyCodesEnabled())) return null
  const code = await storeCode(today.code)
  // A code that was never made, a partner holding the word, or a founder having
  // paused or deleted the code means no card today rather than a card for a
  // code checkout would refuse.
  if (!code || code.status !== 'active' || isExpired(code, now)) return null
  if (code.terms.startsAt && now < new Date(code.terms.startsAt)) return null
  return { code: code.code, percent: Math.round(code.discountPct * 100), endsAt: code.terms.endsAt, kind: 'daily' }
}

export interface DailyCodeStatus {
  enabled: boolean
  /** Today's code, or null outside the schedule. */
  today: { code: string; endsAt: string } | null
  /** The next few, so a founder can plan posts. */
  upcoming: Array<{ date: string; code: string }>
  /** The last day the schedule covers. */
  lastDay: string
}

/** What the Founders Hub shows about the daily codes. */
export async function dailyCodeStatus(now = new Date()): Promise<DailyCodeStatus> {
  const today = dailyCodeFor(now)
  const from = londonDate(now)
  return {
    enabled: await dailyCodesEnabled(),
    today: today ? { code: today.code, endsAt: today.endsAt } : null,
    upcoming: DAILY_CODES.filter((d) => d.date > from).slice(0, 7).map((d) => ({ date: d.date, code: d.code })),
    lastDay: DAILY_CODES[DAILY_CODES.length - 1].date,
  }
}
