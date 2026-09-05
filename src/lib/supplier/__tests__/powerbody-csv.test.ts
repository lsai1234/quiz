import { parsePowerBodyCsv, indexPowerBodyCsv, looksLikePowerBodyCsv } from '../powerbody-csv'

/**
 * The dropshipping catalogue export.
 *
 * Real lines from a real download, because the things that break a parser here
 * are all in the data: a blank flavour written as a single space, a `qty` of
 * "50+" rather than a number, product names full of commas and dashes, and a
 * trailing semicolon on every row.
 */
const HEADER = 'sku;manufacturer_name;name;qty;flavour;weight;img_url;retail_price;'
const ROWS = [
  'P46555;5% Nutrition;Crea-TEN - Legendary Series, Mango Pineapple - 225g;50+;Mango Pineapple;0.3000;https://img/a.jpg;22.94;',
  'P41119;5% Nutrition;Stage Ready Diuretic - 60 caps;0; ;0.0900;https://img/b.jpg;17.21;',
  'P46749;Applied Nutrition;Creatine HCl, Fruit Punch - 75g;12; ;0.0750;https://img/c.jpg;14.50;',
]
const CSV = [HEADER, ...ROWS].join('\n')

describe('parsePowerBodyCsv', () => {
  it('reads a row into the fields the repair needs', () => {
    const [first] = parsePowerBodyCsv(CSV)
    expect(first).toEqual({
      sku: 'P46555',
      brand: '5% Nutrition',
      name: 'Crea-TEN - Legendary Series, Mango Pineapple - 225g',
      flavour: 'Mango Pineapple',
      qty: '50+',
      imageUrl: 'https://img/a.jpg',
    })
  })

  it('skips the header rather than importing it as a product', () => {
    expect(parsePowerBodyCsv(CSV).map((r) => r.sku)).toEqual(['P46555', 'P41119', 'P46749'])
  })

  /*
    The file writes an empty flavour as a single space, so a naive check for
    "" reads it as present and puts a blank label in the picker.
  */
  it('treats a blank flavour as absent, not as an empty string', () => {
    const rows = parsePowerBodyCsv(CSV)
    expect(rows[1].flavour).toBeNull()
    expect(rows[2].flavour).toBeNull()
  })

  /*
    Precisely why the name is the primary source and the flavour column is
    only a cross-check: this row plainly has a flavour, and the column for it
    is empty.
  */
  it('keeps the name for a row whose flavour column is empty but whose name is not', () => {
    expect(parsePowerBodyCsv(CSV)[2].name).toBe('Creatine HCl, Fruit Punch - 75g')
  })

  it('survives a stray blank line and a row missing its columns', () => {
    const messy = [HEADER, ROWS[0], '', 'P999;OnlyTwo', '   ', ROWS[1]].join('\n')
    expect(parsePowerBodyCsv(messy).map((r) => r.sku)).toEqual(['P46555', 'P41119'])
  })

  it('handles CRLF, because this arrives off a Windows download', () => {
    expect(parsePowerBodyCsv([HEADER, ROWS[0]].join('\r\n'))).toHaveLength(1)
  })

  it('is empty for something that is not the export', () => {
    expect(parsePowerBodyCsv('')).toEqual([])
    expect(parsePowerBodyCsv('some,other,file\n1,2,3')).toEqual([])
  })
})

describe('indexPowerBodyCsv', () => {
  it('keys every row by its SKU', () => {
    const map = indexPowerBodyCsv(CSV)
    expect(map.size).toBe(3)
    expect(map.get('P46749')?.name).toBe('Creatine HCl, Fruit Punch - 75g')
  })

  it('takes the later line when a SKU appears twice', () => {
    const dupe = [HEADER, ROWS[0], 'P46555;X;Renamed Later - 225g;5; ;0.3;https://img/z.jpg;1.00;'].join('\n')
    expect(indexPowerBodyCsv(dupe).get('P46555')?.name).toBe('Renamed Later - 225g')
  })
})

describe('looksLikePowerBodyCsv', () => {
  /*
    Checked before parsing so somebody who picks the wrong file is told which
    file to pick, rather than getting "0 flavours named" and no reason.
  */
  it('recognises the export', () => {
    expect(looksLikePowerBodyCsv(CSV)).toBe(true)
  })

  it('rejects the roster CSV, which is the file most likely to be picked by mistake', () => {
    expect(looksLikePowerBodyCsv('sku,brand,name,swapGroup,matrixCell\nP1,B,N,g,c')).toBe(false)
  })

  it('rejects anything else', () => {
    expect(looksLikePowerBodyCsv('')).toBe(false)
    expect(looksLikePowerBodyCsv('hello')).toBe(false)
  })
})
