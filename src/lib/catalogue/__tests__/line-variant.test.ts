import { labelsOf, rememberRenames, rememberWhere, variantForLine, type LineRef } from '../line-variant'
import { mergeInto } from '../merge'
import { splitOut } from '../split'
import { MOCK_CATALOGUE } from '../mock-catalogue'
import type { CatalogueProduct, CatalogueVariant } from '../types'

/**
 * Which SKU a saved line means.
 *
 * Subscription and basket lines store a product id and the flavour LABEL the
 * member saw. Matching used to compare one spelling ("Chocolate") while lines
 * were written with another ("Chocolate · 1kg"), so a product with both a flavour
 * and a size never matched and every renewal shipped the first flavour in stock.
 * A rename, split or merge broke the match the same way. These pin each way a
 * line has to be found again.
 */

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** A PowerBody tub built on the sample whey: one SKU per flavour, all 1kg. */
function isoXp(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  const base = clone(MOCK_CATALOGUE[0])
  const sku = (v: Partial<CatalogueVariant>): CatalogueVariant => ({ ...base.variants[0], inventory: 20, ...v }) as CatalogueVariant
  return {
    ...base,
    id: 'applied-iso-xp',
    handle: 'applied-iso-xp',
    title: 'Applied Nutrition ISO-XP',
    brand: 'Applied Nutrition',
    cost: 18.2,
    servings: 33,
    variants: [
      // Strawberry first on purpose: "the first one in stock" is never the answer
      // these tests want, so a fallback can't pass by accident.
      sku({ id: 'iso-straw-1kg', title: 'Strawberry / 1kg', flavour: 'Strawberry', size: '1kg', sku: 'AN-ISO-STRAW-1KG' }),
      sku({ id: 'iso-choc-1kg', title: 'Chocolate / 1kg', flavour: 'Chocolate', size: '1kg', sku: 'AN-ISO-CHOC-1KG' }),
      sku({ id: 'iso-van-1kg', title: 'Vanilla / 1kg', flavour: 'Vanilla', size: '1kg', sku: 'AN-ISO-VAN-1KG' }),
      sku({ id: 'iso-choc-2kg', title: 'Chocolate / 2kg', flavour: 'Chocolate', size: '2kg', sku: 'AN-ISO-CHOC-2KG', price: 59.99 }),
    ],
    defaultVariantId: 'iso-straw-1kg',
    ...over,
  }
}

const line = (over: Partial<LineRef>): LineRef => ({ productId: 'applied-iso-xp', variantTitle: '', ...over })
const pick = (found: ReturnType<typeof variantForLine>) => (found ? `${found.product.id}/${found.variant.id}` : null)

describe('labelsOf — every way a SKU has been written on a line', () => {
  it('has the flavour, the "flavour · size" a line is written with, and the title', () => {
    expect(labelsOf({ flavour: 'Chocolate', size: '1kg', title: 'Chocolate / 1kg' })).toEqual([
      'Chocolate',
      'Chocolate · 1kg',
      'Chocolate / 1kg',
    ])
  })

  it('leads with the size when there is no flavour', () => {
    expect(labelsOf({ flavour: null, size: '90 softgels', title: '90 Softgels' })).toEqual(['90 softgels', '90 Softgels'])
  })

  it('never repeats a spelling', () => {
    expect(labelsOf({ flavour: 'Vanilla', size: null, title: 'Vanilla' })).toEqual(['Vanilla'])
  })

  it('falls back to the title and never offers an empty label', () => {
    expect(labelsOf({ flavour: null, size: null, title: 'Default' })).toEqual(['Default'])
    expect(labelsOf({ flavour: '', size: '', title: 'Unflavoured' })).toEqual(['Unflavoured'])
  })
})

