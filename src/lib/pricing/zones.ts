/**
 * UK delivery zones, and where PowerBody will not go.
 *
 * WHY THIS IS POSTCODE-LEVEL
 * ──────────────────────────
 * The margin model used to assume a fixed 4% of orders go to the Highlands,
 * because it had nothing better. But every real order carries a delivery
 * address, and PowerBody publish the exact postcode list — so for an actual
 * order there is no need to guess at all. Guessing is for pricing a product
 * nobody has bought yet; once someone has, we know.
 *
 * TWO SEPARATE QUESTIONS
 * ──────────────────────
 *   1. Which zone is it? — decides what PowerBody charge us (Zone 2 costs more).
 *   2. Will they ship there at all? — a different question with a worse answer.
 *
 * The dropshipping guide is explicit that a UK account ships UK-only, and NOT to
 * Northern Ireland, Guernsey or Jersey. Those are all inside "the UK" as a
 * customer understands it and all sit in PowerBody's own Zone 2, so an order to
 * Belfast looks perfectly normal right up until the supplier refuses it. Catching
 * that in the review queue — before we take the money's worth of a promise we
 * can't keep — is the whole point of this file.
 *
 * Sources: powerbody.com/delivery.html (zone postcode list) and the PowerBody
 * Dropshipping Guide, June 2026 (the exclusions).
 */

export type UkZone = 'uk-1' | 'uk-2'

export interface ZoneResult {
  /** The zone, or null when the address can't be served at all. */
  zone: UkZone | null
  /** True when PowerBody will not dropship here whatever we pay. */
  excluded: boolean
  /** Why, in a sentence a founder can act on. */
  reason: string | null
  /** The normalised outward code we matched on, for display. */
  outward: string | null
}

/**
 * Zone 2 — the Highlands, Islands and offshore. Prefix rules first, then the
 * ones that only apply to a numbered range, because `PA20-49` is Zone 2 but
 * `PA1` (Paisley) is Zone 1 and a plain prefix match would get that wrong.
 */
const ZONE_2_PREFIXES = ['AB', 'BT', 'GY', 'HS', 'IM', 'IV', 'JE', 'KW', 'ZE']

const ZONE_2_RANGES: { prefix: string; from: number; to: number }[] = [
  { prefix: 'KA', from: 27, to: 28 },
  { prefix: 'PA', from: 20, to: 49 },
  { prefix: 'PA', from: 60, to: 78 },
  { prefix: 'PH', from: 17, to: 26 },
  { prefix: 'PH', from: 30, to: 44 },
  { prefix: 'PH', from: 49, to: 50 },
  { prefix: 'TR', from: 21, to: 25 },
]

/**
 * Postcode areas a UK dropshipping account cannot serve, whatever the zone.
 *
 * All three are ordinary-looking UK addresses, which is exactly why they need
 * naming: nothing about "BT1 5GS" warns you that the supplier will refuse it.
 */
const EXCLUDED: { prefix: string; place: string }[] = [
  { prefix: 'BT', place: 'Northern Ireland' },
  { prefix: 'GY', place: 'Guernsey' },
  { prefix: 'JE', place: 'Jersey' },
]

/**
 * Strip spaces/case and take the outward code — the part before the space.
 *
 * Matched on the inward code's shape (digit, letter, letter) rather than by
 * chopping three characters off the end, because a bare outward code like
 * "PA49" has no inward part to remove and chopping would leave "P" — which
 * would put half of Scotland in the wrong zone.
 */
export function outwardCode(postcode: string): string | null {
  const cleaned = postcode.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (cleaned.length < 2) return null
  const full = cleaned.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/)
  return full ? full[1] : cleaned
}

/** The letter prefix and numeric district of an outward code, e.g. PA49 → PA, 49. */
function split(outward: string): { prefix: string; district: number | null } {
  const match = outward.match(/^([A-Z]{1,2})(\d{1,2})?/)
  if (!match) return { prefix: outward, district: null }
  return { prefix: match[1], district: match[2] != null ? parseInt(match[2], 10) : null }
}

/**
 * Which zone a UK postcode falls in, and whether we can ship there at all.
 *
 * An unrecognised or malformed postcode returns Zone 1 rather than refusing:
 * the overwhelming majority of UK addresses are Zone 1, and treating a typo as
 * undeliverable would block real orders. It is reported as unmatched so the
 * caller can say the zone was assumed.
 */
export function zoneForPostcode(postcode: string | null | undefined): ZoneResult {
  if (!postcode?.trim()) {
    return { zone: 'uk-1', excluded: false, reason: null, outward: null }
  }

  const outward = outwardCode(postcode)
  if (!outward) return { zone: 'uk-1', excluded: false, reason: null, outward: null }

  const { prefix, district } = split(outward)

  const blocked = EXCLUDED.find((e) => e.prefix === prefix)
  if (blocked) {
    return {
      zone: null,
      excluded: true,
      outward,
      reason: `PowerBody do not dropship to ${blocked.place} (${blocked.prefix} postcodes)`,
    }
  }

  if (ZONE_2_PREFIXES.includes(prefix)) {
    return { zone: 'uk-2', excluded: false, reason: null, outward }
  }

  if (district != null && ZONE_2_RANGES.some((r) => r.prefix === prefix && district >= r.from && district <= r.to)) {
    return { zone: 'uk-2', excluded: false, reason: null, outward }
  }

  return { zone: 'uk-1', excluded: false, reason: null, outward }
}

/** Country codes a UK dropshipping account can serve. */
const UK_COUNTRY_CODES = new Set(['GB', 'UK', 'GBR', 'ENGLAND', 'SCOTLAND', 'WALES', 'UNITED KINGDOM'])

/**
 * Whether an address can be dropshipped at all.
 *
 * A UK account ships from the UK warehouse to the UK only — an EU address is
 * not a more expensive delivery, it is an impossible one, and the order will sit
 * in the queue forever unless somebody notices.
 */
export function deliverability(address: { postcode?: string | null; country?: string | null } | null | undefined): ZoneResult {
  if (!address) {
    return { zone: 'uk-1', excluded: true, reason: 'No delivery address on the order', outward: null }
  }

  const country = (address.country ?? '').trim().toUpperCase()
  if (country && !UK_COUNTRY_CODES.has(country)) {
    return {
      zone: null,
      excluded: true,
      outward: null,
      reason: `A UK dropshipping account ships to the UK only — this order is going to ${address.country}`,
    }
  }

  return zoneForPostcode(address.postcode)
}
