import { autopopulateProduct, claimSafeReason, isClaimSafe } from '@/lib/supplier/autopopulate'
import { supplierProductToCatalogue } from '@/lib/supplier/mapping'
import { POWERBODY_FIXTURES } from '@/lib/supplier/powerbody/fixtures'
import { APPROVED_CLAIMS } from '@/lib/stack-blueprint/approved-claims'
import type { SupplierProduct } from '@/lib/supplier/types'

const bySku = (sku: string): SupplierProduct => POWERBODY_FIXTURES.find((p) => p.sku === sku)!

describe('claim-safety gate', () => {
  it('accepts an approved claim for the swap group', () => {
    const approved = APPROVED_CLAIMS.creatine[0]
    expect(isClaimSafe(approved, 'creatine')).toBe(true)
  })

  it('rejects an unapproved health claim', () => {
    expect(isClaimSafe('Cures colds and builds 10kg of muscle overnight.', 'creatine')).toBe(false)
  })

  it('treats empty copy as safe', () => {
    expect(isClaimSafe('', 'general')).toBe(true)
  })

  it('claimSafeReason falls back to an approved phrase when the candidate is unsafe', () => {
    const reason = claimSafeReason('creatine', 'Doubles your bench in a week.')
    expect(isClaimSafe(reason, 'creatine')).toBe(true)
    expect(reason).not.toMatch(/doubles your bench/i)
  })

  it('keeps a safe candidate as-is', () => {
    const candidate = APPROVED_CLAIMS.creatine[0]
    expect(claimSafeReason('creatine', candidate)).toBe(candidate)
  })
})

describe('autopopulate (mock / heuristic — no OPENAI_API_KEY)', () => {
  it('fills a claim-safe shortReason, effect onset and stimulant warning', async () => {
    const creatine = supplierProductToCatalogue(bySku('ON-CREA-634'))
    creatine.shortReason = '' // as freshly mapped
    const { patch, source } = await autopopulateProduct(creatine)
    expect(source).toBe('heuristic')
    expect(patch.shortReason && patch.shortReason.length).toBeGreaterThan(0)
    expect(isClaimSafe(patch.shortReason!, 'creatine')).toBe(true)
    expect(patch.effectOnset).toBeDefined()
  })

  it('adds a caffeine warning for stimulant pre-workouts', async () => {
    const abe = supplierProductToCatalogue(bySku('APP-ABE-315'))
    const { patch } = await autopopulateProduct(abe)
    expect(patch.warnings).toContain('Contains caffeine')
  })

  it('never clobbers a founder-written shortReason', async () => {
    const p = supplierProductToCatalogue(bySku('NOW-OMEGA-200'))
    p.shortReason = 'Our hand-written reason.'
    const { patch } = await autopopulateProduct(p)
    expect(patch.shortReason).toBe('Our hand-written reason.')
  })
})
