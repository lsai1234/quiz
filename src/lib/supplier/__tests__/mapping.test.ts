import { supplierProductToCatalogue, classifySupplierProduct } from '@/lib/supplier/mapping'
import { POWERBODY_FIXTURES } from '@/lib/supplier/powerbody/fixtures'
import type { SupplierProduct } from '@/lib/supplier/types'
import { anchoredListPrice } from '@/lib/pricing/anchor'

const bySku = (sku: string): SupplierProduct => POWERBODY_FIXTURES.find((p) => p.sku === sku)!

describe('supplier → catalogue mapping', () => {
  it('maps commerce fields: RRP is the sell price, wholesale is the cost', () => {
    const sp = bySku('ON-GOLD-WHEY-2270')
    const cp = supplierProductToCatalogue(sp)
    // The list price is ANCHORED above the supplier's RRP, not taken raw — the
    // bundle discount is measured against it, and the RRP becomes the was-price.
    expect(cp.basePrice).toBe(anchoredListPrice(sp.rrp))
    expect(cp.basePrice).toBeGreaterThan(sp.rrp)
    expect(cp.compareAtPrice).toBe(sp.rrp)
    expect(cp.cost).toBe(sp.wholesalePrice)
    expect(cp.title).toBe(sp.name)
    expect(cp.shopifyProductId).toBeNull()
  })

  it('creates one variant per flavour, each carrying the supplier SKU + stock', () => {
    const sp = bySku('ON-GOLD-WHEY-2270') // 3 flavours
    const cp = supplierProductToCatalogue(sp)
    expect(cp.variants).toHaveLength(3)
    expect(cp.variants.every((v) => v.sku === sp.sku)).toBe(true)
    expect(cp.variants.every((v) => v.inventory === sp.stock)).toBe(true)
    expect(cp.variants.every((v) => v.price === sp.rrp)).toBe(true)
  })

  it('makes a single variant for products without flavours', () => {
    const cp = supplierProductToCatalogue(bySku('ON-CREA-634'))
    expect(cp.variants).toHaveLength(1)
    expect(cp.variants[0].flavour).toBeNull()
  })

  it('classifies by category/keyword into the right slot + swap group', () => {
    expect(supplierProductToCatalogue(bySku('ON-CREA-634')).swapGroup).toBe('creatine')
    expect(supplierProductToCatalogue(bySku('ON-CREA-634')).stackSlots).toContain('performance')
    expect(supplierProductToCatalogue(bySku('NOW-OMEGA-200')).swapGroup).toBe('omega-3')
    expect(supplierProductToCatalogue(bySku('VEG-PLANT-1000')).stackSlots).toContain('vegan-support')
    expect(supplierProductToCatalogue(bySku('WAR-CLEAR-500')).swapGroup).toBe('protein-clear')
  })

  it('flags stimulant pre-workouts and not the stim-free ones', () => {
    expect(classifySupplierProduct(bySku('APP-ABE-315')).hasStimulants).toBe(true)
    expect(classifySupplierProduct(bySku('PBD-PUMP-400')).hasStimulants).toBe(false)
    expect(supplierProductToCatalogue(bySku('APP-ABE-315')).warnings).toContain('Contains caffeine')
  })

  it('marks ready-to-drink products as liquids', () => {
    const cp = supplierProductToCatalogue(bySku('GRE-CARB-KILLA-12'))
    expect(cp.formats).toEqual(['liquid'])
    expect(classifySupplierProduct(bySku('GRE-CARB-KILLA-12')).isReadyToDrink).toBe(true)
  })

  it('produces a stable, slugified id from the product name', () => {
    const cp = supplierProductToCatalogue(bySku('APP-ISO-XP-1000'))
    expect(cp.id).toBe('iso-xp-whey-isolate-1kg')
    expect(cp.handle).toBe(cp.id)
  })

  it('seeds Pour Plan rhythm tags + a default flavour (autopopulate)', () => {
    // Electrolytes → an as-needed drink driven by the sweat trigger.
    const elec = supplierProductToCatalogue(bySku('SIS-HYDRO-20'))
    expect(elec.consumption?.cadence).toBe('as-needed')
    expect(elec.consumption?.asNeededTrigger).toBe('sweat')
    expect(elec.consumption?.anchor).toBe('hot-days')
    expect(elec.defaultVariantId).toBe(elec.variants[0].id)

    // A daily anchor keeps its cadence + gets a morning anchor.
    const omega = supplierProductToCatalogue(bySku('NOW-OMEGA-200'))
    expect(omega.consumption?.cadence).toBe('daily')
    expect(omega.consumption?.anchor).toBe('morning')

    // Greens are a "most days" daily drink.
    const greens = supplierProductToCatalogue(bySku('BUL-GREENS-500'))
    expect(greens.consumption?.daysPerWeek).toBe(4)
  })
})
