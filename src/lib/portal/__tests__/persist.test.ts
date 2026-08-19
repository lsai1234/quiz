/**
 * @jest-environment node
 */
import { readJson, writeJson, clearPersistCache } from '../persist'
import { kvSet } from '@/lib/db/kv'
import { getEngine } from '@/lib/db/engine'

/**
 * The hub's persistence seam.
 *
 * The behaviour worth pinning is not that it stores things — it is what it does
 * *not* do. `portal:products` holds every imported product as one JSON document
 * (a 600-product import measures 1.4MB), and it was being fetched and parsed
 * again for every request that touches the catalogue, which is most of the hub
 * plus the quiz. One hub screen firing five calls crossed the same megabytes
 * five times.
 */
async function countQueries<T>(fn: () => Promise<T>): Promise<{ result: T; queries: number }> {
  const db = await getEngine()
  const get = db.get.bind(db)
  let queries = 0
  Object.assign(db, { get: (...a: Parameters<typeof get>) => { queries += 1; return get(...a) } })
  try {
    return { result: await fn(), queries }
  } finally {
    Object.assign(db, { get })
  }
}

beforeEach(() => clearPersistCache())

describe('readJson', () => {
  it('reads through once and reuses it for the burst that follows', async () => {
    await writeJson('probe-a', { imported: [1, 2, 3] })
    clearPersistCache()

    const { queries } = await countQueries(async () => {
      for (let i = 0; i < 5; i += 1) await readJson('probe-a', { imported: [] })
    })
    expect(queries).toBe(1)
  })

  it('hands every caller its own copy, so one cannot see another mid-edit', async () => {
    await writeJson('probe-b', { imported: [{ id: 'p1' }] })

    const first = await readJson<{ imported: { id: string }[] }>('probe-b', { imported: [] })
    first.imported.push({ id: 'scratch' })

    const second = await readJson<{ imported: { id: string }[] }>('probe-b', { imported: [] })
    expect(second.imported).toEqual([{ id: 'p1' }])
  })

  it('shows a founder their own write immediately', async () => {
    await writeJson('probe-c', { mode: 'mock' })
    await writeJson('probe-c', { mode: 'real' })
    expect(await readJson('probe-c', { mode: 'none' })).toEqual({ mode: 'real' })
  })

  it('sees an edit made anywhere else once the entry has aged out', async () => {
    await writeJson('probe-d', { mode: 'mock' })
    // Another instance writes straight to the table, as a second lambda would.
    await kvSet('portal:probe-d', { mode: 'real' })

    expect(await readJson('probe-d', { mode: 'none' })).toEqual({ mode: 'mock' })
    clearPersistCache() // stands in for the TTL expiring
    expect(await readJson('probe-d', { mode: 'none' })).toEqual({ mode: 'real' })
  })

  it('falls back when there is nothing stored, and does not ask again', async () => {
    const { result, queries } = await countQueries(async () => {
      const a = await readJson('probe-missing', { fallback: true })
      const b = await readJson('probe-missing', { fallback: true })
      return [a, b]
    })
    expect(result).toEqual([{ fallback: true }, { fallback: true }])
    expect(queries).toBe(1)
  })

  it('falls back on a row that is not JSON rather than throwing', async () => {
    const db = await getEngine()
    await db.run('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)', [
      'portal:probe-bad', '{not json', new Date().toISOString(),
    ])
    expect(await readJson('probe-bad', { ok: true })).toEqual({ ok: true })
  })
})
