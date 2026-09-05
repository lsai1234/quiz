import fs from 'fs'
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
    // Price columns are deliberately not read — see roster-csv's header note.
    expect(rows[0]).not.toHaveProperty('cost')
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
    const { rows, warnings } = row('P1,B,Nootropic,brain-boost,10,20,30,100,10,capsule,,False,,x 1mg,True,P1,y')

    expect(rows[0].swapGroup).toBe('general')
    expect(rows[0].unrecognisedSwapGroup).toBe('brain-boost')
    expect(warnings[0]).toContain('brain-boost')
    expect(warnings[0]).toContain('no targeted scoring')
  })

  it('maps safety text onto the flags the quiz actually gates on', () => {
    const { rows } = row('P1,B,N,adaptogen,1,2,30,10,5,capsule,,False,"pregnancy, thyroid medication",x 1mg,True,P1,y')
    expect(rows[0].contraindications.sort()).toEqual(['medication', 'pregnancy'])
  })

  /** Shellfish is a real flag now, with a real question on the safety screen —
   *  krill oil and shellfish-derived glucosamine are both in the range. */
  it('gates a shellfish allergy rather than filing it as a note', () => {
    const { rows, warnings } = row('P1,B,N,omega-3,1,2,30,10,5,capsule,,False,shellfish allergy,krill 1180mg,True,P1,y')

    expect(rows[0].contraindications).toEqual(['shellfish'])
    expect(rows[0].otherWarnings).toEqual([])
    expect(warnings.some((w) => w.includes('shellfish'))).toBe(false)
  })

  /** Anything the engine still has no flag for must not vanish silently. */
  it('keeps a safety note it cannot gate on, rather than dropping it', () => {
    const { rows, warnings } = row('P1,B,N,omega-3,1,2,30,10,5,capsule,,False,avoid under 18s,krill 1180mg,True,P1,y')

    expect(rows[0].contraindications).toEqual([])
    expect(rows[0].otherWarnings).toEqual(['avoid under 18s'])
    expect(warnings.some((w) => w.includes('under 18s'))).toBe(true)
  })

  /** joint-support is a real group now: glucosamine/MSM/turmeric products
   *  exist for joints and nothing else, and the engine can score them. */
  it('accepts joint-support as a real swap group', () => {
    const { rows, warnings } = row('P48000,NOW,Turmeric,joint-support,16.24,26.97,30,130,10,capsule,vegan,False,pregnancy,curcumin 500mg,True,P48000,x')

    expect(rows[0].swapGroup).toBe('joint-support')
    expect(rows[0].unrecognisedSwapGroup).toBeNull()
    expect(warnings).toEqual([])
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
    // Unpriced on purpose: cost is the supplier's to give, and an unpriced
    // product sits under the quiz's floor so a guess can never reach a customer.
    expect(product.cost).toBe(0)
    expect(product.basePrice).toBe(0)
    expect(notes.some((n) => n.includes('No picture'))).toBe(true)
    expect(notes.some((n) => n.includes('no price yet'))).toBe(true)
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
    const note = row('P6,B,Krill,omega-3,10,20,30,79,10,capsule,,False,avoid under 18s,krill 1180mg,True,P6,x').rows[0]
    const { product } = rosterRowToProduct(note, null)
    expect(product.warnings).toContain('avoid under 18s')
  })

  it('carries a shellfish allergy as a contraindication the engine can gate on', () => {
    const krill = row('P6,B,Krill,omega-3,10,20,30,79,10,capsule,,False,shellfish allergy,krill 1180mg,True,P6,x').rows[0]
    const { product } = rosterRowToProduct(krill, null)
    expect(product.contraindications).toEqual(['shellfish'])
  })
})

describe('the CHRGD roster file', () => {
  const csv = fs.readFileSync('docs/rosters/chrgd-roster.csv', 'utf8')

  it('classifies every product — none fall through to "general"', () => {
    // A product left in `general` gets no swap alternatives and no targeted
    // scoring: it is invisible to the quiz's affinity pass. Seven of the
    // founder's top-25 picks used to land there because the engine had no
    // group for a protein bar, a nootropic, a B-complex, ZMA or an energy gel.
    const { rows } = parseRosterCsv(csv)

    expect(rows).toHaveLength(48)
    expect(rows.filter((r) => r.swapGroup === 'general')).toEqual([])
    expect(rows.filter((r) => r.unrecognisedSwapGroup !== null)).toEqual([])
  })

  it('reads every flavour, not just the row', () => {
    const { rows } = parseRosterCsv(csv)
    const total = rows.reduce((n, r) => n + r.variantSkus.length, 0)

    // 48 products, 101 orderable codes between them.
    expect(total).toBe(101)
    expect(rows.every((r) => r.variantSkus.includes(r.sku))).toBe(true)
  })

  it('keeps the doses, despite the sheet writing them "22g/serving"', () => {
    // The number is the useful part and the basis is implied. Without trimming
    // it, every dose in the file parses as one nameless blob and the dedup and
    // cap rules have nothing to compare.
    const { rows } = parseRosterCsv(csv)
    const whey = rows.find((r) => r.sku === 'P41624')

    expect(whey?.actives).toEqual([{ name: 'whey protein', mg: 22000 }])
  })

  it('never silently drops a safety note it has no flag for', () => {
    // "kidney disease" and "fish allergy" have no quiz question to gate on.
    // Dropping them is the worst possible handling of a safety field, so they
    // survive as warnings the customer still sees.
    const { rows } = parseRosterCsv(csv)
    const withNotes = rows.filter((r) => r.otherWarnings.length > 0)

    expect(withNotes.length).toBeGreaterThan(0)
    expect(rows.find((r) => r.sku === 'P47127')?.otherWarnings).toContain('fish allergy')
  })
})

