/**
 * @jest-environment node
 */
import { kvCompareAndSet, kvGetStamped, kvListPrefix, kvSet, kvDelete, kvGet } from '../kv'
import { getEngine } from '../engine'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * The stamped half of the kv table — what makes a read-modify-write safe across
 * serverless instances. `kvCompareAndSet` only writes when the row still carries
 * the stamp the caller read, so two instances editing the same document cannot
 * silently drop one another's change.
 *
 * Every test uses its own key, so nothing here depends on run order.
 */

let seq = 0
const key = (label: string) => `test-cas:${label}:${Date.now()}:${(seq += 1)}`

const product = (o: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  ...(JSON.parse(JSON.stringify(MOCK_CATALOGUE[0])) as CatalogueProduct),
  ...o,
})

/** A products document the shape the hub stores under `portal:products`. */
const productsDoc = (...imported: CatalogueProduct[]) => ({
  overrides: {},
  removedIds: [] as string[],
  imported,
  topProductIds: imported.map((p) => p.id),
})

/**
 * Freeze the wall clock (only `Date` — promises and real timers still run) so
 * two writes are guaranteed to land in the same millisecond, which is the case
 * the stamp's random suffix exists for.
 */
function freezeClock(at = '2026-10-11T09:30:00.000Z') {
  jest.useFakeTimers({
    now: new Date(at),
    doNotFake: [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
      'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval',
      'clearInterval', 'setTimeout', 'clearTimeout',
    ],
  })
}

afterEach(() => {
  jest.useRealTimers()
})

describe('kvGetStamped', () => {
  it('says "no row" with a null value and a null stamp', async () => {
    expect(await kvGetStamped(key('missing'))).toEqual({ raw: null, stamp: null })
  })

  it('returns the stored text verbatim together with the stamp of the write that put it there', async () => {
    const k = key('verbatim')
    const db = await getEngine()
    // Spacing the app would never produce: proves the text is not re-serialised.
    await db.run('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)', [k, '{ "imported": [] }', 'stamp-1'])

    expect(await kvGetStamped(k)).toEqual({ raw: '{ "imported": [] }', stamp: 'stamp-1' })
  })

  it('hands back a row that is not JSON as text, so a strict caller can refuse it', async () => {
    const k = key('garbage')
    const db = await getEngine()
    await db.run('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)', [k, '{not json', 'stamp-g'])

    expect(await kvGetStamped(k)).toEqual({ raw: '{not json', stamp: 'stamp-g' })
  })

  it('reports the stamp kvCompareAndSet returned', async () => {
    const k = key('roundtrip')
    const doc = productsDoc(product({ id: 'whey-a' }))
    const stamp = await kvCompareAndSet(k, doc, null)

    const read = await kvGetStamped(k)
    expect(read.stamp).toBe(stamp)
    expect(JSON.parse(read.raw as string)).toEqual(doc)
  })
})

describe('kvCompareAndSet', () => {
  describe('with expected = null (insert only)', () => {
    it('inserts when there is no row and returns the new stamp', async () => {
      const k = key('insert')
      const doc = productsDoc(product({ id: 'whey-insert' }))

      const stamp = await kvCompareAndSet(k, doc, null)
      expect(typeof stamp).toBe('string')
      expect(await kvGet(k)).toEqual(doc)
    })

    it('does nothing when a row already exists, and says so with null', async () => {
      const k = key('exists')
      const original = productsDoc(product({ id: 'original' }))
      const first = await kvCompareAndSet(k, original, null)

      const second = await kvCompareAndSet(k, productsDoc(product({ id: 'usurper' })), null)
      expect(second).toBeNull()

      // Value AND stamp untouched — the row is exactly what the first writer left.
      expect(await kvGetStamped(k)).toEqual({ raw: JSON.stringify(original), stamp: first })
    })

    it('does not replace a row that was written with kvSet either', async () => {
      const k = key('exists-kvset')
      await kvSet(k, { mode: 'real' })
      const before = await kvGetStamped(k)

      expect(await kvCompareAndSet(k, { mode: 'mock' }, null)).toBeNull()
      expect(await kvGetStamped(k)).toEqual(before)
    })

    it('lets exactly one of two racing inserts land', async () => {
      const k = key('race-insert')
      const [a, b] = await Promise.all([
        kvCompareAndSet(k, { by: 'a' }, null),
        kvCompareAndSet(k, { by: 'b' }, null),
      ])
      expect([a, b].filter((s) => s !== null)).toHaveLength(1)
      expect(await kvGet(k)).toEqual(a !== null ? { by: 'a' } : { by: 'b' })
    })
  })

  describe('with an expected stamp (update only if unchanged)', () => {
    it('writes when the row still carries the stamp that was read, and returns a fresh stamp', async () => {
      const k = key('update')
      const s1 = await kvCompareAndSet(k, productsDoc(product({ id: 'v1' })), null)
      const next = productsDoc(product({ id: 'v1', basePrice: 44.99 }))

      const s2 = await kvCompareAndSet(k, next, s1)
      expect(s2).not.toBeNull()
      expect(s2).not.toBe(s1)
      expect(await kvGetStamped(k)).toEqual({ raw: JSON.stringify(next), stamp: s2 })
    })

    it('accepts the stamp of a row that kvSet wrote', async () => {
      const k = key('update-after-kvset')
      await kvSet(k, { v: 1 })
      const { stamp } = await kvGetStamped(k)

      expect(await kvCompareAndSet(k, { v: 2 }, stamp)).not.toBeNull()
      expect(await kvGet(k)).toEqual({ v: 2 })
    })

    it('refuses when somebody else wrote since the read, leaving their write in place', async () => {
      const k = key('stale')
      const s1 = await kvCompareAndSet(k, { v: 1 }, null)
      const s2 = await kvCompareAndSet(k, { v: 2, by: 'other instance' }, s1)

      expect(await kvCompareAndSet(k, { v: 2, by: 'me' }, s1)).toBeNull()
      expect(await kvGetStamped(k)).toEqual({ raw: JSON.stringify({ v: 2, by: 'other instance' }), stamp: s2 })
    })

    it('lets only one of two writers that read the same stamp land', async () => {
      const k = key('two-writers')
      const read = await kvCompareAndSet(k, { edits: [] }, null)

      const [a, b] = await Promise.all([
        kvCompareAndSet(k, { edits: ['a'] }, read),
        kvCompareAndSet(k, { edits: ['b'] }, read),
      ])
      expect([a, b].filter((s) => s !== null)).toHaveLength(1)
    })

    it('does not resurrect a row that was deleted since the read', async () => {
      const k = key('deleted')
      const s1 = await kvCompareAndSet(k, { v: 1 }, null)
      await kvDelete(k)

      expect(await kvCompareAndSet(k, { v: 2 }, s1)).toBeNull()
      expect(await kvGetStamped(k)).toEqual({ raw: null, stamp: null })
    })

    it('only touches its own key', async () => {
      const k1 = key('mine')
      const k2 = key('neighbour')
      const s1 = await kvCompareAndSet(k1, { v: 1 }, null)
      await kvCompareAndSet(k2, { v: 'neighbour' }, null)
      const neighbour = await kvGetStamped(k2)

      await kvCompareAndSet(k1, { v: 2 }, s1)
      expect(await kvGetStamped(k2)).toEqual(neighbour)
    })
  })
})

