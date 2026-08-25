import { parseRosterCsv, parseActives } from '@/lib/supplier/roster-csv'
import { rosterRowToProduct } from '@/lib/supplier/roster-import'
import type { SupplierProduct } from '@/lib/supplier/types'

const HEADER =
  'sku,brand,name,swapGroup,cost,rrp,servings,weightGrams,stock,formats,dietaryTags,' +
  'hasStimulants,contraindications,actives,subscriptionEligible,variantSkus,shortReason'

const row = (cells: string) => parseRosterCsv(`${HEADER}\n${cells}`)

describe('parseRosterCsv', () => {
  /**
   * The single most likely way a naive parser ruins this file: product names are
   * full of commas ("Ashwagandha, 300mg - 120 vcaps"), so a plain split turns
   * one product into two and shifts every column after it.
   */
  it('keeps a quoted product name containing commas in one piece', () => {
    const { rows } = row('P28352,Jarrow,"Ashwagandha, 300mg - 120 vcaps",adaptogen,14.53,24.14,120,100,10,capsule,vegan,False,pregnancy,ashwagandha 300mg,False,P28352,A note')

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Ashwagandha, 300mg - 120 vcaps')
    expect(rows[0].swapGroup).toBe('adaptogen')
    expect(rows[0].cost).toBe(14.53)
  })

  it('reads a semicolon file, which is what PowerBody export', () => {
    const { rows } = parseRosterCsv('sku;brand;name;swapGroup\nP1;PB;Whey;protein-whey')
    expect(rows[0]).toMatchObject({ sku: 'P1', brand: 'PB', swapGroup: 'protein-whey' })
  })

  /** A group the engine does know under another name is translated silently. */
  it('translates a spreadsheet spelling the engine knows under another name', () => {
    const { rows, warnings } = row('P1,B,Gainer,mass-gainer,10,20,13,2260,50,powder,,False,,protein 20g,True,P1,x')
    expect(rows[0].swapGroup).toBe('protein-mass')
    expect(warnings).toEqual([])
  })

  /**
   * A group with no equivalent is NOT bent into an adjacent one. Being wrong
   * about what a product is for is worse than admitting we do not know: the
   * engine would then recommend it to the wrong person with full confidence.
   */
  it('refuses to guess a swap group it does not recognise, and says so', () => {
    const { rows, warnings } = row('P48000,NOW,Turmeric,joint-support,16.24,26.97,30,130,10,capsule,vegan,False,pregnancy,curcumin 500mg,True,P48000,x')

    expect(rows[0].swapGroup).toBe('general')
    expect(rows[0].unrecognisedSwapGroup).toBe('joint-support')
    expect(warnings[0]).toContain('joint-support')
    expect(warnings[0]).toContain('no targeted scoring')
  })

  it('maps safety text onto the two flags the quiz actually gates on', () => {
    const { rows } = row('P1,B,N,adaptogen,1,2,30,10,5,capsule,,False,"pregnancy, thyroid medication",x 1mg,True,P1,y')
    expect(rows[0].contraindications.sort()).toEqual(['medication', 'pregnancy'])
  })

  /** A real contraindication the quiz has no question for must not vanish. */
  it('keeps a safety note it cannot gate on, rather than dropping it', () => {
    const { rows, warnings } = row('P1,B,N,omega-3,1,2,30,10,5,capsule,,False,shellfish allergy,krill 1180mg,True,P1,y')

    expect(rows[0].contraindications).toEqual([])
    expect(rows[0].otherWarnings).toEqual(['shellfish allergy'])
    expect(warnings.some((w) => w.includes('shellfish'))).toBe(true)
  })

  it('flags a row whose own SKU is missing from its variant list', () => {
    // The real roster had exactly this: P3071 listing P30711, a different product.
    const { warnings } = row('P3071,DB,Enzymes,probiotic,18.4,30.56,90,80,10,capsule,vegan,False,,blend,False,P30711,x')
    expect(warnings[0]).toContain('typo')
  })

  it('keeps only the first of a duplicated SKU, and says it did', () => {
    const { rows, warnings } = parseRosterCsv(`${HEADER}\nP1,B,First,adaptogen,1,2,30,1,1,capsule,,False,,a 1mg,True,P1,x\nP1,B,Second,adaptogen,1,2,30,1,1,capsule,,False,,a 1mg,True,P1,x`)

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('First')
    expect(warnings[0]).toContain('more than once')
  })

  it('says plainly when there is no sku column to work from', () => {
    const { rows, warnings } = parseRosterCsv('name,brand\nWhey,PB')
    expect(rows).toEqual([])
    expect(warnings[0]).toContain('sku')
  })
})

