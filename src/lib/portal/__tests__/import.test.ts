import { parseCsv, parseImportCsv, IMPORT_TEMPLATE_CSV } from '../import'

describe('CSV parsing', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('handles quoted fields with commas and escaped quotes', () => {
    const grid = parseCsv('title,note\n"Hello, world","She said ""hi"""')
    expect(grid[1]).toEqual(['Hello, world', 'She said "hi"'])
  })

  it('handles CRLF line endings and a trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('strips a leading BOM and drops blank rows', () => {
    expect(parseCsv('﻿a,b\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('parseImportCsv validation + mapping', () => {
  it('maps a valid single-flavour row to a catalogue product', () => {
    const csv = 'handle,title,description,category,price,compare_at_price,cost,sku,flavours,image_url,servings,subscription_eligible\n' +
      'chrgd-creatine,CHRGD Creatine,"Pure creatine.",Performance,24.99,29.99,8.5,OLV-CRE,Unflavoured,https://img/c.jpg,60,true'
    const preview = parseImportCsv(csv)
    expect(preview.validCount).toBe(1)
    expect(preview.errorCount).toBe(0)
    const p = preview.rows[0].product!
    expect(p.id).toBe('chrgd-creatine')
    expect(p.basePrice).toBe(24.99)
    expect(p.compareAtPrice).toBe(29.99)
    expect(p.cost).toBe(8.5)
    expect(p.subscriptionEligible).toBe(true)
    expect(p.servings).toBe(60)
    expect(p.variants).toHaveLength(1)
    expect(p.variants[0].sku).toBe('OLV-CRE')
  })

  it('creates one variant per flavour and matches SKUs by position', () => {
    const csv = 'handle,title,price,sku,flavours\n' +
      'greens,Daily Greens,29.99,OLV-1|OLV-2,Berry|Original'
    const p = parseImportCsv(csv).rows[0].product!
    expect(p.variants).toHaveLength(2)
    expect(p.variants.map((v) => v.flavour)).toEqual(['Berry', 'Original'])
    expect(p.variants.map((v) => v.sku)).toEqual(['OLV-1', 'OLV-2'])
  })

  it('flags rows missing required fields', () => {
    const csv = 'handle,title,price\n,,9.99\nok,Has Title,'
    const preview = parseImportCsv(csv)
    expect(preview.validCount).toBe(0)
    expect(preview.rows[0].errors).toContain('title is required')
    expect(preview.rows[1].errors).toContain('price is required')
  })

  it('rejects a non-numeric price', () => {
    const preview = parseImportCsv('handle,title,price\nx,X,abc')
    expect(preview.rows[0].errors.some((e) => e.includes('price must be'))).toBe(true)
  })

  it('parses its own template with all rows valid', () => {
    const preview = parseImportCsv(IMPORT_TEMPLATE_CSV)
    expect(preview.errorCount).toBe(0)
    expect(preview.validCount).toBeGreaterThanOrEqual(2)
  })
})
