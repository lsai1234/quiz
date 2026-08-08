import { NextResponse } from 'next/server'
import { redeemPartnerCode } from '@/lib/partners/redeem'
import { getHubUser } from '@/lib/auth/session'
import { syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/**
 * POST /api/partner-code → { ok, code, discountPct } | { ok: false, reason }
 *
 * Checks a code while someone is typing it, so the basket can say what it takes
 * off before they commit to paying. Advisory only — every checkout re-validates
 * server-side against the same function, because between this call and the
 * payment a code can be paused, capped out or its partner suspended.
 *
 * Deliberately answers "we don't recognise that code" rather than distinguishing
 * a code that never existed from one that has expired: the difference is only
 * useful to someone guessing at codes.
 */
export async function POST(req: Request) {
  let body: { code?: string; subtotal?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, reason: 'Enter a code.' }, { status: 400 })
  }

  await syncPortalRuntime()

  // The signed-in member's email decides first-order-only. A guest has none yet,
  // which reads as a first order — see `RedeemContext`.
  const user = await getHubUser().catch(() => null)

  const result = await redeemPartnerCode(body.code, {
    subtotal: typeof body.subtotal === 'number' ? body.subtotal : 0,
    email: user?.email ?? null,
  })

  if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason })

  return NextResponse.json({
    ok: true,
    code: result.code.code,
    discountPct: result.discountPct,
    partnerName: result.partner.name,
  })
}
