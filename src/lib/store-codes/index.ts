/**
 * Store codes — simple percentage-off codes the founders make for campaigns.
 *
 * A name and a percentage, nothing else. `SUMMER15` takes 15% off, for anyone,
 * on anything — single shop products included, which partner codes are not —
 * until it is deleted. The shop exception lives in `redeemPartnerCode`.
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
import { normaliseCode } from '@/lib/partners/codes'
import { HOUSE_PARTNER_EMAIL, HOUSE_PARTNER_ID } from '@/lib/partners/house'
import * as repo from '@/lib/partners/repo'
import type { CodeTerms, PartnerCode } from '@/lib/partners/types'

/** The deepest a store code may go — the same ceiling a partner code has. */
export const MAX_STORE_CODE_PCT = 50

export interface StoreCode {
  code: string
  /** Whole percent, e.g. 15. */
  percent: number
  /** How many orders have used it. */
  uses: number
  createdAt: string
}

function toStoreCode(code: PartnerCode): StoreCode {
  return {
    code: code.code,
    percent: Math.round(code.discountPct * 100),
    uses: code.terms.uses,
    createdAt: code.createdAt,
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
 * Make sure the house account exists. Idempotent, and safe to race: two first
 * calls both try the insert, one hits the unique key, and both then read back
 * the same row.
 */
export async function ensureHousePartner(): Promise<void> {
  if (await repo.getPartner(HOUSE_PARTNER_ID)) return
  try {
    await repo.createPartner({
      id: HOUSE_PARTNER_ID,
      email: HOUSE_PARTNER_EMAIL,
      name: 'Store',
      kind: 'affiliate',
      // Active so its codes pass `checkCode`. It has no password, so nobody can
      // sign in as it.
      status: 'active',
      data: { notes: 'Owns the store discount codes. Earns no commission.' },
    })
    await repo.addTerms({
      partnerId: HOUSE_PARTNER_ID,
      firstOrderPct: 0,
      renewalPct: 0,
      renewalMonths: 0,
      payout: { cadence: 'monthly', minimum: 0, selfBilled: false, chargesVat: false },
      effectiveFrom: new Date(0).toISOString(),
      note: 'Store codes — no commission.',
      createdBy: null,
    })
  } catch (err) {
    if (!(await repo.getPartner(HOUSE_PARTNER_ID))) throw err
  }
}

/** Every live store code, newest first. */
export async function listStoreCodes(): Promise<StoreCode[]> {
  const codes = await repo.listCodes(HOUSE_PARTNER_ID)
  return codes.map(toStoreCode)
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
  return { ok: true, code: toStoreCode(created) }
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
  return true
}
