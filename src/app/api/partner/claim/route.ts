import { NextResponse } from 'next/server'
import { partnerForInvite, startPartnerSession } from '@/lib/partners/auth'
import { requestMetadata } from '@/lib/legal/consent'
import { listStartersForPartner } from '@/lib/partner-starter/repo'
import { NO_CODE_YET, agreementFor, signAgreement } from '@/lib/partner-starter/sign'
import { starterState, starterTierLabel } from '@/lib/partner-starter/rules'
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

async function resolve(token: string | null) {
  if (!token) return null
  const partner = await partnerForInvite(token)
  if (!partner) return null
  if (partner.status === 'suspended') return null
  const starters = await listStartersForPartner(partner.id)
  const starter = starters.find((s) => {
    const state = starterState(s)
    return state === 'unsigned' || state === 'ready'
  })
  return { partner, starter: starter ?? null }
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')
  const found = await resolve(token)
  // One answer for a bad token, an expired one, a suspended partner and one
  // with nothing to claim. Which of those it was is only useful to somebody
  // trying links, and the page has one thing to say either way.
  if (!found || !found.starter) return NextResponse.json({ starter: null })

  const { partner, starter } = found
  const { text, version, context } = await agreementFor(partner, starter)
  const state = starterState(starter)

  return NextResponse.json({
    partnerName: partner.name,
    /* See the note in `/api/partner/starter` — the code they just agreed to
       post, handed back so the journey does not end without it. */
    partnerCode: context.partnerCode === NO_CODE_YET ? null : context.partnerCode,
    starter: {
      code: state === 'ready' ? starter.code : null,
      tier: starter.tier,
      tierLabel: starterTierLabel(starter.tier),
      goodsCap: starter.goodsCap,
      expiresAt: starter.expiresAt,
      state,
    },
    agreement: { version, text, deliverables: PARTNER_DELIVERABLES, signedAt: null, signedName: null },
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
