import { encodeSharePayload } from './codec'
import type { ShareCardPayload } from './types'
import type { ShareFormat } from './format'

/**
 * The URLs the share sheet needs.
 *
 * Browser-safe: nothing here reads a file or touches `next/og`. The card is
 * fetched from the same image route the styleguide uses, with the payload
 * encoded into the query string — the stateless path from §3.5 of the blueprint,
 * which is what Phase 2 has before Phase 3 adds the `share_cards` table and the
 * ten-character token.
 *
 * When Phase 3 lands, `cardImageUrl` takes a token instead and everything above
 * it in the share sheet is unchanged. That is the point of putting the URLs here
 * rather than building them at the call site.
 */

/** The PNG. */
export function cardImageUrl(payload: ShareCardPayload, format: ShareFormat): string {
  return `/api/share/image?format=${format}&d=${encodeSharePayload(payload)}`
}

function origin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'https://getchrgd.co.uk'
}

/**
 * The short link — what a card is actually addressed by.
 *
 * `/s/AB12CD7X9K`, ten readable characters, which is what makes it postable in a
 * bio and typeable off a screenshot.
 */
export function shortShareUrl(token: string): string {
  return new URL(`/s/${token}`, origin()).toString()
}

/**
 * The long link, used when there is no database to mint a token against.
 *
 * Mock mode, local dev, a preview deploy with no `DATABASE_URL` — the payload
 * rides in the URL instead. Ugly, uncountable, and identical in every other
 * respect. See §3.5: the feature must not need Postgres to be demoable.
 *
 * Absolute either way, because it goes into a share sheet and a clipboard, and a
 * relative URL pasted into WhatsApp is not a link.
 */
export function cardShareUrl(payload: ShareCardPayload): string {
  const url = new URL('/', origin())
  url.searchParams.set('d', encodeSharePayload(payload))
  if (payload.code) url.searchParams.set('ref', payload.code)
  return url.toString()
}

/**
 * Mint a short link, falling back to the long one.
 *
 * Never throws and never blocks the share: a database that is down, slow or
 * absent costs the customer a tidy URL, not the ability to post their card.
 */
export async function mintShareUrl(payload: ShareCardPayload): Promise<{
  url: string
  short: boolean
}> {
  try {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ d: encodeSharePayload(payload) }),
    })
    if (res.ok) {
      const { token } = (await res.json()) as { token?: string }
      if (token) return { url: shortShareUrl(token), short: true }
    }
  } catch {
    // Fall through — the long link works.
  }
  return { url: cardShareUrl(payload), short: false }
}

/** The file name someone ends up with in their camera roll or downloads. */
export function cardFileName(payload: ShareCardPayload, format: ShareFormat): string {
  const slug = payload.stackName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'stack'
  return `chrgd-${slug}-${format}.png`
}

/**
 * The text offered alongside the image.
 *
 * Deliberately short and claim-free. It is a caption suggestion, not a claim
 * about supplements — see §6.1 — and most share targets truncate anything longer
 * than a line anyway.
 */
export function cardShareText(payload: ShareCardPayload): string {
  return `My CHRGD stack: ${payload.stackName}.`
}