describe('rememberWhere — the note a moved or renamed SKU leaves', () => {
  const choc = isoXp().variants[1]

  it('records the product it was on and every spelling of its label there', () => {
    const moved = rememberWhere(choc, 'applied-iso-xp')
    expect(moved.formerly).toEqual([
      { productId: 'applied-iso-xp', labels: ['Chocolate', 'Chocolate · 1kg', 'Chocolate / 1kg'] },
    ])
  })

  it('records the labels it had BEFORE when told them (a rename)', () => {
    const renamed = { ...choc, title: 'Chocolate Fudge', flavour: 'Chocolate Fudge' }
    const noted = rememberWhere(renamed, 'applied-iso-xp', choc)
    expect(noted.formerly?.[0].labels).toEqual(['Chocolate', 'Chocolate · 1kg', 'Chocolate / 1kg'])
    // …and the variant keeps its new name.
    expect(noted.title).toBe('Chocolate Fudge')
  })

  it('keeps earlier notes about other products', () => {
    const once = rememberWhere(choc, 'applied-iso-xp-old')
    const twice = rememberWhere(once, 'applied-iso-xp')
    expect(twice.formerly?.map((f) => f.productId)).toEqual(['applied-iso-xp-old', 'applied-iso-xp'])
  })

  it('adds new spellings to the note it already has for that product rather than writing a second one', () => {
    const first = rememberWhere(choc, 'applied-iso-xp')
    const renamed = { ...first, title: 'Choc', flavour: 'Choc' }
    const second = rememberWhere(renamed, 'applied-iso-xp')
    expect(second.formerly).toHaveLength(1)
    expect(second.formerly?.[0].labels).toEqual(['Chocolate', 'Chocolate · 1kg', 'Chocolate / 1kg', 'Choc', 'Choc · 1kg'])
  })

  it('hands back the same variant when the note already says everything', () => {
    const first = rememberWhere(choc, 'applied-iso-xp')
    expect(rememberWhere(first, 'applied-iso-xp')).toBe(first)
  })

  it('never changes the variant it was given', () => {
    const before = clone(choc)
    rememberWhere(choc, 'applied-iso-xp')
    expect(choc).toEqual(before)
    expect(choc.formerly).toBeUndefined()
  })
})

describe('rememberRenames — a renamed flavour keeps its old name on file', () => {
  it('notes the old labels on a SKU whose label changed, under this product', () => {
    const before = isoXp()
    const after = { ...before, variants: before.variants.map((v) => (v.id === 'iso-choc-1kg' ? { ...v, title: 'Chocolate Fudge', flavour: 'Chocolate Fudge' } : v)) }
    const out = rememberRenames(before, after)
    const choc = out.variants.find((v) => v.id === 'iso-choc-1kg')!
    expect(choc.formerly).toEqual([{ productId: 'applied-iso-xp', labels: ['Chocolate', 'Chocolate · 1kg', 'Chocolate / 1kg'] }])
    // Only the renamed SKU carries a note.
    expect(out.variants.filter((v) => v.formerly).map((v) => v.id)).toEqual(['iso-choc-1kg'])
  })

  it('returns the very same product when no label changed', () => {
    const before = isoXp()
    const after = { ...before, variants: before.variants.map((v) => ({ ...v, price: v.price + 1, inventory: 0 })) }
    expect(rememberRenames(before, after)).toBe(after)
  })

  it('says nothing when every old spelling is still one of the new ones', () => {
    const before = isoXp()
    // Adding a size where there was none keeps "Chocolate" as a spelling.
    const b = { ...before, variants: [{ ...before.variants[1], size: null, title: 'Chocolate' }] }
    const a = { ...b, variants: [{ ...b.variants[0], size: '1kg', title: 'Chocolate' }] }
    expect(rememberRenames(b, a)).toBe(a)
  })

  it('leaves a SKU that is new in this version alone', () => {
    const before = isoXp()
    const extra = { ...before.variants[2], id: 'iso-cookies-1kg', title: 'Cookies', flavour: 'Cookies', sku: 'AN-ISO-COOK-1KG' }
    const after = { ...before, variants: [...before.variants, extra] }
    expect(rememberRenames(before, after)).toBe(after)
  })

  it('remembers both names after two renames', () => {
    const v0 = isoXp()
    const v1 = rememberRenames(v0, { ...v0, variants: v0.variants.map((v) => (v.id === 'iso-van-1kg' ? { ...v, title: 'Vanilla Ice Cream', flavour: 'Vanilla Ice Cream' } : v)) })
    const v2 = rememberRenames(v1, { ...v1, variants: v1.variants.map((v) => (v.id === 'iso-van-1kg' ? { ...v, title: 'French Vanilla', flavour: 'French Vanilla' } : v)) })
    const van = v2.variants.find((v) => v.id === 'iso-van-1kg')!
    expect(van.formerly).toHaveLength(1)
    expect(van.formerly?.[0].labels).toEqual(expect.arrayContaining(['Vanilla · 1kg', 'Vanilla Ice Cream · 1kg']))
    expect(pick(variantForLine(line({ variantTitle: 'Vanilla · 1kg' }), [v2]))).toBe('applied-iso-xp/iso-van-1kg')
    expect(pick(variantForLine(line({ variantTitle: 'Vanilla Ice Cream' }), [v2]))).toBe('applied-iso-xp/iso-van-1kg')
  })
})

