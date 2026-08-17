import { NextResponse, type NextRequest } from 'next/server'
import { decodeSharePayload } from '@/lib/share-card/codec'
import { createShareCard } from '@/lib/db/share-cards'
import { getUserForSession } from '@/lib/db/sessions'
import { cookies } from 'next/headers'
import { HUB_COOKIE } from '@/lib/auth/session'
import { REFERRAL_COOKIE } from '@/lib/partners/referral'

/**
 * Mint a share link.
 *
 * The sheet posts the encoded payload it already built and gets a ten-character
 * token back. Everything that makes a link short, countable and revocable lives
 * behind this one call.
 *
 * ── The payload is user input, and stays that way ───────────────────────────
 * Anyone can post a crafted payload and get a token for it. That is acceptable
 * for a vanity graphic — this is a domain that already lets you type anything
 * into a quiz — but it means nothing downstream may treat a stored card as
 * evidence. A competition entry is verified against what a person actually
 * posted, never against a row somebody created by calling this.
 *
 * It is validated before storage all the same, so a malformed card is a 400 here
 * rather than a broken image somewhere a customer has already pasted the link.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A real payload is well under 4KB; this is a bomb guard, not a limit. */
const MAX_BYTES = 8_192

export async function POST(req: NextRequest) {
  let body: { d?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const encoded = typeof body.d === 'string' ? body.d : ''
  if (!encoded || encoded.length > MAX_BYTES) {
    return NextResponse.json({ error: 'missing or invalid payload' }, { status: 400 })
  }

  const payload = decodeSharePayload(encoded)
  if (!payload) {
    return NextResponse.json({ error: 'missing or invalid payload' }, { status: 400 })
  }

  // Both optional, and both best-effort: a share must not fail because the
  // person is signed out, or because a cookie could not be read.
  const jar = await cookies().catch(() => null)
  const user = await getUserForSession(jar?.get(HUB_COOKIE)?.value).catch(() => null)
  const referral = jar?.get(REFERRAL_COOKIE)?.value?.trim() || null

  try {
    const card = await createShareCard({
      payload,
      userId: user?.id ?? null,
      // What the card says wins over what the browser is carrying: the code on
      // the card is the one the customer will read off the image.
      partnerCode: payload.code ?? referral,
    })
    return NextResponse.json({ token: card.token }, { headers: { 'cache-control': 'no-store' } })
  } catch (err) {
    console.error('[api/share] could not create card:', err)
    // The sheet falls back to the long stateless link, so this is a degraded
    // share rather than a failed one.
    return NextResponse.json({ error: 'could not create link' }, { status: 503 })
  }
}
