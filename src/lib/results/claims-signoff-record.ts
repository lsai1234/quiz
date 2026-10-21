/**
 * The claims sign-off on record.
 *
 * The person who signs off claims approved the two sheets
 * `npm run claims:signoff` writes (docs/claims-signoff.csv and
 * docs/claims-signoff-no-claim.csv) on the date below. Each sheet is recorded
 * by the SHA-256 of the file exactly as written, byte-order mark included.
 *
 * The sheets are built from the claims register (consult/claims.ts), the
 * goal-to-claim map (goal-claims.ts) and the roster, so a change to any of
 * them changes a sheet, and the sign-off test then fails. That is the gate:
 * merging puts claims live, so nothing new goes live unsigned. To change any
 * of them, regenerate the sheets, have them signed off, and only then record
 * the new date and hashes here (the script prints them).
 */
export interface ClaimsSignoffRecord {
  /** The day the sheets were signed off, YYYY-MM-DD. */
  date: string
  claimsSha256: string
  noClaimSha256: string
}

export const CLAIMS_SIGNOFF: ClaimsSignoffRecord = {
  date: '2026-10-21',
  claimsSha256: '48c6fcaaf1512f432b49e788791e01a5b110fe31bc00970decca44ac6d054fcd',
  noClaimSha256: '2af410b22892b85e77cc03dc42ad22803f9322c4ea43ce18b5899bf06fc9b5e8',
}
