import { NextResponse } from 'next/server'
import { inviteHolder } from '@/lib/partners/auth'
import { getPartnerPasswordHash, listCodes, listTerms } from '@/lib/partners/repo'
import { describeTerms, termsInForce, sortedHistory } from '@/lib/partners/terms'

export const dynamic = 'force-dynamic'

/**
 * What an affiliate's sign-in link is worth opening — their name, their code
 * and their rate, before they have an account to read it from.
 *
 * ── Why an affiliate has its own front door ─────────────────────────────────
 * An influencer's link opens on `/partner/claim`, which is an offer of a free
 * stack and an agreement with deliverables in it. An affiliate was offered
 * neither. Sending them through that page would ask them to sign for a box
 * nobody promised them, and the page would have nothing to show — so the two
 * programmes get one front door each, and `/api/portal/partners` decides which
 * link a founder is given rather than leaving them to pick.
 *
 * ── Why this is a read and nothing else ─────────────────────────────────────
 * Setting the password is `/api/partner/set-password`, which this page posts
 * to. One endpoint writes a partner's password, for both programmes: that is
 * where the token is burnt before the write, where every existing session is
 * dropped, and where the rules about all of it are written down. A second
 * implementation of the same three steps is how two of them drift apart.
 *
 * Reading does NOT spend the link, for the reason the set-password route gives:
 * a preview fetch in a messaging app must not be able to lock somebody out of
 * their own account before they have opened it.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')
  const held = token ? await inviteHolder(token) : null

  /*
    One answer for a bad token, an expired one and a suspended account — which
    of the three it was is only useful to somebody trying links. Same shape as
    `/api/partner/claim`, whose reasoning this follows.
  */
  if (!held || held.partner.status === 'suspended') {
    return NextResponse.json({ link: 'dead' })
  }

  const { partner, expiresAt } = held
  const codes = await listCodes(partner.id).catch(() => [])
  const code = codes.find((c) => c.status === 'active') ?? codes[0] ?? null
  const history = await listTerms(partner.id).catch(() => [])
  const terms = termsInForce(history) ?? sortedHistory(history).at(-1) ?? null

  return NextResponse.json({
    link: 'live',
    /*
      The page sends an influencer to their own door rather than showing them an
      affiliate's welcome. The link is valid — it is simply about a different
      programme, and this is the one place that can tell.
    */
    kind: partner.kind,
    name: partner.name,
    /** When the link stops working, so the page can say so rather than let it lapse. */
    linkExpiresAt: expiresAt,
    /** Whether they can already get in without it — a link opened twice is not an error. */
    hasPassword: Boolean(await getPartnerPasswordHash(partner.id).catch(() => null)),
    code: code ? { code: code.code, discountPct: code.discountPct } : null,
    earn: terms
      ? { commissionPct: terms.firstOrderPct, wording: describeTerms(terms) }
      : null,
  })
}
