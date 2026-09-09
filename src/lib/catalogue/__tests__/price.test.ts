import { clearVariantPrice, costFor, priceRows, rulePriceFor, setVariantPrice } from '../price'
import type { CatalogueProduct, CatalogueVariant } from '../types'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 21.99, compareAtPrice: null, available: true, ...over }
}

function product(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'glycine', title: 'Glycine', handle: 'glycine', description: '', imageUrl: null,
    category: 'Amino Acids', stackSlots: ['recovery'], goals: ['recovery'], dietaryTags: [],
    formats: ['capsule'],
    variants: [
      variant({ id: 'caps', sku: 'P100', price: 21.99, cost: 11.12 }),
      variant({ id: 'powder', sku: 'P200', price: 39.99, cost: 20.04 }),
    ],
    defaultVariantId: 'caps',
    basePrice: 21.99, compareAtPrice: null, servings: 33, subscriptionEligible: true,
    swapGroup: 'aminos', recommendationPriority: 5, marginPriority: 5, isCoreEligible: true,
    isBoosterEligible: false, hasStimulants: false, shortReason: '', warnings: [], ...over,
  }
}

/** The rule in force, so the expectations below are not a second copy of it. */
const MARKUP = getPricingConfig().listPricing.markupOnCost

describe('what a SKU costs us', () => {
  it('reads the SKU\'s own cost, and falls back to the product\'s', () => {
    const p = product({
      cost: 9,
      variants: [variant({ id: 'caps', cost: 11.12 }), variant({ id: 'powder' })],
    })

    expect(costFor(p, p.variants[0])).toBe(11.12)
    expect(costFor(p, p.variants[1])).toBe(9)
  })

  it('treats a missing or zero cost as not knowing, rather than as free', () => {
    const p = product({ cost: undefined, variants: [variant({ cost: 0 })] })

    expect(costFor(p, p.variants[0])).toBeNull()
    // And so there is no rule price — inventing one from the shelf price would
    // be circular, and quoting £0.00 would be a lie about the margin.
    expect(rulePriceFor(p, p.variants[0])).toBeNull()
  })
})

describe('the rule price', () => {
  it('is the markup on what the supplier charges, rounded down to .99', () => {
    const p = product()
    expect(rulePriceFor(p, p.variants[0])).toBe(Math.floor(11.12 * MARKUP) - 0.01)
    expect(rulePriceFor(p, p.variants[1])).toBe(Math.floor(20.04 * MARKUP) - 0.01)
  })
})

describe('the rows a founder decides from', () => {
  it('puts the three prices beside each other and names the master', () => {
    const [caps, powder] = priceRows(product({ supplierRrp: 15.5 }))

    expect(caps).toMatchObject({
      variantId: 'caps', label: 'P100', price: 21.99, cost: 11.12, rulePrice: 21.99, rrp: 15.5,
      manual: false, isMaster: true, belowCost: false,
    })
    expect(powder.isMaster).toBe(false)
  })

  it('quotes the supplier\'s RRP and never our own was-price as theirs', () => {
    /*
      Two different claims wearing the same shape: `supplierRrp` is what
      PowerBody say the product is worth, and `compareAtPrice` is the "was" the
      card draws — which on a product nobody imported is a figure of ours.
      Calling the second "their RRP" puts words in their mouth on exactly the
      screen where a price is being decided.
    */
    const [row] = priceRows(product({
      supplierRrp: null,
      variants: [variant({ id: 'caps', sku: 'P100', price: 21.99, cost: 11.12, compareAtPrice: 29.99 })],
    }))

    expect(row.rrp).toBeNull()
    expect(row.wasPrice).toBe(29.99)
  })

  it('leaves the was-price out when the shop is not drawing one', () => {
    // The shop refuses to show a "was" that is not above the price, so quoting
    // one here would describe a saving nobody is being offered.
    const [row] = priceRows(product({
      variants: [variant({ id: 'caps', price: 21.99, compareAtPrice: 19.99 })],
    }))
    expect(row.wasPrice).toBeNull()
  })

  it('labels a SKU-less variant by its name rather than leaving the row blank', () => {
    const rows = priceRows(product({ variants: [variant({ id: 'only', title: 'Unflavoured / 500g' })] }))
    expect(rows[0].label).toBe('Unflavoured / 500g')
  })

  it('says when the shelf price does not cover what we pay', () => {
    const rows = priceRows(product({
      variants: [variant({ id: 'caps', sku: 'P100', price: 9.99, cost: 11.12 })],
    }))
    expect(rows[0].belowCost).toBe(true)
  })

  it('follows the master to a sellable SKU when the stored one has sold out', () => {
    // The product quotes what a customer can actually buy, so that is the row
    // the panel marks — see `masterVariant`.
    const rows = priceRows(product({
      variants: [
        variant({ id: 'caps', sku: 'P100', available: false }),
        variant({ id: 'powder', sku: 'P200' }),
      ],
    }))
    expect(rows.map((r) => r.isMaster)).toEqual([false, true])
  })
})

describe('setting a price by hand', () => {
  it('records that a founder chose it, which is what a pull reads', () => {
    const next = setVariantPrice(product(), 'caps', 18.5)!

    expect(next.variants[0].price).toBe(18.5)
    expect(next.variants[0].priceSource).toBe('founder')
    expect(next.variants[1]).toEqual(product().variants[1])
  })

  it('moves the product\'s price with the master, and only with the master', () => {
    expect(setVariantPrice(product(), 'caps', 18.5)!.basePrice).toBe(18.5)
    // A flavour nobody opens on must not reprice the card.
    expect(setVariantPrice(product(), 'powder', 44)!.basePrice).toBe(21.99)
  })

  it('rounds to the penny and refuses a price that is not one', () => {
    expect(setVariantPrice(product(), 'caps', 18.499)!.variants[0].price).toBe(18.5)
    expect(setVariantPrice(product(), 'caps', 0)).toBeNull()
    expect(setVariantPrice(product(), 'caps', -5)).toBeNull()
    expect(setVariantPrice(product(), 'nosuch', 18)).toBeNull()
  })

  it('is not a no-op when the price is already that, but the rule set it', () => {
    // Pressing Set on the price the rule computed is a founder claiming it:
    // saying nothing changed would leave the next pull free to move it.
    const claimed = setVariantPrice(product(), 'caps', 21.99)!
    expect(claimed.variants[0].priceSource).toBe('founder')

    // Pressing it a second time genuinely changes nothing.
    expect(setVariantPrice(claimed, 'caps', 21.99)).toBeNull()
  })
})

describe('going back to the rule', () => {
  it('re-computes the price from the supplier cost and drops the founder\'s mark', () => {
    const priced = setVariantPrice(product(), 'caps', 18.5)!
    const back = clearVariantPrice(priced, 'caps')!

    expect(back.variants[0].price).toBe(21.99)
    expect(back.variants[0].priceSource).toBe('rule')
    expect(back.basePrice).toBe(21.99)
  })

  it('refuses when nothing knows the cost, rather than leaving a price with no owner', () => {
    const uncosted = product({ cost: undefined, variants: [variant({ id: 'caps', sku: 'P100' })] })
    const priced = setVariantPrice(uncosted, 'caps', 18.5)!

    expect(clearVariantPrice(priced, 'caps')).toBeNull()
    expect(clearVariantPrice(uncosted, 'nosuch')).toBeNull()
  })
})