describe('parseActives', () => {
  it('reads a dose the cap rules can compare', () => {
    expect(parseActives('ashwagandha 300mg')).toEqual([{ name: 'ashwagandha', mg: 300 }])
  })

  it('normalises grams and micrograms to mg', () => {
    expect(parseActives('creatine 5g')).toEqual([{ name: 'creatine', mg: 5000 }])
    expect(parseActives('vitamin d3 100mcg')).toEqual([{ name: 'vitamin d3', mg: 0.1 }])
  })

  /**
   * IU and "billion CFU" are different scales entirely. Carrying the number
   * unlabelled would let the dose caps compare 4000 IU against a milligram
   * ceiling — a wrong comparison made with confidence.
   */
  it('carries a dose it cannot convert without inventing a milligram figure', () => {
    expect(parseActives('vitamin D3 4000IU')).toEqual([{ name: 'vitamin d3' }])
    expect(parseActives('probiotic 20bn CFU')[0].mg).toBeUndefined()
  })

  it('splits several actives', () => {
    expect(parseActives('sodium 300mg, potassium 200mg')).toHaveLength(2)
  })
})

const SUPPLIER: SupplierProduct = {
  sku: 'P1', productId: '1001', name: 'Real Whey 1kg', brand: 'PB', category: 'Protein',
  description: 'A real description.', imageUrl: 'https://img/whey.jpg', wholesalePrice: 12,
  rrp: 30, currency: 'GBP', stock: 42, inStock: true, barcode: null, flavours: [],
  servings: 30, weightGrams: 1000, vatRate: null, detailed: true, updatedAt: 'now',
}

describe('rosterRowToProduct', () => {
  const base = row('P1,Brand,Sheet Name,protein-whey,20,40,28,1000,5,powder,,False,,whey 25g,True,P1,Reason').rows[0]

  /** The whole point of looking each row up: the description and the money come
   *  from PowerBody, because a spreadsheet snapshot cannot be either. */
  it('takes picture, description, category and live cost from the supplier', () => {
    const { product, enriched, notes } = rosterRowToProduct(base, SUPPLIER)

    expect(enriched).toBe(true)
    expect(product.imageUrl).toBe('https://img/whey.jpg')
    expect(product.description).toBe('A real description.')
    expect(product.category).toBe('Protein')
    expect(product.cost).toBe(12)
    expect(product.variants[0].inventory).toBe(42)
    expect(notes).toEqual([])
  })

  /** The roster owns meaning: getProductInfo cannot say what a product is for. */
  it('takes swap group, actives and servings from the roster, not the supplier', () => {
    const { product } = rosterRowToProduct(base, SUPPLIER)

    expect(product.swapGroup).toBe('protein-whey')
    // 25g of protein normalised to milligrams, which is the scale the dose caps use.
    expect(product.actives).toEqual([{ name: 'whey', mg: 25_000 }])
    expect(product.servings).toBe(28)
  })

  /**
   * A SKU the supplier cannot answer for still imports. It is orderable either
   * way — createOrder takes a SKU and we already send product_id empty — so the
   * only loss is the picture, and that is a review-screen problem.
   */
  it('still builds a product with no supplier, and names what is missing', () => {
    const { product, enriched, notes } = rosterRowToProduct(base, null)

    expect(enriched).toBe(false)
    expect(product.variants[0].sku).toBe('P1')
    expect(product.cost).toBe(20)
    expect(notes.some((n) => n.includes('No picture'))).toBe(true)
    expect(notes.some((n) => n.includes('spreadsheet, not live'))).toBe(true)
  })

  it('warns when servings put it beyond a month on subscription', () => {
    const long = row('P2,B,Big Tub,creatine,10,20,90,300,10,powder,,False,,creatine 5g,True,P2,x').rows[0]
    const { notes } = rosterRowToProduct(long, null)
    expect(notes.some((n) => n.includes('map a monthly refill'))).toBe(true)
  })

  it('merges flavour SKUs into one product, each keeping its own code', () => {
    const many = row('P3,B,Whey,protein-whey,10,20,30,900,10,powder,,False,,whey 24g,True,"P3,P4,P5",x').rows[0]
    const { product, notes } = rosterRowToProduct(many, null)

    expect(product.variants.map((v) => v.sku)).toEqual(['P3', 'P4', 'P5'])
    // Sizes must not be merged — a variant carries no cost, servings or weight.
    expect(notes.some((n) => n.includes('different size'))).toBe(true)
  })

  it('carries an ungateable safety note into the customer-facing warnings', () => {
    const shellfish = row('P6,B,Krill,omega-3,10,20,30,79,10,capsule,,False,shellfish allergy,krill 1180mg,True,P6,x').rows[0]
    const { product } = rosterRowToProduct(shellfish, null)
    expect(product.warnings).toContain('shellfish allergy')
  })
})
