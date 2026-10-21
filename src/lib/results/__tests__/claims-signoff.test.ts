import { readFileSync } from 'fs'
import { join } from 'path'
import { CLAIMS, CLAIMS_BY_KIND } from '@/lib/consult/claims'
import {
  GENERAL_HEALTH_NOTE, NO_CLAIM_HEADER, SIGNOFF_HEADER, buildClaimsSignoff, csvField,
} from '../claims-signoff'

const ROOT = join(__dirname, '../../../..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const ROSTER = read('docs/rosters/chrgd-roster.csv')

/** A small RFC 4180 reader, enough to read the sheets back. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++ } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

describe('csvField', () => {
  it('quotes only what needs it, doubling inner quotes', () => {
    expect(csvField('plain')).toBe('plain')
    expect(csvField('a, b')).toBe('"a, b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('two\nlines')).toBe('"two\nlines"')
    expect(csvField(' padded')).toBe('" padded"')
  })
})

describe('claims-signoff.csv', () => {
  const built = buildClaimsSignoff(ROSTER)
  const [header, ...rows] = parseCsv(built.claims)

  it('has the agreed columns', () => {
    expect(header).toEqual([...SIGNOFF_HEADER])
    for (const r of rows) expect(r).toHaveLength(SIGNOFF_HEADER.length)
  })

  it('has one row per kind and claim, with the register wording verbatim', () => {
    const expected = Object.entries(CLAIMS_BY_KIND).flatMap(([kind, ids]) => (ids ?? []).map((id) => [kind, id]))
    expect(rows.map((r) => [r[0], r[1]])).toEqual(expected)
    for (const [, id, wording, condition] of rows) {
      expect(wording).toBe(CLAIMS[id].wording)
      expect(condition).toBe(CLAIMS[id].condition)
    }
  })

  it('lists the roster products of each kind as "SKU Brand Name"', () => {
    const creatine = rows.find((r) => r[0] === 'creatine')
    expect(creatine?.[4].split(' | ')).toContain('P6243 Olimp Nutrition Creatine Monohydrate Powder - 250g')
    // No roster product in the group: empty.
    expect(rows.find((r) => r[0] === 'protein-clear')?.[4]).toBe('')
  })

  it('lists the mapped goals by their quiz labels, with General health on every row', () => {
    const goals = (kind: string, id: string) => rows.find((r) => r[0] === kind && r[1] === id)?.[5]
    expect(goals('protein-whey', 'protein-muscle-growth')).toBe(`Build muscle; Gain mass; ${GENERAL_HEALTH_NOTE}`)
    expect(goals('vitamin-d', 'vitd-immune')).toBe(`Immune support; ${GENERAL_HEALTH_NOTE}`)
    expect(goals('omega-3', 'epa-dha-heart')).toBe(GENERAL_HEALTH_NOTE)
    for (const r of rows) expect(r[5]).toContain(GENERAL_HEALTH_NOTE)
  })

  it('is the committed file (run `npm run claims:signoff` after changing claims, the map or the roster)', () => {
    expect(read('docs/claims-signoff.csv')).toBe(built.claims)
  })
})

describe('claims-signoff-no-claim.csv', () => {
  const built = buildClaimsSignoff(ROSTER)
  const [header, ...rows] = parseCsv(built.noClaim)

  it('lists the roster products whose kind carries no authorised claim', () => {
    expect(header).toEqual([...NO_CLAIM_HEADER])
    expect(rows.length).toBeGreaterThan(0)
    for (const [, , , group] of rows) expect(CLAIMS_BY_KIND[group as keyof typeof CLAIMS_BY_KIND] ?? []).toEqual([])
    const skus = rows.map((r) => r[0])
    expect(skus).toEqual(expect.arrayContaining(['P46673', 'P34137', 'P44491', 'P43725']))
    // Products with a claim are not here.
    expect(skus).not.toContain('P6243')
  })

  it('is the committed file', () => {
    expect(read('docs/claims-signoff-no-claim.csv')).toBe(built.noClaim)
  })
})