const BASE_ROW = row('P1,Brand,Sheet Name,protein-whey,20,40,28,1000,5,powder,,False,,whey 25g,True,P1,Reason').rows[0]

describe('the top-25 rank', () => {
  it('becomes a recommendation priority instead of being thrown away', () => {
    // The rank IS the founder saying which products the quiz should reach for
    // first. Importing every one at a flat 5 discards that judgement entirely,
    // and the ranking then exists only in the spreadsheet.
    const row = { ...BASE_ROW, top25Rank: 1, recommendationPriority: null }
    const top = rosterRowToProduct(row, null).product
    const mid = rosterRowToProduct({ ...row, top25Rank: 25 }, null).product
    const unranked = rosterRowToProduct({ ...row, top25Rank: null }, null).product

    expect(top.recommendationPriority).toBe(10)
    expect(mid.recommendationPriority).toBeGreaterThan(unranked.recommendationPriority)
    expect(unranked.recommendationPriority).toBe(5)
  })

  it('lets an explicit priority win over the rank', () => {
    const row = { ...BASE_ROW, top25Rank: 1, recommendationPriority: 3 }
    expect(rosterRowToProduct(row, null).product.recommendationPriority).toBe(3)
  })
})

describe('per-flavour stock', () => {
  it('marks a sold-out flavour unavailable without touching the others', () => {
    // Each flavour is its own SKU at PowerBody with its own stock. Inheriting
    // the parent's availability is how a customer picks Chocolate, we take the
    // order, and there is none.
    const row = { ...BASE_ROW, sku: 'P1', variantSkus: ['P1', 'P2', 'P3'] }
    const facts = new Map([['P1', { qty: 9 }], ['P2', { qty: 0 }], ['P3', { qty: 4 }]])

    const { product } = rosterRowToProduct(row, null, facts)

    expect(product.variants.map((v) => v.available)).toEqual([true, false, true])
    expect(product.variants.map((v) => v.inventory)).toEqual([9, 0, 4])
  })

  it('says which flavours it could not check rather than calling them sold out', () => {
    // An unknown flavour showing as out of stock hides a product we can
    // probably sell, which is the worse of the two mistakes at import time.
    const row = { ...BASE_ROW, sku: 'P1', variantSkus: ['P1', 'P2'] }
    const { notes } = rosterRowToProduct(row, null, new Map([['P1', { qty: 9 }]]))

    expect(notes.some((n) => n.includes('1 of 2 flavours are not in the crawled product list'))).toBe(true)
  })
})

/**
 * Flavour NAMES, which is a different lookup from flavour stock.
 *
 * Import resolved every flavour's stock through the feed index but only ever
 * fetched the DETAIL for a row's main SKU — and the name lives on the detail
 * call. So a six-flavour product went live with one real name and five raw
 * codes in its picker: "P45757" where "Orange" belongs.
 */
describe('per-flavour names', () => {
  const gel = (f: string) => `Endurance Breathe Isotonic Energy Gel, ${f} - 20 x 60g`

  it('labels each flavour by what makes it different from its siblings', () => {
    const row = { ...BASE_ROW, sku: 'P1', name: gel('Blackcurrant'), variantSkus: ['P1', 'P2', 'P3'] }
    const facts = new Map([
      ['P1', { qty: 5, name: gel('Blackcurrant') }],
      ['P2', { qty: 5, name: gel('Orange') }],
      ['P3', { qty: 5, name: gel('Lemon') }],
    ])

    const { product } = rosterRowToProduct(row, null, facts)

    expect(product.variants.map((v) => v.title)).toEqual(['Blackcurrant', 'Orange', 'Lemon'])
    expect(product.variants.map((v) => v.flavour)).toEqual(['Blackcurrant', 'Orange', 'Lemon'])
  })

  /* The exact regression: everything but the first flavour was its own code. */
  it('no longer titles the other flavours with their SKU codes', () => {
    const row = { ...BASE_ROW, sku: 'P1', name: gel('Blackcurrant'), variantSkus: ['P1', 'P2', 'P3'] }
    const facts = new Map([
      ['P1', { qty: 5, name: gel('Blackcurrant') }],
      ['P2', { qty: 5, name: gel('Orange') }],
      ['P3', { qty: 5, name: gel('Lemon') }],
    ])

    const { product } = rosterRowToProduct(row, null, facts)

    expect(product.variants.map((v) => v.title)).not.toContain('P2')
    expect(product.variants.map((v) => v.title)).not.toContain('P3')
  })

  it('falls back to the code, and says so, when PowerBody has no name', () => {
    const row = { ...BASE_ROW, sku: 'P1', name: gel('Blackcurrant'), variantSkus: ['P1', 'P2'] }
    const facts = new Map([
      ['P1', { qty: 5, name: gel('Blackcurrant') }],
      ['P2', { qty: 5 }],
    ])

    const { product, notes } = rosterRowToProduct(row, null, facts)

    expect(product.variants[1].title).toBe('P2')
    expect(product.variants[1].flavour).toBeNull()
    expect(notes.some((n) => n.includes('showing their code'))).toBe(true)
  })

  it('leaves a single-variant product without a flavour at all', () => {
    // Nothing distinguishes it, so there is no flavour to name.
    const { product } = rosterRowToProduct({ ...BASE_ROW, sku: 'P1', variantSkus: ['P1'] }, SUPPLIER)

    expect(product.variants).toHaveLength(1)
    expect(product.variants[0].flavour).toBeNull()
    expect(product.variants[0].title).toBe(SUPPLIER.name)
  })
})
