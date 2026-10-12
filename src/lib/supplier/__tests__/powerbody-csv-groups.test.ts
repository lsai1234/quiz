import { groupCsvRows, groupMatches, nameWithoutFlavour, parsePowerBodyCsv, type PowerBodyCsvRow } from '../powerbody-csv'

/**
 * Turning eight thousand export lines into products a founder can pick from:
 * the flavour comes out of the name, the size stays in it.
 */

function row(sku: string, name: string, over: Partial<PowerBodyCsvRow> = {}): PowerBodyCsvRow {
  return { sku, brand: 'Kevin Levrone', name, flavour: null, qty: '50+', imageUrl: null, ...over }
}

describe('nameWithoutFlavour', () => {
  it('takes the flavour out of "<Product>, <Flavour> - <size>" and keeps the size', () => {
    expect(nameWithoutFlavour('Creatine HCl, Fruit Punch - 75g')).toEqual({ base: 'Creatine HCl - 75g', label: 'Fruit Punch' })
  })

  it('reads the name even when the flavour column is blank — the usual case', () => {
    expect(nameWithoutFlavour('Creatine HCl, Fruit Punch - 75g', null)).toEqual({ base: 'Creatine HCl - 75g', label: 'Fruit Punch' })
    expect(nameWithoutFlavour('  Creatine HCl,  Fruit Punch - 75g ', '')).toEqual({ base: 'Creatine HCl - 75g', label: 'Fruit Punch' })
  })

  it('handles a hyphenated flavour and a hyphenated product name', () => {
    expect(nameWithoutFlavour('Gold Whey, Choc-Mint - 2kg')).toEqual({ base: 'Gold Whey - 2kg', label: 'Choc-Mint' })
    expect(nameWithoutFlavour('Pre-Workout, Blue Raspberry - 300g')).toEqual({ base: 'Pre-Workout - 300g', label: 'Blue Raspberry' })
  })

  it('takes a name with a comma but no size apart the same way', () => {
    expect(nameWithoutFlavour('Glycine, Pure Powder')).toEqual({ base: 'Glycine', label: 'Pure Powder' })
  })

  it('uses the flavour column on a name with no comma, cutting it out wherever it sits', () => {
    expect(nameWithoutFlavour('Critical Whey Chocolate 2kg', 'Chocolate')).toEqual({ base: 'Critical Whey 2kg', label: 'Chocolate' })
    expect(nameWithoutFlavour('Critical Whey 2kg chocolate', 'Chocolate')).toEqual({ base: 'Critical Whey 2kg', label: 'Chocolate' })
  })

  it('treats a flavour with regex characters literally', () => {
    expect(nameWithoutFlavour('Iso Whey Cookies (New) 1kg', 'Cookies (New)')).toEqual({ base: 'Iso Whey 1kg', label: 'Cookies (New)' })
  })

  it('leaves a name with no comma and no flavour it carries whole', () => {
    expect(nameWithoutFlavour('Shaker 700ml')).toEqual({ base: 'Shaker 700ml', label: 'Shaker 700ml' })
    expect(nameWithoutFlavour('Shaker 700ml', 'Black')).toEqual({ base: 'Shaker 700ml', label: 'Black' })
  })
})

describe('groupCsvRows', () => {
  it('gathers the flavours of one product, and keeps its sizes apart', () => {
    const groups = groupCsvRows([
      row('P1', 'Creatine HCl, Fruit Punch - 75g'),
      row('P2', 'Creatine HCl, Lemon - 75g', { flavour: 'Lemon' }),
      row('P3', 'Creatine HCl, Fruit Punch - 300g'),
    ])

    expect(groups.map((g) => [g.title, g.rows.map((r) => [r.sku, r.label])])).toEqual([
      ['Creatine HCl - 75g', [['P1', 'Fruit Punch'], ['P2', 'Lemon']]],
      ['Creatine HCl - 300g', [['P3', 'Fruit Punch']]],
    ])
    expect(groups[0]).toMatchObject({ key: 'kevin levrone|creatine hcl - 75g', brand: 'Kevin Levrone' })
  })

  it('keeps two brands’ products of the same name apart', () => {
    const groups = groupCsvRows([
      row('P1', 'Creatine HCl, Lemon - 75g'),
      row('P2', 'Creatine HCl, Lemon - 75g', { brand: 'Olimp' }),
    ])
    expect(groups).toHaveLength(2)
  })

  it('groups regardless of case, keeping the first row’s spelling as the title', () => {
    const groups = groupCsvRows([
      row('P1', 'Creatine HCl, Lemon - 75g'),
      row('P2', 'CREATINE HCL, Cola - 75G', { brand: 'KEVIN LEVRONE' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].title).toBe('Creatine HCl - 75g')
    expect(groups[0].rows.map((r) => r.label)).toEqual(['Lemon', 'Cola'])
  })

  it('works on rows straight from the export', () => {
    const csv = [
      'sku;manufacturer_name;name;qty;flavour;weight;img_url;retail_price;',
      'P44338;Applied Nutrition;Critical Whey, Chocolate - 2kg;50+; ;2.1;https://img/1.jpg;49.99;',
      'P44339;Applied Nutrition;Critical Whey, Vanilla - 2kg;12;Vanilla;2.1;https://img/2.jpg;49.99;',
    ].join('\n')
    const [group] = groupCsvRows(parsePowerBodyCsv(csv))
    expect(group.title).toBe('Critical Whey - 2kg')
    expect(group.rows.map((r) => r.label)).toEqual(['Chocolate', 'Vanilla'])
  })
})

describe('groupMatches', () => {
  const [creatine] = groupCsvRows([
    row('P1', 'Creatine HCl, Fruit Punch - 75g'),
    row('P2', 'Creatine HCl, Lemon - 75g'),
  ])

  it('matches everything on an empty query', () => {
    expect(groupMatches(creatine, '')).toBe(true)
    expect(groupMatches(creatine, '   ')).toBe(true)
  })

  it('matches on name, brand, flavour or SKU, case-insensitively', () => {
    expect(groupMatches(creatine, 'creatine')).toBe(true)
    expect(groupMatches(creatine, 'LEVRONE')).toBe(true)
    expect(groupMatches(creatine, 'lemon')).toBe(true)
    expect(groupMatches(creatine, 'p2')).toBe(true)
  })

  it('needs every word to match somewhere', () => {
    expect(groupMatches(creatine, 'creatine 75g punch')).toBe(true)
    expect(groupMatches(creatine, 'creatine whey')).toBe(false)
  })
})
