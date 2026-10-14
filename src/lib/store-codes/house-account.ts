/**
 * The account that owns the store codes. Server-only.
 *
 * Its own file so the daily codes (`./daily`) and the store codes (`./index`)
 * can both make sure it exists without importing each other.
 */
import { HOUSE_PARTNER_EMAIL, HOUSE_PARTNER_ID } from '@/lib/partners/house'
import * as repo from '@/lib/partners/repo'

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
