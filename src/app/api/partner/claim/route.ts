import { NextResponse } from 'next/server'
import { inviteHolder, startPartnerSession } from '@/lib/partners/auth'
import { getPartnerPasswordHash, listCodes } from '@/lib/partners/repo'
import { getOrder } from '@/lib/orders/repo'
import { requestMetadata } from '@/lib/legal/consent'
import { getAgreement, listStartersForPartner } from '@/lib/partner-starter/repo'
import { NO_CODE_YET, agreementFor, signAgreement } from '@/lib/partner-starter/sign'
import { starterState } from '@/lib/partner-starter/rules'
import { PARTNER_DELIVERABLES } from '@/lib/partner-starter/agreement'

export const dynamic = 'force-dynamic'

/**
 * Claiming a starter stack from an invite link, before there is an account.
 *
 * ── Why this exists next to `/api/partner/starter` ──────────────────────────
 * That one answers for a signed-in partner. This one answers for somebody who
 * has tapped a link in a DM and has no session, no password, and no reason yet
 * to want one — which is nearly everybody the first time.
 *
 * The step it removes was the whole drop-off: a person who came for a free box
 * met a form asking them to invent a password. They need an account to check
 * their earnings in November; they do not need one to read an agreement and put
 * their name at the bottom of it.
 *
 * ── Why the invite token is enough ──────────────────────────────────────────
 * Because it is already strictly more powerful than what it is being used for
 * here. The same token, at `/partner/set-password`, sets the account's password
 * and thereby takes the account. Anything it can authorise here it could
 * authorise there by first setting a password and signing in — so this grants
 * nothing new. It is single-use for that purpose, seven days, and hashed at
 * rest.
 *
 * ── Why signing does NOT burn the token ─────────────────────────────────────
 * Because burning it would leave a partner who has just signed with no way back
 * into their own account, holding a link that no longer works. Signing is
 * once-only regardless: the starter's `agreement_id IS NULL` guard is what
 * enforces that, not the token.
 *
 * A session IS started on a successful signature, which is what "no password"
 * means in practice — they can read their own numbers straight away and set a
 * password whenever they feel like it.
 */

/**
 * What this partner has, and where they are up to.
 *
 * Finds their starter in ANY state, which is the fix for the thing that made
 * the link useless the moment it had worked: a starter spent on an order was
 * not matched at all, so somebody who had signed, claimed and ordered came back
 * to "there is no stack waiting on it just now". They had done everything.
 */
async function resolve(token: string | null) {
  if (!token) return null
  const held = await inviteHolder(token)
  if (!held) return null
  if (held.partner.status === 'suspended') return null

  const starters = await listStartersForPartner(held.partner.id)
  // The one they can still act on, else the one they spent.
  const live = starters.find((s) => ['unsigned', 'ready'].includes(starterState(s)))
  const spent = starters.find((s) => starterState(s) === 'used')
  return { partner: held.partner, expiresAt: held.expiresAt, starter: live ?? spent ?? null }
}

/** What a PARTNER needs to know about the order they claimed — not the hub's view. */
async function orderFor(orderId: string | null | undefined) {
  if (!orderId) return null
  const order = await getOrder(orderId).catch(() => null)
  if (!order) return null
  return {
    reference: order.reference ?? order.id,
    placedAt: order.createdAt,
    /*
      Four words, not nine statuses. Somebody who has ordered wants to know
      whether it is coming; `submitted_to_supplier` and `supplier_confirmed`
      are our plumbing and mean the same thing to them.
    */
    stage:
      order.status === 'delivered'
        ? 'Delivered'
        : order.status === 'shipped'
          ? 'On its way'
          : order.status === 'cancelled' || order.status === 'refunded'
            ? 'Cancelled'
            : 'Being packed',
  }
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')
  const found = await resolve(token)

  /*
    One answer for a bad token, an expired one and a suspended partner: which of
    those it was is only useful to somebody trying links.
  */
  if (!found) return NextResponse.json({ link: 'dead', starter: null })

  const { partner, starter, expiresAt } = found
  const state = starter ? starterState(starter) : null
  const agreement = starter?.agreementId ? await getAgreement(starter.agreementId) : null
  const codes = await listCodes(partner.id).catch(() => [])
  const partnerCode = codes.find((c) => c.status === 'active')?.code ?? codes[0]?.code ?? null

  /*
    The agreement text is served ONLY when there is something to sign.

    It is two and a half kilobytes, and a partner who signed last week does not
    need it again — nor should the page have the material to ask them a second
    time, which is exactly what a returning partner used to meet.
  */
  const document = starter && state === 'unsigned' ? await agreementFor(partner, starter) : null

  return NextResponse.json({
    link: 'live',
    /** When this link stops working — the countdown on setting a password. */
    linkExpiresAt: expiresAt,
    partnerName: partner.name,
    partnerCode,
    /** Whether they can already get back in without this link. */
    hasPassword: Boolean(await getPartnerPasswordHash(partner.id).catch(() => null)),
    starter: starter ? { goodsCap: starter.goodsCap, expiresAt: starter.expiresAt, state } : null,
    signed: agreement
      ? { at: agreement.signedAt, name: agreement.signedName, handle: agreement.handle }
      : null,
    order: await orderFor(starter?.orderId),
    agreement: document
      ? { version: document.version, text: document.text, deliverables: PARTNER_DELIVERABLES }
      : null,
  })
}

export async function POST(req: Request) {
  let body: { token?: unknown; signedName?: unknown; handle?: unknown; version?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const found = await resolve(typeof body.token === 'string' ? body.token : null)
  if (!found) return NextResponse.json({ error: 'That link has expired.' }, { status: 401 })
  if (!found.starter || starterState(found.starter) !== 'unsigned') {
    return NextResponse.json({ error: 'There is nothing here to sign for.' }, { status: 409 })
  }

  const { ip, userAgent } = requestMetadata(req)
  const result = await signAgreement({
    partner: found.partner,
    starter: found.starter,
    signedName: typeof body.signedName === 'string' ? body.signedName : '',
    handle: typeof body.handle === 'string' ? body.handle : null,
    version: typeof body.version === 'string' ? body.version : '',
    ip,
    userAgent,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.reason, staleVersion: result.staleVersion }, { status: 400 })
  }

  // Signed, so they are who the link said they were. A session now means they
  // can read their own numbers without inventing a password first.
  await startPartnerSession(found.partner.id)

  return NextResponse.json({
    ok: true,
    code: found.starter.code,
    signedAt: result.agreement.signedAt,
  })
}