describe('variantForLine — the SKU a saved line means', () => {
  describe('by SKU, when the line kept it', () => {
    it('takes the SKU over anything the label says', () => {
      const found = variantForLine(line({ sku: 'AN-ISO-CHOC-2KG', variantTitle: 'Vanilla · 1kg' }), [isoXp()])
      expect(pick(found)).toBe('applied-iso-xp/iso-choc-2kg')
    })

    it('follows the SKU onto whichever product sells it now', () => {
      const parent = isoXp()
      const elsewhere = { ...isoXp({ id: 'applied-iso-xp-2kg', title: 'Applied Nutrition ISO-XP 2kg' }), variants: [parent.variants[3]] }
      const kept = { ...parent, variants: parent.variants.slice(0, 3) }
      const found = variantForLine(line({ sku: 'AN-ISO-CHOC-2KG' }), [kept, elsewhere])
      expect(pick(found)).toBe('applied-iso-xp-2kg/iso-choc-2kg')
    })

    it('prefers the line’s own product when the SKU is on more than one', () => {
      const copy = isoXp({ id: 'applied-iso-xp-copy' })
      const found = variantForLine(line({ sku: 'AN-ISO-VAN-1KG' }), [copy, isoXp()])
      expect(pick(found)).toBe('applied-iso-xp/iso-van-1kg')
    })

    it('falls back to the label when nothing sells that SKU any more', () => {
      const found = variantForLine(line({ sku: 'AN-ISO-GONE', variantTitle: 'Vanilla · 1kg' }), [isoXp()])
      expect(pick(found)).toBe('applied-iso-xp/iso-van-1kg')
    })
  })

  describe('by variant id', () => {
    it('takes the variant id over the label', () => {
      const found = variantForLine(line({ variantId: 'iso-van-1kg', variantTitle: 'Chocolate · 1kg' }), [isoXp()])
      expect(pick(found)).toBe('applied-iso-xp/iso-van-1kg')
    })

    it('ignores a variant id the product no longer has and reads the label', () => {
      const found = variantForLine(line({ variantId: 'iso-gone', variantTitle: 'Chocolate · 1kg' }), [isoXp()])
      expect(pick(found)).toBe('applied-iso-xp/iso-choc-1kg')
    })
  })

  describe('by every spelling of the label', () => {
    it.each([
      ['Chocolate', 'iso-choc-1kg'],
      ['Chocolate · 1kg', 'iso-choc-1kg'],
      ['Chocolate / 1kg', 'iso-choc-1kg'],
      ['Chocolate · 2kg', 'iso-choc-2kg'],
      ['Chocolate / 2kg', 'iso-choc-2kg'],
      ['Vanilla', 'iso-van-1kg'],
      ['Vanilla · 1kg', 'iso-van-1kg'],
      ['  Vanilla · 1kg  ', 'iso-van-1kg'],
    ])('“%s” ships %s', (label, variantId) => {
      expect(pick(variantForLine(line({ variantTitle: label }), [isoXp()]))).toBe(`applied-iso-xp/${variantId}`)
    })

    it('ships the flavour a "flavour · size" line names, not the first one in stock (the renewal bug)', () => {
      // Strawberry is first and in stock; the member chose chocolate.
      const found = variantForLine(line({ variantTitle: 'Chocolate · 1kg' }), [isoXp()])
      expect(found?.variant.sku).toBe('AN-ISO-CHOC-1KG')
    })
  })

  describe('via the note a moved or renamed SKU left', () => {
    it('finds a flavour by its old name after a rename on the same product', () => {
      const before = isoXp()
      const after = rememberRenames(before, {
        ...before,
        variants: before.variants.map((v) => (v.id === 'iso-choc-1kg' ? { ...v, title: 'Chocolate Fudge / 1kg', flavour: 'Chocolate Fudge' } : v)),
      })
      expect(pick(variantForLine(line({ variantTitle: 'Chocolate · 1kg' }), [after]))).toBe('applied-iso-xp/iso-choc-1kg')
      expect(pick(variantForLine(line({ variantTitle: 'Chocolate' }), [after]))).toBe('applied-iso-xp/iso-choc-1kg')
    })

    it('follows a flavour split onto a product of its own', () => {
      const split = splitOut(isoXp(), ['iso-choc-2kg'], { id: 'applied-iso-xp-2kg' })!
      const catalogue = [split.kept, split.moved]
      expect(pick(variantForLine(line({ variantTitle: 'Chocolate · 2kg' }), catalogue))).toBe('applied-iso-xp-2kg/iso-choc-2kg')
      // The flavours that stayed are still found where they were.
      expect(pick(variantForLine(line({ variantTitle: 'Chocolate · 1kg' }), catalogue))).toBe('applied-iso-xp/iso-choc-1kg')
    })

    it('follows a flavour merged into another product after its own product is gone', () => {
      const vanillaTub: CatalogueProduct = {
        ...isoXp({ id: 'applied-iso-xp-vanilla', title: 'Applied Nutrition ISO-XP Vanilla' }),
        variants: [{ ...isoXp().variants[2], id: 'iso-xp-vanilla', sku: 'AN-ISO-VAN-1KG' }],
      }
      const chocolateTub: CatalogueProduct = {
        ...isoXp({ id: 'applied-iso-xp-chocolate', title: 'Applied Nutrition ISO-XP Chocolate', defaultVariantId: 'iso-xp-chocolate' }),
        variants: [{ ...isoXp().variants[1], id: 'iso-xp-chocolate', sku: 'AN-ISO-CHOC-1KG' }],
      }
      const merged = mergeInto(chocolateTub, [vanillaTub])
      // The vanilla product is off sale now, so it is not in the catalogue.
      const found = variantForLine({ productId: 'applied-iso-xp-vanilla', variantTitle: 'Vanilla · 1kg' }, [merged])
      expect(found?.product.id).toBe('applied-iso-xp-chocolate')
      expect(found?.variant.sku).toBe('AN-ISO-VAN-1KG')
    })

    it('follows a note to a product that is gone even when the line had no label', () => {
      const moved = { ...isoXp({ id: 'applied-iso-xp-new' }), variants: isoXp().variants.map((v) => rememberWhere(v, 'applied-iso-xp-retired')) }
      const found = variantForLine({ productId: 'applied-iso-xp-retired', variantTitle: '' }, [moved])
      expect(found?.product.id).toBe('applied-iso-xp-new')
    })

    it('does not follow a note about a different product that happens to share the label', () => {
      const other = { ...isoXp({ id: 'other-whey' }), variants: [rememberWhere(isoXp().variants[2], 'some-other-product')] }
      const found = variantForLine(line({ variantTitle: 'Vanilla · 1kg' }), [other])
      expect(found).toBeNull()
    })

    it('keeps a line with no label on its own product after a sibling SKU was split off', () => {
      // A member subscribed to the product itself (no flavour chosen). Splitting
      // the 2kg tub off must not move their renewal onto the 2kg tub: the
      // product they bought still exists and still sells what it sold.
      const split = splitOut(isoXp(), ['iso-choc-2kg'], { id: 'applied-iso-xp-2kg' })!
      const found = variantForLine(line({ variantTitle: '' }), [split.kept, split.moved])
      expect(found?.product.id).toBe('applied-iso-xp')
      expect(found?.variant.id).toBe('iso-straw-1kg')
    })
  })

  describe('when nothing places the line', () => {
    it('ships something buyable from the line’s product', () => {
      const product = isoXp()
      product.variants[0] = { ...product.variants[0], available: false }
      const found = variantForLine(line({ variantTitle: 'Cookies & Cream' }), [product])
      expect(pick(found)).toBe('applied-iso-xp/iso-choc-1kg')
    })

    it('ships the first SKU when none is in stock', () => {
      const product = isoXp()
      product.variants = product.variants.map((v) => ({ ...v, available: false }))
      expect(pick(variantForLine(line({ variantTitle: 'Cookies & Cream' }), [product]))).toBe('applied-iso-xp/iso-straw-1kg')
    })

    it('is null for a product that is gone and left no note', () => {
      expect(variantForLine(line({ productId: 'nowhere', variantTitle: 'Vanilla' }), [isoXp()])).toBeNull()
    })

    it('is null for a product with no SKUs at all', () => {
      expect(variantForLine(line({}), [{ ...isoXp(), variants: [] }])).toBeNull()
    })
  })
})
