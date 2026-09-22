import { NextResponse } from 'next/server'
import { inviteHolder, setPasswordWithToken, startPartnerSession } from '@/lib/partners/auth'
import {
  getPartnerByEmail,
  getPartnerPasswordHash,
  listCodes,
  listTerms,
  updatePartner,
} from '@/lib/partners/repo'
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
 * ── Why the POST is here and not on `/api/partner/set-password` ─────────────
 * Because an affiliate's sign-up settles TWO things and they have to land
 * together: the email they will sign in with, and the password. The founder
 * typed the email when they made the account — from a DM, a call, or a guess —
 * and the person receiving the link may never have seen it. Making them find
 * out it was wrong at the sign-in screen, locked out of an account that is
 * already earning, is the failure this avoids.
 *
 * It does not reimplement the password write. `setPasswordWithToken` still
 * burns the link before writing and drops every session the account held; this
 * only decides the email around it, and checks the email is free BEFORE the
 * token is spent so a clash cannot leave somebody with a burnt link.
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
    /** What they will sign in with — theirs to correct before it is settled. */
    email: partner.email,
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

/** A shape, not a deliverability check — the only honest test without sending. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
}

export async function POST(req: Request) {
  let body: { token?: unknown; email?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : ''
  const held = token ? await inviteHolder(token) : null
  if (!held || held.partner.status === 'suspended') {
    return NextResponse.json({ error: 'That link has expired or has already been used.' }, { status: 401 })
  }

  const email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase()
  if (!email || !looksLikeEmail(email)) {
    return NextResponse.json({ error: 'Give an email address you can sign in with.' }, { status: 400 })
  }

  /*
    Checked before the token is spent, not after.

    The other order sets the password, burns the link, then discovers the email
    is taken — leaving somebody signed up, unable to correct the thing that
    failed, holding a link that no longer works.
  */
  const changed = email !== held.partner.email
  if (changed) {
    const clash = await getPartnerByEmail(email)
    if (clash && clash.id !== held.partner.id) {
      return NextResponse.json(
        { error: 'There is already an account on that email. Use another, or ask us to merge them.' },
        { status: 409 },
      )
    }
  }

  const result = await setPasswordWithToken(token, typeof body.password === 'string' ? body.password : '')
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 })

  if (changed) await updatePartner(result.partner.id, { email })

  // Straight in — they have just proved they hold the link and chosen a
  // password; making them type it again immediately is friction for nothing.
  await startPartnerSession(result.partner.id)
  return NextResponse.json({ ok: true, email })
}
