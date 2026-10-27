/**
 * The consult claims map's sheet and the reasons report are committed as the
 * code writes them, and the map backs nothing until a sign-off is recorded
 * for exactly that sheet.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { consultSignoffCsv, consultSignoffStatus, reasonChangesReport } from '../consult-claims-signoff'
import { CONSULT_CLAIMS_SIGNOFF, consultClaimsLive, needClaimFor, patternClaimFor } from '../consult-claims'

const ROOT = join(__dirname, '../../../..')

it('matches the committed sheet and report (npm run claims:signoff:consult)', () => {
  expect(readFileSync(join(ROOT, 'docs/consult-claims-signoff.csv'), 'utf8')).toBe(consultSignoffCsv())
  expect(readFileSync(join(ROOT, 'docs/consult-reason-changes.md'), 'utf8')).toBe(reasonChangesReport())
})

it('is live only when the recorded sign-off is this exact sheet', () => {
  const status = consultSignoffStatus()
  expect(consultClaimsLive()).toBe(CONSULT_CLAIMS_SIGNOFF !== null)
  if (CONSULT_CLAIMS_SIGNOFF) expect(status.signed).toBe(true)
})

it('backs nothing while not live, and the right claims once it is', () => {
  const vitD = MOCK_CATALOGUE.find((p) => p.swapGroup === 'vitamin-d')!
  expect(patternClaimFor('indoor', vitD, false)).toBeNull()
  expect(patternClaimFor('indoor', vitD, true)?.id).toMatch(/^vitd-/)
  const magnesium = MOCK_CATALOGUE.find((p) => p.swapGroup === 'magnesium')!
  expect(needClaimFor('energy', magnesium, true)?.id).toBe('magnesium-tiredness')
  // A supplement shouldn't paper over these.
  expect(patternClaimFor('wired', magnesium, true)).toBeNull()
  expect(needClaimFor('sleep', magnesium, true)).toBeNull()
})
