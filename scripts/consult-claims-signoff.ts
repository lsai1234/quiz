/**
 * Write the consult claims sign-off sheet and the reasons report (plan Phase 5).
 *
 *   npm run claims:signoff:consult            # write both
 *   npm run claims:signoff:consult -- --check # exit 1 if either is stale
 *
 * The needs and patterns map (src/lib/results/consult-claims.ts) is not live
 * until its sheet is signed off and recorded in CONSULT_CLAIMS_SIGNOFF.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { consultSignoffCsv, consultSignoffStatus, reasonChangesReport } from '../src/lib/results/consult-claims-signoff'

const ROOT = join(__dirname, '..')
const OUT = { sheet: join(ROOT, 'docs/consult-claims-signoff.csv'), report: join(ROOT, 'docs/consult-reason-changes.md') }
const built = { sheet: consultSignoffCsv(), report: reasonChangesReport() }
const check = process.argv.includes('--check')

let stale = 0
for (const key of ['sheet', 'report'] as const) {
  if (check) {
    let current = ''
    try { current = readFileSync(OUT[key], 'utf8') } catch { /* missing counts as stale */ }
    if (current !== built[key]) { stale++; console.error(`stale: ${OUT[key]}`) }
  } else {
    writeFileSync(OUT[key], built[key])
    console.log(`wrote ${OUT[key]}`)
  }
}
if (stale) {
  console.error('Run `npm run claims:signoff:consult` and commit the result.')
  process.exit(1)
}
const status = consultSignoffStatus(built.sheet)
console.log(
  status.signed
    ? 'consult claims map: signed off, live'
    : `consult claims map: NOT signed off, so not live. Once signed off, record in consult-claims.ts:\n  CONSULT_CLAIMS_SIGNOFF = { date: 'YYYY-MM-DD', sha256: '${status.sha256}' }`,
)
