import { NextResponse } from 'next/server'
import {
  isPlausibleEmail,
  latestOptIn,
  normaliseEmail,
  recordMarketingConsent,
  upsertLead,
} from '@/lib/audience'
import { sendMarketingWelcome, sendStackEmail } from '@/lib/audience/send'
import { requestMetadata } from '@/lib/legal/consent'
import type { ConsentBasis, LeadSource } from '@/lib/audience/types'

export const dynamic = 'force-dynamic'

/**
 * POST /api/audience/subscribe — somebody gave us their email address.
 *
 * Two things happen here and they are deliberately independent:
 *
 *  1. **We email them their stack.** They typed an address and pressed a button
 *     that said we would. That is the thing they asked for, and it happens
 *     whether or not they ticked anything.
 *
 *  2. **We record a marketing consent — only if they ticked.** Unticked means no
 *     row, no permission, and no marketing, ever, from this submission. The two
 *     being independent is what makes the consent freely given under UK GDPR
 *     Art. 4(11): if the email only worked when the box was ticked, the tick
 *     would be the price of the thing they came for, and consent bought that way
 *     is not consent at all — it would put the whole list beyond use.
 *
 * The client cannot name what it consented to. It sends `marketingOptIn: true`
 * and nothing else; the wording, its version and its hash are resolved on this
 * side from `MARKETING_CONSENT_STATEMENT`, the same discipline
 * `lib/legal/consent.ts` applies at checkout.
 *
 * It answers 200 for anything short of a malformed request, including a mail
 * provider failing. A person who has just handed over their address cannot fix
 * our mail server, and an error in front of them only invites a second submit.
 */

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 8
const hits = new Map<string, { count: number; resetAt: number }>()

/**
 * Per-IP budget. In-memory, so per-instance on serverless — a brake on a hot
 * loop rather than a defence, same as `api/orders/confirmation`. Eight a minute
 * is far above what a person does (they submit once) and far below what makes
 * this worth using to stuff a list with addresses.
 */
function rateLimited(key: string, now = Date.now()): boolean {
  const entry = hits.get(key)
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  if (entry.count > MAX_PER_WINDOW) return true
  if (hits.size > 5_000) {
    for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k)
  }
  return false
}

function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

const SOURCES: LeadSource[] = ['quiz-reveal', 'quiz-build', 'checkout', 'manual']

interface Body {
  email?: unknown
  firstName?: unknown
  marketingOptIn?: unknown
  source?: unknown
  track?: unknown
  primaryGoal?: unknown
  /** The stack to email them, when there is one to email. */
  stack?: {
    stackName?: unknown
    items?: unknown
    monthly?: unknown
    oneOff?: unknown
  } | null
  /**
   * A field no human ever fills in, hidden from view and from screen readers.
   * A bot that fills every input gives itself away here, and gets the same
   * cheerful 200 as everyone else so it has nothing to learn from.
   */
  website?: unknown
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export async function POST(req: Request) {
  if (rateLimited(clientKey(req))) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  // Honeypot. Answers exactly as a success does.
  if (str(body.website)) return NextResponse.json({ ok: true })

  const rawEmail = str(body.email)
  if (!rawEmail || !isPlausibleEmail(rawEmail)) {
    return NextResponse.json(
      { ok: false, error: 'That doesn’t look like an email address — check it and try again.' },
      { status: 400 },
    )
  }

  const email = normaliseEmail(rawEmail)
  const firstName = str(body.firstName)
  const source: LeadSource = SOURCES.includes(body.source as LeadSource)
    ? (body.source as LeadSource)
    : 'quiz-reveal'
  const optIn = body.marketingOptIn === true

  try {
    await upsertLead({
      email,
      firstName,
      source,
      track: str(body.track),
      primaryGoal: str(body.primaryGoal),
    })

    // Only ever on a tick. A submission without one leaves no permission behind.
    let welcomeNeeded = false
    if (optIn) {
      const already = await latestOptIn(email)
      welcomeNeeded = already == null
      const { ip, userAgent } = requestMetadata(req)
      const basis: ConsentBasis = 'consent'
      await recordMarketingConsent({ email, action: 'opt-in', basis, source, ip, userAgent })
    }

    const stack = body.stack ?? null
    const items = Array.isArray(stack?.items)
      ? (stack!.items as unknown[])
          .map((item) => {
            const row = item as { title?: unknown; reason?: unknown }
            const title = str(row?.title)
            return title ? { title, reason: str(row?.reason) ?? '' } : null
          })
          .filter((i): i is { title: string; reason: string } => i != null)
          .slice(0, 12)
      : []

    if (items.length > 0) {
      await sendStackEmail({
        email,
        firstName,
        stackName: str(stack?.stackName) ?? 'Your stack',
        items,
        monthly: num(stack?.monthly),
        oneOff: num(stack?.oneOff),
      })
    }

    // After the stack, so the thing they asked for is the first to arrive.
    if (welcomeNeeded) await sendMarketingWelcome({ email, firstName })

    return NextResponse.json({ ok: true, emailed: items.length > 0, optedIn: optIn })
  } catch (err) {
    // Logged loudly, answered gently: the address may well have been saved, and
    // there is nothing useful for the person on the other end to do about it.
    console.error('[audience] capture failed:', err)
    return NextResponse.json({ ok: true })
  }
}
