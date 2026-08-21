import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { mayMarket, recordMarketingConsent } from '@/lib/audience'
import { requestMetadata } from '@/lib/legal/consent'
import { resumeMarketing, suppressMarketing } from '@/lib/notify/marketing'

export const dynamic = 'force-dynamic'

/**
 * A member's own marketing preference.
 *
 * GET  → may we email them
 * POST → change it, either way
 *
 * The address comes from the SESSION, never from the request body. A body-supplied
 * address would let a signed-in member opt somebody else out — or, worse, opt
 * somebody else IN — and consent that can be given on another person's behalf is
 * not consent at all.
 *
 * Turning it on here counts as a fresh opt-in and is recorded as one, with the
 * request metadata, exactly as the quiz card's tick is: this page is the
 * statement, and a member who ticks it is agreeing to the same thing.
 */
export async function GET() {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  return NextResponse.json({ email: user.email, optedIn: await mayMarket(user.email) })
}

export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!user.email) return NextResponse.json({ error: 'This account has no email address' }, { status: 400 })

  let body: { optedIn?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const optedIn = body.optedIn === true
  const { ip, userAgent } = requestMetadata(req)

  if (optedIn) await resumeMarketing(user.email)
  else await suppressMarketing(user.email)

  await recordMarketingConsent({
    email: user.email,
    action: optedIn ? 'opt-in' : 'opt-out',
    basis: 'consent',
    source: 'my-hub',
    ip,
    userAgent,
  })

  return NextResponse.json({ ok: true, optedIn: await mayMarket(user.email) })
}
