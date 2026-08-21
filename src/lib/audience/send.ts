/**
 * The emails that go to somebody's address because they gave us their address.
 *
 * Server-only. This is the seam where consent stops being a database row and
 * starts governing what actually leaves: `optOutUrl` is only ever handed to the
 * shell for a reader we may market to, and the shell renders no promotional
 * strip without one. So the difference between a ticked and an unticked box is
 * enforced at the point of rendering rather than remembered by whoever writes
 * the next template.
 */
import { appBaseUrl } from '@/lib/notify'
import { deliverIfAutomatic, queueNotification } from '@/lib/notify/outbox'
import { optOutUrl } from '@/lib/notify/marketing'
import { marketingWelcome, stackEmail, type StackEmailContext } from '@/lib/notify/templates'
import { mayMarket, normaliseEmail } from './consent'

/**
 * The opt-out link, but only for someone we may market to.
 *
 * Null for everybody else, which is what suppresses the strip. Minting a link
 * for a reader who never opted in would be harmless in itself — but it would
 * put a promotion in front of them, which is the thing they declined.
 */
async function marketingLinkFor(email: string): Promise<string | null> {
  if (!(await mayMarket(email))) return null
  try {
    return await optOutUrl(appBaseUrl(), email)
  } catch (err) {
    // No link, no strip. The email itself is unaffected — see `marketing.ts`:
    // fail closed on the marketing, open on the message.
    console.error('[audience] could not mint an opt-out link:', err)
    return null
  }
}

export interface SendStackEmailInput extends Omit<StackEmailContext, 'quizUrl' | 'optedIn'> {
  email: string
  /** Set when the address belongs to an account, so the hub can show the email. */
  userId?: string | null
  quizUrl?: string
}

/**
 * Email somebody the stack they just built.
 *
 * Queued and delivered in one call because they are watching for it — see the
 * `SELF_SENDING` note. Returns whether it left, which the route logs but does
 * NOT pass to the browser: a mail provider having a bad afternoon is not
 * something the person who typed their address can act on, and telling them it
 * failed only invites them to submit again.
 */
export async function sendStackEmail(input: SendStackEmailInput): Promise<boolean> {
  const email = normaliseEmail(input.email)
  const base = appBaseUrl()

  try {
    const rendered = stackEmail(
      {
        firstName: input.firstName ?? null,
        stackName: input.stackName,
        items: input.items,
        monthly: input.monthly,
        oneOff: input.oneOff,
        quizUrl: input.quizUrl ?? `${base}/`,
        optedIn: await mayMarket(email),
      },
      { baseUrl: base, optOutUrl: await marketingLinkFor(email) },
    )

    const queued = await queueNotification({
      userId: input.userId ?? null,
      email,
      template: 'stack-email',
      // Never deduped against a previous send: asking twice must send twice, or
      // somebody who deleted the first one by accident can never get another.
      dedupeKey: `stack-email:${email}:${Date.now()}`,
      rendered,
    })

    const delivered = await deliverIfAutomatic(queued)
    return delivered.status === 'sent'
  } catch (err) {
    console.error('[audience] stack email could not be prepared:', err)
    return false
  }
}

/**
 * Confirm an opt-in, and offer the way straight back out.
 *
 * Only for a genuinely new opt-in — re-sending it to somebody already on the
 * list every time they take the quiz again is itself unwanted email. The caller
 * decides that; this function just sends.
 */
export async function sendMarketingWelcome(input: {
  email: string
  firstName?: string | null
  userId?: string | null
}): Promise<boolean> {
  // Queued even with no provider configured, like everything else here: in
  // manual mode the outbox IS the workflow, and a welcome that was never
  // written down is one a founder cannot send by hand later.
  const email = normaliseEmail(input.email)
  const base = appBaseUrl()

  try {
    const rendered = marketingWelcome(
      { firstName: input.firstName ?? null, quizUrl: `${base}/` },
      { baseUrl: base, optOutUrl: await marketingLinkFor(email) },
    )

    const queued = await queueNotification({
      userId: input.userId ?? null,
      email,
      template: 'marketing-welcome',
      // One per address, ever. The UNIQUE constraint on the key is what makes a
      // second opt-in silent rather than a second welcome.
      dedupeKey: `marketing-welcome:${email}`,
      rendered,
    })

    const delivered = await deliverIfAutomatic(queued)
    return delivered.status === 'sent'
  } catch (err) {
    console.error('[audience] welcome email could not be prepared:', err)
    return false
  }
}
