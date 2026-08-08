/**
 * Everything a partner can see about themselves, assembled in one place.
 *
 * Built from the partner id held in their session and nothing the browser sends,
 * so there is no shape of request that reads somebody else's numbers. The whole
 * point of `/partner` is that they can answer "what am I on, what am I owed, and
 * when do I get it" without emailing anyone — so this returns the answers, not
 * the raw material for them.
 *
 * Server-only.
 */
import { balanceFor } from './ledger'
import { performanceForCodes, type PartnerPerformance } from './performance'
import { describePayout, describeTerms, sortedHistory, termsInForce } from './terms'
import * as repo from './repo'
import type { PartnerBalance, PartnerCode, PartnerCommission, PartnerPayout, PartnerTerms } from './types'

/** One earned commission, in the words a partner reads it in. */
export interface PartnerEarning {
  id: string
  /** When the order was placed. */
  at: string
  kind: 'first' | 'renewal'
  rate: number
  netBasis: number
  amount: number
  state: PartnerCommission['state']
  /**
   * The date THIS row becomes payable — not a generic policy line. "Why isn't
   * this payable yet" should answer itself on the row that raises the question.
   */
  payableFrom: string
}

export interface PartnerDashboard {
  partner: { name: string; email: string; status: string }
  codes: PartnerCode[]
  /** Orders and revenue per code, plus a total. */
  performance: PartnerPerformance[]
  totals: { orders: number; revenue: number; subscriptions: number; reversed: number }
  /** This calendar month, so "how am I doing" has a recent answer too. */
  thisMonth: { orders: number; earned: number }
  balance: PartnerBalance
  earnings: PartnerEarning[]
  payouts: PartnerPayout[]
  terms: PartnerTerms
  termsHistory: PartnerTerms[]
  /** The deal in whole sentences, so the screen never has to assemble it. */
  wording: { earn: string; paid: string }
}

export async function dashboardFor(partnerId: string): Promise<PartnerDashboard | null> {
  const partner = await repo.getPartner(partnerId)
  if (!partner) return null

  const [codes, history, commissions, payouts, balance] = await Promise.all([
    repo.listCodes(partnerId),
    repo.listTerms(partnerId),
    repo.listCommissions(partnerId),
    repo.listPayouts(partnerId),
    balanceFor(partnerId),
  ])

  const performance = await performanceForCodes(codes.map((c) => c.code))
  const totals = performance.reduce(
    (t, p) => ({
      orders: t.orders + p.orders,
      revenue: Math.round((t.revenue + p.revenue) * 100) / 100,
      subscriptions: t.subscriptions + p.subscriptions,
      reversed: t.reversed + p.reversed,
    }),
    { orders: 0, revenue: 0, subscriptions: 0, reversed: 0 },
  )

  // Every partner is created with an opening terms row, so the fallback to the
  // earliest is only reachable if one is future-dated — better than showing a
  // partner no answer at all to "what am I on".
  const terms = termsInForce(history, new Date()) ?? sortedHistory(history).at(-1)
  if (!terms) return null

  const month = new Date().toISOString().slice(0, 7)
  const thisMonth = commissions.reduce(
    (acc, c) => {
      if (!c.createdAt.startsWith(month) || c.state === 'reversed') return acc
      return { orders: acc.orders + 1, earned: Math.round((acc.earned + c.amount) * 100) / 100 }
    },
    { orders: 0, earned: 0 },
  )

  return {
    partner: { name: partner.name, email: partner.email, status: partner.status },
    codes,
    performance,
    totals,
    thisMonth,
    balance,
    earnings: commissions.map(toEarning),
    payouts,
    terms,
    termsHistory: sortedHistory(history),
    wording: { earn: describeTerms(terms), paid: describePayout(terms.payout) },
  }
}

function toEarning(c: PartnerCommission): PartnerEarning {
  return {
    id: c.id,
    at: c.createdAt,
    kind: c.kind,
    rate: c.rate,
    netBasis: c.netBasis,
    amount: c.amount,
    state: c.state,
    payableFrom: c.confirmAfter,
  }
}
