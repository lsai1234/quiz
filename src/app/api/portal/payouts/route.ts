import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { syncPortalRuntime } from '@/lib/portal/store'
import { balanceFor, invoiceFor } from '@/lib/partners/ledger'
import { listPartners, listPayoutsForPeriod, listTerms } from '@/lib/partners/repo'
import { termsInForce } from '@/lib/partners/terms'

export const dynamic = 'force-dynamic'

/**
 * GET /api/portal/payouts?period=YYYY-MM
 *
 * The two halves of "what do we owe, and to whom": everyone with a balance
 * waiting for a run, and every payout already raised in the period.
 *
 * Each partner's own minimum is reported alongside their balance rather than a
 * programme-wide figure, because the minimum is part of a deal that can be
 * negotiated — showing the default would tell a founder someone is under the
 * bar when they are over their own.
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()

  const period = new URL(req.url).searchParams.get('period') ?? previousMonth()

  const partners = await listPartners()
  const due = await Promise.all(
    partners.map(async (partner) => {
      const [balance, history] = await Promise.all([balanceFor(partner.id), listTerms(partner.id)])
      const terms = termsInForce(history, new Date())
      const minimum = terms?.payout.minimum ?? 0
      return {
        partnerId: partner.id,
        name: partner.name,
        email: partner.email,
        status: partner.status,
        balance,
        minimum,
        /** Over their own bar, so a run would actually pay them. */
        wouldPay: balance.payableNow >= minimum && balance.payableNow > 0,
      }
    }),
  )

  const payouts = await listPayoutsForPeriod(period)
  const invoices = await Promise.all(payouts.map((p) => invoiceFor(p.id)))
  const byId = new Map(partners.map((p) => [p.id, p.name]))

  return NextResponse.json({
    period,
    due: due.filter((d) => d.balance.payableNow > 0 || d.balance.invoiced > 0),
    payouts: payouts.map((p, i) => ({
      ...p,
      partnerName: byId.get(p.partnerId) ?? 'Unknown',
      invoice: invoices[i],
    })),
    totals: {
      readyToPay: round(due.filter((d) => d.wouldPay).reduce((s, d) => s + d.balance.payableNow, 0)),
      heldUnderMinimum: round(due.filter((d) => !d.wouldPay).reduce((s, d) => s + d.balance.payableNow, 0)),
      raisedThisPeriod: round(payouts.reduce((s, p) => s + p.amount, 0)),
      unpaid: round(payouts.filter((p) => p.state === 'due').reduce((s, p) => s + p.amount, 0)),
    },
  })
}

/** Runs are in arrears — the month just gone. */
function previousMonth(): string {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 7)
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
