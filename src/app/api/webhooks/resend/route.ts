import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { recordMarketingConsent } from '@/lib/audience/consent'
import { suppressMarketing } from '@/lib/notify/marketing'

export const dynamic = 'force-dynamic'

/**
 * Bounces and complaints, from Resend.
 *
 * Two events matter and they are treated the same way — stop emailing this
 * address — for different reasons:
 *
 *  • **A hard bounce** means the mailbox does not exist. Continuing to send to
 *    it is how a sending domain's reputation dies: providers read a rising
 *    bounce rate as a list that was bought rather than earned, and start filing
 *    everything from the domain as spam, receipts included.
 *  • **A complaint** is somebody pressing "this is spam" instead of the
 *    unsubscribe link. It is the same instruction, expressed less kindly, and
 *    honouring it immediately is both the law and the only way to keep the
 *    reputation the receipts depend on.
 *
 * Suppression here is the same list the unsubscribe link writes to, so a
 * complaint and a click end in exactly the same place.
 *
 * Nothing is trusted without a signature. `RESEND_WEBHOOK_SECRET` is Svix-style
 * (Resend uses Svix): the signed payload is `id.timestamp.body`.
 */

function verified(req: Request, rawBody: string): boolean {
  const secret = (process.env.RESEND_WEBHOOK_SECRET ?? '').trim()
  // No secret configured means the endpoint is not in use. Refuse rather than
  // accept anything: an unauthenticated route that can suppress addresses is a
  // way to silence a competitor's customers.
  if (!secret) return false

  const id = req.headers.get('svix-id')
  const timestamp = req.headers.get('svix-timestamp')
  const signatures = req.headers.get('svix-signature')
  if (!id || !timestamp || !signatures) return false

  // Reject anything older than five minutes — a replayed request is a valid
  // signature applied to a message we already handled.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')

  // The header carries a space-separated list of `v1,<signature>` pairs.
  return signatures.split(' ').some((entry) => {
    const value = entry.split(',')[1] ?? ''
    const a = Buffer.from(value)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

const STOP_ON = new Set(['email.bounced', 'email.complained'])

export async function POST(req: Request) {
  const rawBody = await req.text()
  if (!verified(req, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let event: { type?: string; data?: { to?: unknown; bounce?: { type?: string } } }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const type = typeof event.type === 'string' ? event.type : ''
  if (!STOP_ON.has(type)) return NextResponse.json({ ok: true, ignored: type })

  // A soft bounce is a full mailbox or a server having a bad afternoon, and
  // suppressing for one would stop marketing to a real customer over a
  // temporary problem. Anything else — permanent, undetermined, or a provider
  // that did not say — is treated as final: an address that keeps bouncing is
  // what turns a sending domain's reputation, and suppression here only stops
  // the marketing. Their receipts are unaffected.
  if (type === 'email.bounced' && /transient|soft|delay/i.test(event.data?.bounce?.type ?? '')) {
    return NextResponse.json({ ok: true, ignored: 'soft-bounce' })
  }

  const recipients = Array.isArray(event.data?.to)
    ? (event.data.to as unknown[]).filter((v): v is string => typeof v === 'string')
    : typeof event.data?.to === 'string'
      ? [event.data.to as string]
      : []

  for (const email of recipients) {
    await suppressMarketing(email)
    try {
      await recordMarketingConsent({
        email,
        action: 'opt-out',
        basis: 'consent',
        source: type === 'email.complained' ? 'spam-complaint' : 'hard-bounce',
      })
    } catch (err) {
      console.error('[notify] bounce suppressed but not evidenced:', err)
    }
  }

  console.info(`[notify] ${type}: suppressed ${recipients.length} address(es)`)
  return NextResponse.json({ ok: true, suppressed: recipients.length })
}
