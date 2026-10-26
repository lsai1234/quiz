/**
 * Write the Amp Consult's review pack from the code.
 *
 *   npm run review-pack:consult            # write docs/consult-review-pack.csv
 *   npm run review-pack:consult -- --check # exit 1 if the committed file is stale
 *
 * Every piece of health-related wording and every safety rule, one row each,
 * with blank Approved / Change to / Notes columns for the reviewer. The
 * building is in src/lib/consult/review-pack.ts, so a test can check the
 * committed file without running this.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { buildReviewPack } from '../src/lib/consult/review-pack'

const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'docs/consult-review-pack.csv')

const built = buildReviewPack({
  engineSource: readFileSync(join(ROOT, 'src/lib/consult/engine.ts'), 'utf8'),
  rosterCsv: readFileSync(join(ROOT, 'docs/rosters/chrgd-roster.csv'), 'utf8'),
})

if (process.argv.includes('--check')) {
  let current = ''
  try { current = readFileSync(OUT, 'utf8') } catch { /* missing counts as stale */ }
  if (current !== built) {
    console.error(`stale: ${OUT} — run npm run review-pack:consult`)
    process.exit(1)
  }
  console.log('up to date')
} else {
  writeFileSync(OUT, built)
  console.log(`wrote ${OUT}`)
}
