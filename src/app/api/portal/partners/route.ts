import { NextResponse } from 'next/server'
import { isPortalAuthed, getFounder } from '@/lib/portal/guard'
import { syncPortalRuntime } from '@/lib/portal/store'
import {
  changeTerms,
  createPartner,
  getPartnerRecord,
  listPartnerRecords,
  setPartnerStatus,
  updateCodeTerms,
  type CodeTerms,
  type PartnerStatus,
  type PayoutTerms,
} from '@/lib/partners'
import { performanceForCodes } from '@/lib/partners/performance'
import { balanceFor, settle } from '@/lib/partners/ledger'
import { markPayoutPaid, oldestUnsettledCommission } from '@/lib/partners/repo'

export const dynamic = 'force-dynamic'

/**
 * Partner management, for founders.
 *
 * Creating a partner mints a code that discounts real orders, and every
 * attributed order accrues commission against them — so what is edited here has
 * money behind it. Terms changes are guarded against restating a rate that
 * unpaid commission was already earned at.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  const partners = await listPartnerRecords()

  // What each of them has actually brought in. Counted from the orders rather
  // than a stored tally, so a refund stops counting without anything having to
  // remember to decrement. Not commission — that needs the ledger (phase 3).
  const performance = await Promise.all(
    partners.map(async (p) => ({
      partnerId: p.partner.id,
      codes: await performanceForCodes(p.codes.map((c) => c.code)),
      // What is actually owed, which is a different question from what they
      // brought in: only `confirmed` money is payable, and a refund reverses.
      balance: await balanceFor(p.partner.id),
    })),
  )

  return NextResponse.json({ partners, performance })
}

interface Body {
  action?: 'create' | 'status' | 'terms' | 'code' | 'settle' | 'mark-paid'
  id?: string
  // create
  email?: string
  name?: string
  discountPct?: number
  code?: string
  // status
  status?: PartnerStatus
  // terms
  terms?: {
    firstOrderPct: number
    renewalPct: number
    renewalMonths: number
    payout: PayoutTerms
    effectiveFrom: string
    note: string
  }
  // code — `targetCode` is the code itself, which is its own identifier
  targetCode?: string
  // settle / mark-paid
  period?: string
  payoutId?: string
  reference?: string
  ignoreMinimum?: boolean
  codePatch?: { discountPct?: number; terms?: CodeTerms; status?: 'active' | 'paused' | 'expired' }
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  await syncPortalRuntime()
  const founder = await getFounder()

  try {
    switch (body.action) {
      case 'create': {
        if (!body.email?.trim() || !body.name?.trim()) {
          return NextResponse.json({ error: 'A name and an email are both needed.' }, { status: 400 })
        }
        const record = await createPartner({
          email: body.email,
          name: body.name,
          discountPct: body.discountPct,
          code: body.code,
          createdBy: founder?.email,
        })
        return NextResponse.json({ ok: true, partner: record })
      }

      case 'status': {
        if (!body.id || !body.status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })
        await setPartnerStatus(body.id, body.status)
        return NextResponse.json({ ok: true, partner: await getPartnerRecord(body.id) })
      }

      case 'terms': {
        if (!body.id || !body.terms) return NextResponse.json({ error: 'id and terms required' }, { status: 400 })
        // New terms cannot start before commission that has been earned and not
        // yet paid, or the rate stored on the ledger row and the terms the
        // partner can read would disagree — and they would be told they were on
        // a rate they were never paid.
        const oldestUnsettled = await oldestUnsettledCommission(body.id)
        await changeTerms(body.id, { ...body.terms, createdBy: founder?.email }, oldestUnsettled)
        return NextResponse.json({ ok: true, partner: await getPartnerRecord(body.id) })
      }

      case 'code': {
        if (!body.id || !body.targetCode) return NextResponse.json({ error: 'id and targetCode required' }, { status: 400 })
        await updateCodeTerms(body.targetCode, body.codePatch ?? {})
        return NextResponse.json({ ok: true, partner: await getPartnerRecord(body.id) })
      }

      case 'settle': {
        if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
        // `YYYY-MM` — the period being settled. Defaults to this month.
        const period = body.period ?? new Date().toISOString().slice(0, 7)
        const result = await settle(body.id, period, { ignoreMinimum: body.ignoreMinimum })
        if (result.payoutId === null) {
          // Not an error: "under the minimum, carries forward" is a normal
          // outcome of a payout run and the founder should read it as one.
          return NextResponse.json({ ok: false, reason: result.reason })
        }
        return NextResponse.json({ ok: true, payout: result, partner: await getPartnerRecord(body.id) })
      }

      case 'mark-paid': {
        if (!body.payoutId) return NextResponse.json({ error: 'payoutId required' }, { status: 400 })
        await markPayoutPaid(body.payoutId, body.reference ?? null)
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err) {
    // The domain throws with wording meant for a founder to read — a duplicate
    // email, a taken code, a backdated change over earned commission.
    return NextResponse.json({ error: err instanceof Error ? err.message : 'That did not work.' }, { status: 400 })
  }
}
