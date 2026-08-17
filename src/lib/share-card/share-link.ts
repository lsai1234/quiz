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

/**
 * The link that gets pasted.
 *
 * Absolute, because it goes into a share sheet and a clipboard — a relative URL
 * pasted into WhatsApp is not a link. Falls back to the production origin when
 * there is no `window`, so a server render never emits a broken one.
 */
export function cardShareUrl(payload: ShareCardPayload): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://getchrgd.co.uk'
  const url = new URL('/', origin)
  url.searchParams.set('d', encodeSharePayload(payload))
  if (payload.code) url.searchParams.set('ref', payload.code)
  return url.toString()
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
  return payload.drinksMode
    ? `My CHRGD LQD package: ${payload.stackName}.`
    : `My CHRGD stack: ${payload.stackName}.`
}
