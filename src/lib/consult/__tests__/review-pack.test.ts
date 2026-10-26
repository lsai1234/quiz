/**
 * @jest-environment node
 */
/**
 * The review pack is the code's own wording, so it has to stay in step with
 * it: change a reason, a pattern line or a claim and the committed sheet is
 * stale until `npm run review-pack:consult` is run and the change reviewed.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildReviewPack, reviewPackRows } from '../review-pack'
import { PATTERNS } from '../pinpoint/library'
import { CLAIMS_BY_KIND } from '../claims'
import { STOP_COPY } from '../circuit'
import { PHARMACIST_NOTE } from '../pharmacist-note'

const ROOT = process.cwd()
const input = {
  engineSource: readFileSync(join(ROOT, 'src/lib/consult/engine.ts'), 'utf8'),
  rosterCsv: readFileSync(join(ROOT, 'docs/rosters/chrgd-roster.csv'), 'utf8'),
}

it('matches the committed docs/consult-review-pack.csv', () => {
  expect(readFileSync(join(ROOT, 'docs/consult-review-pack.csv'), 'utf8')).toBe(buildReviewPack(input))
})

it('lists everything the plan names', () => {
  const rows = reviewPackRows(input)
  const wording = new Set(rows.map((r) => r[2]))
  for (const p of PATTERNS) for (const w of [p.name, p.line, p.because]) expect(wording).toContain(w)
  for (const s of Object.values(STOP_COPY)) for (const w of [s.title, s.body, s.who]) expect(wording).toContain(w)
  for (const w of Object.values(PHARMACIST_NOTE)) expect(wording).toContain(w)
  const claimRows = rows.filter((r) => r[0] === 'Claims')
  expect(claimRows).toHaveLength(Object.values(CLAIMS_BY_KIND).flat().length)
  for (const section of ['Circuit check: items', 'Circuit check: outcomes', 'Circuit check: keep-out reasons', 'Weight loss: rules', 'Creatine for older adults', 'Engine reasons', 'Glossary']) {
    expect(rows.some((r) => r[0] === section)).toBe(true)
  }
  // The engine's inline reasons are read from its source, not copied.
  expect(wording).toContain('Vitamin D needs rise with age')
  expect(wording).toContain('To keep your fluids and salts up when you feel queasy')
})
