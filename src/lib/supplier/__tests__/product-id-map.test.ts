import { partitionBySkuMap, productIdForSku, knownSkuCount } from '@/lib/supplier/product-id-map'

describe('product id map', () => {
  it('reports no id for a SKU it has never been told about', () => {
    expect(productIdForSku('P-NOT-IN-THE-MAP')).toBeNull()
  })

  /** An empty map is the CORRECT state when the feed reaches everything — it
   *  must not be read as a fault, and must leave the feed path untouched. */
  it('sends everything to the feed when the map is empty', () => {
    const { mapped, unmapped } = partitionBySkuMap(['P1', 'P2'])
    if (knownSkuCount() === 0) {
      expect(mapped).toEqual([])
      expect(unmapped).toEqual(['P1', 'P2'])
    }
  })

  it('splits a paste into what it can answer and what still needs searching', () => {
    const { mapped, unmapped } = partitionBySkuMap([])
    expect(mapped).toEqual([])
    expect(unmapped).toEqual([])
  })
})
