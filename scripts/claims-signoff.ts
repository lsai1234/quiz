/**
 * Write the claims sign-off sheets from the code and the roster.
 *
 *   npm run claims:signoff            # write docs/claims-signoff*.csv
 *   npm run claims:signoff -- --check # exit 1 if the committed files are stale,
 *                                     # or not the ones signed off
 *
 * The sheets list every authorised claim (src/lib/consult/claims.ts), the
 * roster products it would be shown for (docs/rosters/chrgd-roster.csv) and
 * the goals the goal-to-claim map pairs with it (src/lib/results/goal-claims.ts).
 * The building is in src/lib/results/claims-signoff.ts, so a test can check
 * the committed files without running this.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { buildClaimsSignoff, signoffStatus } from '../src/lib/results/claims-signoff'

const ROOT = join(__dirname, '..')
const ROSTER = join(ROOT, 'docs/rosters/chrgd-roster.csv')
const OUT = {
  claims: join(ROOT, 'docs/claims-signoff.csv'),
  noClaim: join(ROOT, 'docs/claims-signoff-no-claim.csv'),
}

const check = process.argv.includes('--check')
const built = buildClaimsSignoff(readFileSync(ROSTER, 'utf8'))
// Only the warnings that change which claims a product gets.
for (const w of built.warnings) if (w.includes('swap group')) console.warn(`roster: ${w}`)

let stale = 0
for (const key of ['claims', 'noClaim'] as const) {
  const path = OUT[key]
  if (check) {
    let current = ''
    try { current = readFileSync(path, 'utf8') } catch { /* missing counts as stale */ }
    if (current !== built[key]) { stale++; console.error(`stale: ${path}`) }
  } else {
    writeFileSync(path, built[key])
    console.log(`wrote ${path}`)
  }
}
if (stale > 0) {
  console.error('Run `npm run claims:signoff` and commit the result.')
  process.exit(1)
}

// Merging puts claims live, so a sheet nobody has signed off is a failure.
const status = signoffStatus(built)
if (status.signed) {
  console.log(`signed off ${status.record.date}`)
} else {
  console.error(
    `NOT SIGNED OFF: these sheets differ from the ones signed off on ${status.record.date}.\n` +
    'Have the new sheets signed off, then record them in src/lib/results/claims-signoff-record.ts:\n' +
    `  claimsSha256: '${status.claimsSha256}'\n  noClaimSha256: '${status.noClaimSha256}'`,
  )
  if (check) process.exit(1)
}
