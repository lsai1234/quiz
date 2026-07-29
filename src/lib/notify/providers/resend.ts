/**
 * Resend adapter — the live email provider.
 *
 * Uses the REST API directly rather than the SDK: one POST, no dependency, and
 * nothing to keep in step at upgrade time. Swapping to Postmark or SES means one
 * file with the same three-line shape.
 *
 * Throws on failure. That's deliberate — the outbox catches it, records the
 * reason on the row and leaves the notification retryable, which is far better
 * than a silent success that nobody ever sees.
 */
import { fromAddress } from '../index'
import type { NotificationProvider, RenderedEmail, SendResult } from '../types'

const DEFAULT_ENDPOINT = 'https://api.resend.com/emails'

/**
 * Overridable so the integration can be pointed at a stub — verifying the Send
 * button end to end shouldn't mean emailing real people, and a self-hosted relay
 * is a legitimate thing to want anyway.
 */
function endpoint(): string {
  return process.env.RESEND_API_URL || DEFAULT_ENDPOINT
}

export function createResendProvider(): NotificationProvider {
  return {
    name: 'resend',
    async send(to: string, email: RenderedEmail): Promise<SendResult> {
      const res = await fetch(endpoint(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: [to],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      })

      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`Resend rejected the send (${res.status}): ${detail.slice(0, 200)}`)
      }

      const body = (await res.json().catch(() => ({}))) as { id?: string }
      return { providerId: body.id }
    },
  }
}
