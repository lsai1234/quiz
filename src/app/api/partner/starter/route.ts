import { NextResponse } from 'next/server'
import { getSessionPartner } from '@/lib/partners/auth'
import { requestMetadata } from '@/lib/legal/consent'
import { listStartersForPartner, getAgreement } from '@/lib/partner-starter/repo'
import { NO_CODE_YET, agreementFor, signAgreement } from '@/lib/partner-starter/sign'
import { starterState } from '@/lib/partner-starter/rules'
import { PARTNER_DELIVERABLES } from '@/lib/partner-starter/agreement'

export const dynamic = 'force-dynamic'

/**
 * The partner's own starter stack — read it, and sign for it.
 *
 * Both verbs answer for the SIGNED-IN partner and nobody else: the starter is
 * looked up from the session, never from an id in the request. A route that
 * took a code and trusted it would let anybody who guessed one sign somebody
 * else's agreement, which is exactly the wrong thing to be able to do to a
 * document that carries a person's name.
 */

/** The starter this partner should be shown — the live one, else the newest. */
function pick<T extends { createdAt: string }>(rows: T[], isLive: (r: T) => boolean): T | null {
  return rows.find(isLive) ?? rows[0] ?? null
}

export async function GET() {
  const partner = await getSessionPartner()
  if (!partner) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const starters = await listStartersForPartner(partner.id)
  const starter = pick(starters, (s) => {
    const state = starterState(s)
    return state === 'unsigned' || state === 'ready'
  })
  if (!starter) return NextResponse.json({ starter: null })

  const { text, version, context } = await agreementFor(partner, starter)
  const state = starterState(starter)
  const agreement = starter.agreementId ? await getAgreement(starter.agreementId) : null

  return NextResponse.json({
    /*
      Their own 25% code, handed back with the starter.

      Not an afterthought: the moment they finish signing is the moment they
      have agreed to post a code and a link, and the journey used to end there
      without ever showing them either. Taken from `agreementFor` rather than
      looked up again, so the code on screen is the one the document they just
      signed actually names.
    */
    partnerCode: context.partnerCode === NO_CODE_YET ? null : context.partnerCode,
    starter: {
      // The CODE ITSELF is only sent once it can actually be used. Before the
      // agreement is signed it buys nothing, and putting it on screen anyway
      // invites somebody to try it, be refused, and conclude the thing is
      // broken rather than unsigned.
      code: state === 'ready' ? starter.code : null,
      tier: starter.tier,
      goodsCap: starter.goodsCap,
      expiresAt: starter.expiresAt,
      state,
    },
    agreement: {
      version,
      text,
      deliverables: PARTNER_DELIVERABLES,
      signedAt: agreement?.signedAt ?? null,
      signedName: agreement?.signedName ?? null,
    },
  })
}

export async function POST(req: Request) {
  const partner = await getSessionPartner()
  if (!partner) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  let body: { signedName?: unknown; handle?: unknown; version?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const starters = await listStartersForPartner(partner.id)
  const starter = starters.find((s) => starterState(s) === 'unsigned')
  if (!starter) {
    return NextResponse.json({ error: 'There is nothing here to sign for.' }, { status: 409 })
  }

  const { ip, userAgent } = requestMetadata(req)
  const result = await signAgreement({
    partner,
    starter,
    signedName: typeof body.signedName === 'string' ? body.signedName : '',
    handle: typeof body.handle === 'string' ? body.handle : null,
    version: typeof body.version === 'string' ? body.version : '',
    ip,
    userAgent,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.reason, staleVersion: result.staleVersion }, { status: 400 })
  }

  // Signed — so the code goes back, because this is the moment it starts
  // working and the moment they need it.
  return NextResponse.json({ ok: true, code: starter.code, signedAt: result.agreement.signedAt })
}
