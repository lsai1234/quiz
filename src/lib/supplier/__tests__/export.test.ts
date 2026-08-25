import { toFeedCsv } from '@/lib/supplier/export'
import { listPriceFor } from '@/lib/pricing/list-price'
import type { SupplierStockLevel } from '@/lib/supplier/types'

const LEVEL: SupplierStockLevel = {
  sku: 'PB-1',
  productId: '1001',
  stock: 5,
  inStock: true,
  wholesalePrice: 10,
  rrp: 24.99,
  updatedAt: '2026-08-25T09:00:00.000Z',
}

describe('toFeedCsv', () => {
  /**
   * The whole point of the file: the SKU → product id mapping is the one thing
   * that exists nowhere else, and the ID box takes the second column.
   */
  it('carries the SKU and its product id', () => {
    const [header, row] = toFeedCsv([LEVEL]).trim().split('\n')

    expect(header.split(',').slice(0, 2)).toEqual(['productId', 'sku'])
    expect(row.startsWith('1001,PB-1,')).toBe(true)
  })

  it('shows what we would sell it for, by our own rule', () => {
    const row = toFeedCsv([LEVEL]).trim().split('\n')[1]
    // cost × 2 → .99, the same number the lookup card shows.
    expect(row).toContain(listPriceFor(10).toFixed(2))
  })

  /**
   * PowerBody codes are the reason quoting matters here: `00123` read as a
   * number comes back as `123`, and a mapping file whose keys have been
   * silently edited is worse than no mapping file at all.
   */
  it('quotes a code with leading zeros so it survives a spreadsheet', () => {
    const row = toFeedCsv([{ ...LEVEL, sku: '00123' }]).trim().split('\n')[1]
    expect(row).toContain('"00123"')
  })

  it('quotes a value containing a comma rather than letting it split the row', () => {
    const csv = toFeedCsv([{ ...LEVEL, sku: 'A,B' }])
    const rows = csv.trim().split('\n')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toContain('"A,B"')
  })

  it('leaves the id column empty rather than writing null', () => {
    const row = toFeedCsv([{ ...LEVEL, productId: null }]).trim().split('\n')[1]
    expect(row.startsWith(',PB-1,')).toBe(true)
  })

  it('says plainly whether it is in stock', () => {
    expect(toFeedCsv([{ ...LEVEL, inStock: false }])).toContain(',no,')
    expect(toFeedCsv([LEVEL])).toContain(',yes,')
  })

  /** Feed order is evidence: it is what shows a read that stopped early. */
  it('keeps the feed’s own order', () => {
    const csv = toFeedCsv([
      { ...LEVEL, sku: 'Z' },
      { ...LEVEL, sku: 'A' },
    ])
    const skus = csv.trim().split('\n').slice(1).map((r) => r.split(',')[1])
    expect(skus).toEqual(['Z', 'A'])
  })

  it('is just a header when the feed came back empty', () => {
    expect(toFeedCsv([])).toBe('productId,sku,wholesalePrice,sellPrice,stock,inStock,updatedAt\n')
  })
})
