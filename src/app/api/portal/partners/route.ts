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

export const dynamic = 'force-dynamic'

/**
 * Partner management, for founders.
 *
 * Everything here is internal — creating a partner has no customer-facing effect
 * until codes are redeemable (phase 2). A partner exists, holds a code and is on
 * a dated deal; nothing yet discounts anything or pays anyone.
 */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await syncPortalRuntime()
  return NextResponse.json({ partners: await listPartnerRecords() })
}

interface Body {
  action?: 'create' | 'status' | 'terms' | 'code'
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
        // `oldestUnsettled` is null until the commission ledger exists (phase 3).
        // Passing null is honest — there is genuinely nothing yet to protect —
        // rather than lax; the guard is written and tested, it just has no
        // earned commission to guard against.
        await changeTerms(body.id, { ...body.terms, createdBy: founder?.email }, null)
        return NextResponse.json({ ok: true, partner: await getPartnerRecord(body.id) })
      }

      case 'code': {
        if (!body.id || !body.targetCode) return NextResponse.json({ error: 'id and targetCode required' }, { status: 400 })
        await updateCodeTerms(body.targetCode, body.codePatch ?? {})
        return NextResponse.json({ ok: true, partner: await getPartnerRecord(body.id) })
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
