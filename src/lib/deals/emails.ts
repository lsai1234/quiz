/**
 * Telling members a deal has opened (server-only).
 *
 * The daily job looks at every member with an open hub and sends one email
 * per deal on the day it opens: "Your Creatine price is open", one button into
 * the hub. Sent to existing customers about products they bought (the soft
 * opt-in), each with a link that stops them without signing in. Through the
 * outbox: deduped per deal, and held to the test allowlist until payments are
 * live. Never throws.
 */
import { randomBytes } from 'node:crypto'
import { kvGet, kvSet } from '@/lib/db/kv'
import { appBaseUrl } from '@/lib/notify'
import { emailShell } from '@/lib/notify/brand'
import type { RenderedEmail } from '@/lib/notify/types'
import { DEALS_COPY as C } from './copy'
import type { MemberDeal } from './engine'

/* Kept by email, so a guest who has never signed in can stop them too. */
const norm = (email: string) => email.trim().toLowerCase()
const OFF = (email: string) => `deal-emails-off:${norm(email)}`
const STOP = (token: string) => `deal-stop:${token}`
const STOP_OF = (email: string) => `deal-stop-of:${norm(email)}`

export async function dealEmailsOff(email: string): Promise<boolean> {
  return (await kvGet<boolean>(OFF(email))) === true
}

export async function setDealEmails(email: string, on: boolean): Promise<void> {
  await kvSet(OFF(email), !on)
}

/** Their own stop link's token: random, kept with their email. */
export async function stopTokenFor(email: string): Promise<string> {
  const had = await kvGet<string>(STOP_OF(email))
  if (had) return had
  const token = randomBytes(18).toString('base64url')
  await kvSet(STOP(token), norm(email))
  await kvSet(STOP_OF(email), token)
  return token
}

/** Stop by link: true when the token was real. */
export async function stopByToken(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return false
  const email = await kvGet<string>(STOP(token))
  if (!email) return false
  await setDealEmails(email, false)
  return true
}

export function dealOpenEmail(deal: Pick<MemberDeal, 'short' | 'quote' | 'endsOn'>, firstName: string | null, links: { hub: string; stop: string; base: string }): RenderedEmail {
  const ends = new Date(`${deal.endsOn}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  const shell = emailShell({
    preheader: C.emailPreheader(deal.short),
    heading: C.emailHeading(deal.short),
    intro: C.emailIntro(firstName),
    paragraphs: [
      `${C.dealLine(deal.quote)}: ${C.price(deal.quote.total, deal.quote.normalTotal)}.`,
      ...(deal.quote.deliveryDeal === 'free' ? [C.freeDeliveryCondition] : []),
      `${C.openUntil(ends)}. ${C.terms}`,
    ],
    cta: { label: C.emailCta, url: links.hub },
    secondaryCta: { label: C.emailStop, url: links.stop },
    links: { base: links.base, optOutUrl: null },
    marketing: null,
  })
  return { subject: C.emailSubject(deal.short), ...shell }
}

/** The daily job's step: an email for each deal that opened today. */
export async function sweepDealEmails(now = new Date()): Promise<{ sent: number }> {
  const result = { sent: 0 }
  try {
    const { getOfferSettings } = await import('@/lib/offer/store')
    if (!(await getOfferSettings()).services.deals) return result
    const today = now.toISOString().slice(0, 10)
    const [{ getUserByEmail }, { dealsFor }, { queueNotification, deliverIfAutomatic }, { listRecentCustomers }] = await Promise.all([
      import('@/lib/db/users'),
      import('./server'),
      import('@/lib/notify/outbox'),
      import('@/lib/orders/repo'),
    ])
    const base = appBaseUrl()
    // Everyone whose hub is open: an order in the last 90 days, account or not.
    for (const c of await listRecentCustomers(new Date(now.getTime() - 90 * 86_400_000).toISOString())) {
      try {
        if (await dealEmailsOff(c.email)) continue
        const user = await getUserByEmail(c.email)
        const who = { id: user?.id ?? c.userId ?? `email:${c.email}`, email: c.email }
        const { deals } = await dealsFor(who, now)
        for (const deal of deals.filter((d) => d.state === 'open' && d.opensOn === today)) {
          const token = await stopTokenFor(c.email)
          const queued = await queueNotification({
            userId: user?.id ?? c.userId ?? null,
            email: c.email,
            template: 'deal-open',
            dedupeKey: `deal-open:${c.email}:${deal.productId}:${deal.boughtOn}`,
            rendered: dealOpenEmail(deal, user?.name?.trim().split(/\s+/)[0] ?? null, {
              hub: `${base}/myhub?email=${encodeURIComponent(c.email)}#deals`,
              stop: `${base}/myhub/emails?stop=${token}`,
              base,
            }),
          })
          await deliverIfAutomatic(queued)
          result.sent++
        }
      } catch (err) {
        console.error('[deals] one customer’s deal emails failed:', err)
      }
    }
  } catch (err) {
    console.error('[deals] deal email sweep failed:', err)
  }
  return result
}
