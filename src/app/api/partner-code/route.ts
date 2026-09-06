import { NextResponse } from 'next/server'
import { redeemPartnerCode, type RedeemChannel } from '@/lib/partners/redeem'
import { checkFounderCode } from '@/lib/founder-codes/redeem'
import { codeAttemptAllowed, recordCodeMiss } from '@/lib/founder-codes/guess-limit'
import { FOUNDER_CODE_LABELS } from '@/lib/founder-codes/types'
import { getHubUser } from '@/lib/auth/session'
import { syncPortalRuntime } from '@/lib/portal/store'
import { requestMetadata } from '@/lib/legal/consent'

export const dynamic = 'force-dynamic'

/**
 * POST /api/partner-code → { ok, code, discountPct } | { ok: false, reason }
 *
 * Checks a code while someone is typing it, so the basket can say what it takes
 * off before they commit to paying. Advisory only — every checkout re-validates
 * server-side against the same function, because between this call and the
 * payment a code can be paused, capped out or its partner suspended.
 *
 * ONE box, TWO kinds of code. A partner's code and a founder's code are
 * different objects with different rules (see `lib/founder-codes/types.ts`), but
 * they are the same thing to the person typing one in: a code. Splitting the
 * endpoint would have meant splitting the box, and then deciding which of the
 * two a customer is holding before they have finished typing it.
 *
 * A partner's starter stack is deliberately NOT here. It used to be, as a third
 * code — and a free stack is not a discount somebody types, it is a journey
 * they are invited into. It now rides on their session from the link in their
 * portal; see `lib/partner-starter/handoff.ts`.
 *
 * Deliberately answers "we don't recognise that code" rather than distinguishing
 * a code that never existed from one that has expired: the difference is only
 * useful to someone guessing at codes.
 */
export async function POST(req: Request) {
  let body: { code?: string; subtotal?: number; channel?: RedeemChannel }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, reason: 'Enter a code.' }, { status: 400 })
  }

  await syncPortalRuntime()

  const { ip } = requestMetadata(req)
  // Founder codes take up to 100% off, so the box that checks them is worth a
  // brake. See `guess-limit.ts` for what this does and does not promise.
  if (!codeAttemptAllowed(ip)) {
    return NextResponse.json({ ok: false, reason: 'Too many attempts. Try again shortly.' }, { status: 429 })
  }

  /**
   * Founder codes first, and only when the string is shaped like one — a code
   * that is not ours returns null here and falls through to the partner path
   * untouched, so nothing about this branch is visible to an ordinary customer.
   */
  const founder = await checkFounderCode(body.code, { channel: body.channel ?? null })
  if (founder) {
    if (!founder.ok) {
      recordCodeMiss(ip)
      return NextResponse.json({ ok: false, reason: founder.reason })
    }
    return NextResponse.json({
      ok: true,
      code: founder.code.code,
      // Not a percentage off anything. A founder code rewrites the prices
      // rather than discounting them, and reporting a rate here would put an
      // invented "100% off" on a receipt that has no such line.
      discountPct: 0,
      founderKind: founder.kind,
      label: FOUNDER_CODE_LABELS[founder.kind].title,
      note: FOUNDER_CODE_LABELS[founder.kind].blurb,
      expiresAt: founder.code.expiresAt,
    })
  }

  // The signed-in member's email decides first-order-only. A guest has none yet,
  // which reads as a first order — see `RedeemContext`.
  const user = await getHubUser().catch(() => null)

  const result = await redeemPartnerCode(body.code, {
    subtotal: typeof body.subtotal === 'number' ? body.subtotal : 0,
    email: user?.email ?? null,
    // Which journey is asking. Codes do not apply to general shop sales, and
    // this is what lets the box say so while they are typing rather than at the
    // payment screen. Advisory like the rest of this route — `/api/cart` and
    // `finalizeCheckout` decide the channel from what is actually being bought.
    channel: body.channel ?? null,
  })

  if (!result.ok) {
    recordCodeMiss(ip)
    return NextResponse.json({ ok: false, reason: result.reason })
  }

  return NextResponse.json({
    ok: true,
    code: result.code.code,
    discountPct: result.discountPct,
    partnerName: result.partner.name,
  })
}