describe('stamps', () => {
  it('are unique for back-to-back writes in the same millisecond', async () => {
    freezeClock()
    const k = key('same-ms')
    const stamps: string[] = []
    let last: string | null = null
    for (let i = 0; i < 50; i += 1) {
      const s: string | null = await kvCompareAndSet(k, { i }, last)
      expect(s).not.toBeNull()
      stamps.push(s as string)
      last = s
    }
    expect(new Set(stamps).size).toBe(50)
  })

  it('in the same millisecond, still stop a writer holding the previous stamp', async () => {
    freezeClock()
    const k = key('same-ms-stale')
    const s1 = await kvCompareAndSet(k, { v: 1 }, null)
    await kvCompareAndSet(k, { v: 2 }, s1)

    expect(await kvCompareAndSet(k, { v: 'lost update' }, s1)).toBeNull()
    expect(await kvGet(k)).toEqual({ v: 2 })
  })

  /*
    kvSet is a writer too (writeJson goes through it). If its stamp were bare
    millisecond ISO, two kvSet writes in the same millisecond would carry the
    same stamp, and a compare-and-set holding the first one would pass and
    silently overwrite the second — the exact failure the suffix exists for.
  */
  it('are unique for back-to-back kvSet writes in the same millisecond', async () => {
    freezeClock()
    const k = key('kvset-same-ms')
    await kvSet(k, { v: 1 })
    const first = await kvGetStamped(k)
    await kvSet(k, { v: 2 })
    const second = await kvGetStamped(k)

    expect(second.stamp).not.toBe(first.stamp)
  })

  it('stop a compare-and-set that read a stamp kvSet has since replaced, even in the same millisecond', async () => {
    freezeClock()
    const k = key('kvset-then-cas')
    await kvSet(k, { v: 1 })
    const { stamp } = await kvGetStamped(k)
    await kvSet(k, { v: 2, by: 'another instance' })

    expect(await kvCompareAndSet(k, { v: 'mine' }, stamp)).toBeNull()
    expect(await kvGet(k)).toEqual({ v: 2, by: 'another instance' })
  })

  it('begin with the time of the write, so they still sort by time', async () => {
    freezeClock('2026-10-11T09:30:00.123Z')
    const k = key('prefix')
    const stamp = await kvCompareAndSet(k, { v: 1 }, null)
    expect(stamp?.startsWith('2026-10-11T09:30:00.123Z')).toBe(true)

    await kvSet(k, { v: 2 })
    expect((await kvGetStamped(k)).stamp?.startsWith('2026-10-11T09:30:00.123Z')).toBe(true)
  })

  it('keep kvListPrefix newest first across both kinds of write', async () => {
    const prefix = `${key('order')}:`
    freezeClock('2026-10-11T09:00:00.000Z')
    await kvCompareAndSet(`${prefix}a`, { n: 'a' }, null)
    jest.setSystemTime(new Date('2026-10-11T09:00:01.000Z'))
    await kvSet(`${prefix}b`, { n: 'b' })
    jest.setSystemTime(new Date('2026-10-11T09:00:02.000Z'))
    await kvCompareAndSet(`${prefix}c`, { n: 'c' }, null)

    const rows = await kvListPrefix<{ n: string }>(prefix)
    expect(rows.map((r) => r.value.n)).toEqual(['c', 'b', 'a'])
  })
})

describe('kvSet', () => {
  it('inserts, then overwrites unconditionally', async () => {
    const k = key('kvset')
    await kvSet(k, productsDoc(product({ id: 'first' })))
    await kvSet(k, productsDoc(product({ id: 'second' })))
    expect((await kvGet<ReturnType<typeof productsDoc>>(k))?.imported.map((p) => p.id)).toEqual(['second'])
  })
})
