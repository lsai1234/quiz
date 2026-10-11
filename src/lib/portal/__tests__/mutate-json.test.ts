/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'
import { mutateJson, withResult, PersistError, readJson, writeJson, clearPersistCache } from '../persist'
import { kvDelete, kvGetStamped, kvSet } from '@/lib/db/kv'
import { getEngine, type SqlEngine } from '@/lib/db/engine'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * The strict half of the persistence seam.
 *
 * `readJson` + `writeJson` degrade to a fallback, which is fine for a settings
 * toggle and was ruinous for the product catalogue: a failed read handed back an
 * EMPTY catalogue and the write that followed erased every product; a write
 * built on a 5s-old cached read could put back a replaced version; two
 * instances writing at once silently dropped one edit. `mutateJson` is the fix
 * for all three, and these tests pin each one.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

interface ProductsDoc {
  overrides: Record<string, Partial<CatalogueProduct>>
  removedIds: string[]
  imported: CatalogueProduct[]
  topProductIds: string[]
}

const EMPTY: ProductsDoc = { overrides: {}, removedIds: [], imported: [], topProductIds: [] }

const product = (o: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  ...(JSON.parse(JSON.stringify(MOCK_CATALOGUE[0])) as CatalogueProduct),
  ...o,
})

const docWith = (...ids: string[]): ProductsDoc => ({
  ...EMPTY,
  imported: ids.map((id) => product({ id, handle: id, title: `Whey ${id}` })),
  topProductIds: [...ids],
})

const ids = (doc: ProductsDoc) => doc.imported.map((p) => p.id)

let seq = 0
/** A fresh document name per test, so no test sees another's row or cache entry. */
const fresh = (label: string) => `mutate-test-${label}-${(seq += 1)}`
const keyOf = (name: string) => `portal:${name}`

async function stored(name: string) {
  return kvGetStamped(keyOf(name))
}
async function storedDoc<T = ProductsDoc>(name: string): Promise<T | null> {
  const { raw } = await stored(name)
  return raw === null ? null : (JSON.parse(raw) as T)
}

// ── Engine instrumentation ──────────────────────────────────────────────────
// The engine is a plain object shared by the whole process, so the tests wrap
// its two query methods: every statement is logged, and a test can run a hook
// just before a `get` executes — to fail it, or to let "another instance" write
// in the gap between mutateJson's read and its compare-and-set.

type GetHook = (sql: string, params: unknown[]) => Promise<void> | void

let db: SqlEngine
let realGet: SqlEngine['get']
let realRun: SqlEngine['run']
let getHook: GetHook | null = null
const log = { gets: [] as string[], runs: [] as string[] }

const isStampedRead = (sql: string) => sql.startsWith('SELECT value, updated_at FROM kv')
const isPlainRead = (sql: string) => sql.startsWith('SELECT value FROM kv')
const isCompareAndSet = (sql: string) => sql.includes('RETURNING key')
const casFor = (name: string) => (sql: string, params: unknown[]) => isCompareAndSet(sql) && params.includes(keyOf(name))
const readFor = (name: string) => (sql: string, params: unknown[]) => isStampedRead(sql) && params.includes(keyOf(name))

beforeAll(async () => {
  db = await getEngine()
  realGet = db.get.bind(db)
  realRun = db.run.bind(db)
  Object.assign(db, {
    get: async (sql: string, params: unknown[] = []) => {
      log.gets.push(sql)
      if (getHook) await getHook(sql, params)
      return realGet(sql, params)
    },
    run: async (sql: string, params: unknown[] = []) => {
      log.runs.push(sql)
      return realRun(sql, params)
    },
  })
})

afterAll(() => {
  Object.assign(db, { get: realGet, run: realRun })
})

beforeEach(() => {
  clearPersistCache()
  getHook = null
  log.gets.length = 0
  log.runs.length = 0
})

afterEach(() => {
  getHook = null
  jest.restoreAllMocks()
  jest.useRealTimers()
})

/** Freeze `Date` only — real timers keep running, so mutateJson's back-off still elapses. */
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

async function persistError(p: Promise<unknown>): Promise<PersistError> {
  try {
    await p
  } catch (err) {
    expect(err).toBeInstanceOf(PersistError)
    return err as PersistError
  }
  throw new Error('expected mutateJson to reject')
}

// ── A write that lands ──────────────────────────────────────────────────────

describe('mutateJson: a write that lands', () => {
  it('stores the changed document and returns undefined for a plain return', async () => {
    const name = fresh('lands')
    await writeJson(name, docWith('whey-a'))

    const result = await mutateJson<ProductsDoc>(name, EMPTY, (doc) => ({
      ...doc,
      imported: [...doc.imported, product({ id: 'whey-b' })],
    }))

    expect(result).toBeUndefined()
    expect(ids((await storedDoc(name))!)).toEqual(['whey-a', 'whey-b'])
  })

  it('lets change mutate its copy in place and return it', async () => {
    const name = fresh('in-place')
    await writeJson(name, docWith('whey-a'))

    await mutateJson<ProductsDoc>(name, EMPTY, (doc) => {
      doc.imported[0].basePrice = 49.99
      doc.removedIds.push('retired-sku')
      return doc
    })

    const after = (await storedDoc(name))!
    expect(after.imported[0].basePrice).toBe(49.99)
    expect(after.removedIds).toEqual(['retired-sku'])
  })

  it('refreshes the read cache, so the next readJson sees the write without a database trip', async () => {
    const name = fresh('cache')
    await writeJson(name, docWith('whey-a'))
    // Prime the cache with the old version.
    expect(ids(await readJson<ProductsDoc>(name, EMPTY))).toEqual(['whey-a'])

    await mutateJson<ProductsDoc>(name, EMPTY, (doc) => ({ ...doc, imported: [...doc.imported, product({ id: 'whey-b' })] }))

    log.gets.length = 0
    const after = await readJson<ProductsDoc>(name, EMPTY)
    expect(ids(after)).toEqual(['whey-a', 'whey-b'])
    expect(log.gets).toHaveLength(0)
  })

  it('reads fresh rather than from the cache, so it never puts back a replaced version', async () => {
    const name = fresh('fresh-read')
    await writeJson(name, docWith('whey-a'))
    await readJson<ProductsDoc>(name, EMPTY) // cache now holds [whey-a]

    // Another instance replaces the document; this process's cache is stale.
    await kvSet(keyOf(name), docWith('whey-a', 'creatine-x'))

    const seen: string[][] = []
    await mutateJson<ProductsDoc>(name, EMPTY, (doc) => {
      seen.push(ids(doc))
      return { ...doc, imported: [...doc.imported, product({ id: 'whey-b' })] }
    })

    expect(seen).toEqual([['whey-a', 'creatine-x']])
    expect(ids((await storedDoc(name))!)).toEqual(['whey-a', 'creatine-x', 'whey-b'])
  })

  it('starts an empty slot from a copy of the fallback and never mutates the fallback itself', async () => {
    const name = fresh('fallback')
    const fallback: ProductsDoc = { overrides: {}, removedIds: [], imported: [], topProductIds: [] }

    await mutateJson<ProductsDoc>(name, fallback, (doc) => {
      doc.imported.push(product({ id: 'whey-first' }))
      doc.topProductIds.push('whey-first')
      return doc
    })

    expect(fallback).toEqual({ overrides: {}, removedIds: [], imported: [], topProductIds: [] })
    expect(ids((await storedDoc(name))!)).toEqual(['whey-first'])
  })

  it('inserts the first version only into an empty slot', async () => {
    const name = fresh('first-insert')
    await mutateJson<ProductsDoc>(name, EMPTY, (doc) => ({ ...doc, imported: [product({ id: 'whey-a' })] }))

    const cas = log.gets.filter(isCompareAndSet)
    expect(cas).toHaveLength(1)
    expect(cas[0]).toMatch(/^INSERT INTO kv .* ON CONFLICT\(key\) DO NOTHING RETURNING key$/)
  })
})

// ── withResult ──────────────────────────────────────────────────────────────

describe('withResult', () => {
  it('hands back the result while storing only the document', async () => {
    const name = fresh('with-result')
    await writeJson(name, docWith('whey-a'))

    const result = await mutateJson<ProductsDoc, { added: string; count: number }>(name, EMPTY, (doc) => {
      doc.imported.push(product({ id: 'whey-b' }))
      return withResult(doc, { added: 'whey-b', count: doc.imported.length })
    })

    expect(result).toEqual({ added: 'whey-b', count: 2 })

    const { raw } = await stored(name)
    const parsed = JSON.parse(raw as string) as Record<string, unknown>
    expect(Object.keys(parsed).sort()).toEqual(['imported', 'overrides', 'removedIds', 'topProductIds'])
    expect(raw).not.toContain('__mutateOutcome')
    expect(raw).not.toContain('"added"')

    // The cache holds the document too, not the wrapper.
    expect(Object.keys(await readJson<ProductsDoc>(name, EMPTY)).sort()).toEqual([
      'imported', 'overrides', 'removedIds', 'topProductIds',
    ])
  })

  it('carries a falsy result back as-is', async () => {
    const name = fresh('falsy-result')
    expect(await mutateJson<ProductsDoc, number>(name, EMPTY, (doc) => withResult(doc, 0))).toBe(0)
    expect(await mutateJson<ProductsDoc, boolean>(name, EMPTY, (doc) => withResult(doc, false))).toBe(false)
    expect(await storedDoc(name)).toEqual(EMPTY)
  })

  it('is the only way to return a result: a document that merely has next/result fields is stored whole', async () => {
    const name = fresh('lookalike')
    type Odd = { next: string; result: string }

    const result = await mutateJson<Odd, unknown>(name, { next: '', result: '' }, () => ({ next: 'page-2', result: 'ok' }))

    expect(result).toBeUndefined()
    expect(await storedDoc<Odd>(name)).toEqual({ next: 'page-2', result: 'ok' })
  })
})

// ── Conflicts ───────────────────────────────────────────────────────────────

describe('mutateJson: a write between the read and the compare-and-set', () => {
  it('re-runs the change on the NEW value, keeping the other writer’s edit (kvSet inside the first attempt)', async () => {
    const name = fresh('conflict-kvset')
    await writeJson(name, docWith('whey-a'))

    const seen: string[][] = []
    let theirs: Promise<void> | null = null
    const result = await mutateJson<ProductsDoc, number>(name, EMPTY, (doc) => {
      seen.push(ids(doc))
      // First attempt only: another instance saves while we are mid-change.
      if (seen.length === 1) theirs = kvSet(keyOf(name), docWith('whey-a', 'creatine-x'))
      doc.imported.push(product({ id: 'whey-b' }))
      return withResult(doc, seen.length)
    })
    await theirs

    expect(seen).toEqual([['whey-a'], ['whey-a', 'creatine-x']])
    expect(result).toBe(2) // the result of the attempt that landed
    expect(ids((await storedDoc(name))!)).toEqual(['whey-a', 'creatine-x', 'whey-b'])
    // And the cache reflects what landed, not the first attempt's version.
    expect(ids(await readJson<ProductsDoc>(name, EMPTY))).toEqual(['whey-a', 'creatine-x', 'whey-b'])
  })

  it('does the same when both writes fall in one millisecond', async () => {
    freezeClock()
    const name = fresh('conflict-same-ms')
    await writeJson(name, docWith('whey-a'))

    const seen: string[][] = []
    let theirs: Promise<void> | null = null
    await mutateJson<ProductsDoc>(name, EMPTY, (doc) => {
      seen.push(ids(doc))
      if (seen.length === 1) theirs = kvSet(keyOf(name), docWith('whey-a', 'creatine-x'))
      doc.imported.push(product({ id: 'whey-b' }))
      return doc
    })
    await theirs

    expect(seen).toHaveLength(2)
    expect(ids((await storedDoc(name))!)).toEqual(['whey-a', 'creatine-x', 'whey-b'])
  })

  it('gives each re-run a fresh copy, not the previous attempt’s half-edited one', async () => {
    const name = fresh('fresh-copy')
    await writeJson(name, docWith('whey-a'))
    const isCas = casFor(name)
    let interfered = false
    getHook = async (sql, params) => {
      if (!interfered && isCas(sql, params)) {
        interfered = true
        await kvSet(keyOf(name), docWith('whey-a', 'creatine-x'))
      }
    }

    await mutateJson<ProductsDoc>(name, EMPTY, (doc) => {
      doc.imported.push(product({ id: 'whey-b' }))
      return doc
    })

    // Exactly one whey-b: the first attempt's push did not leak into the second.
    expect(ids((await storedDoc(name))!)).toEqual(['whey-a', 'creatine-x', 'whey-b'])
  })

  it('re-runs on the other instance’s document when it created the row first', async () => {
    const name = fresh('insert-race')
    const isCas = casFor(name)
    let interfered = false
    getHook = async (sql, params) => {
      if (!interfered && isCas(sql, params)) {
        interfered = true
        await kvSet(keyOf(name), docWith('creatine-x'))
      }
    }

    const seen: string[][] = []
    await mutateJson<ProductsDoc>(name, EMPTY, (doc) => {
      seen.push(ids(doc))
      return { ...doc, imported: [...doc.imported, product({ id: 'whey-b' })] }
    })

    expect(seen).toEqual([[], ['creatine-x']])
    expect(ids((await storedDoc(name))!)).toEqual(['creatine-x', 'whey-b'])
  })

  it('re-runs from the fallback when the row was deleted underneath it', async () => {
    const name = fresh('deleted')
    await writeJson(name, docWith('whey-a'))
    const isCas = casFor(name)
    let interfered = false
    getHook = async (sql, params) => {
      if (!interfered && isCas(sql, params)) {
        interfered = true
        await kvDelete(keyOf(name))
      }
    }

    const seen: string[][] = []
    await mutateJson<ProductsDoc>(name, EMPTY, (doc) => {
      seen.push(ids(doc))
      return { ...doc, imported: [...doc.imported, product({ id: 'whey-b' })] }
    })

    expect(seen).toEqual([['whey-a'], []])
    expect(ids((await storedDoc(name))!)).toEqual(['whey-b'])
  })

  it('gives up with PersistError("conflict") after the attempts, leaving the other writer’s value', async () => {
    const name = fresh('exhausted')
    await writeJson(name, docWith('whey-a'))
    await readJson<ProductsDoc>(name, EMPTY) // cache holds [whey-a]

    const isCas = casFor(name)
    let theirWrites = 0
    getHook = async (sql, params) => {
      if (isCas(sql, params)) {
        theirWrites += 1
        await kvSet(keyOf(name), docWith('whey-a', `theirs-${theirWrites}`))
      }
    }

    const change = jest.fn((doc: ProductsDoc) => ({ ...doc, imported: [...doc.imported, product({ id: 'mine' })] }))
    const err = await persistError(mutateJson<ProductsDoc>(name, EMPTY, change, { attempts: 3 }))

    expect(err.reason).toBe('conflict')
    expect(err.message).toContain('3 tries')
    expect(change).toHaveBeenCalledTimes(3)
    expect(theirWrites).toBe(3)
    // Every attempt saw the latest of their writes.
    expect(change.mock.calls.map(([doc]) => ids(doc))).toEqual([
      ['whey-a'],
      ['whey-a', 'theirs-1'],
      ['whey-a', 'theirs-2'],
    ])
    expect(ids((await storedDoc(name))!)).toEqual(['whey-a', 'theirs-3'])

    // The stale cache entry was dropped: the next read goes to the database.
    getHook = null
    log.gets.length = 0
    expect(ids(await readJson<ProductsDoc>(name, EMPTY))).toEqual(['whey-a', 'theirs-3'])
    expect(log.gets.filter(isPlainRead)).toHaveLength(1)
  })

  it('tries four times by default', async () => {
    const name = fresh('default-attempts')
    await writeJson(name, docWith('whey-a'))
    const isCas = casFor(name)
    let n = 0
    getHook = async (sql, params) => {
      if (isCas(sql, params)) await kvSet(keyOf(name), docWith('whey-a', `theirs-${(n += 1)}`))
    }

    const change = jest.fn((doc: ProductsDoc) => doc)
    const err = await persistError(mutateJson<ProductsDoc>(name, EMPTY, change))
    expect(err.reason).toBe('conflict')
    expect(change).toHaveBeenCalledTimes(4)
  })

  it('always makes at least one attempt, even when asked for none', async () => {
    const ok = fresh('zero-attempts-ok')
    await mutateJson<ProductsDoc>(ok, EMPTY, (doc) => ({ ...doc, imported: [product({ id: 'whey-a' })] }), { attempts: 0 })
    expect(ids((await storedDoc(ok))!)).toEqual(['whey-a'])

    const clash = fresh('zero-attempts-clash')
    await writeJson(clash, docWith('whey-a'))
    const isCas = casFor(clash)
    getHook = async (sql, params) => {
      if (isCas(sql, params)) await kvSet(keyOf(clash), docWith('theirs'))
    }
    const change = jest.fn((doc: ProductsDoc) => doc)
    const err = await persistError(mutateJson<ProductsDoc>(clash, EMPTY, change, { attempts: -2 }))
    expect(err.reason).toBe('conflict')
    expect(change).toHaveBeenCalledTimes(1)
  })
})

// ── Unreadable ──────────────────────────────────────────────────────────────

describe('mutateJson: a document it cannot read is never written over', () => {
  it('throws PersistError("unreadable") for a stored value that is not JSON and leaves the row untouched', async () => {
    const name = fresh('garbage')
    await realRun('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)', [keyOf(name), '{"imported":[{"id":"whey-a"', 'stamp-garbage'])
    log.gets.length = 0
    log.runs.length = 0

    const change = jest.fn((doc: ProductsDoc) => doc)
    const err = await persistError(mutateJson<ProductsDoc>(name, EMPTY, change))

    expect(err.reason).toBe('unreadable')
    expect(err.message).toContain(name)
    expect(change).not.toHaveBeenCalled()
    expect(log.gets.filter(isCompareAndSet)).toHaveLength(0)
    expect(log.runs).toHaveLength(0)
    expect(await stored(name)).toEqual({ raw: '{"imported":[{"id":"whey-a"', stamp: 'stamp-garbage' })
  })

  it('throws PersistError("unreadable") on a database read error, and writes nothing — not even the fallback', async () => {
    const name = fresh('read-error')
    await writeJson(name, docWith('whey-a', 'creatine-x'))
    const before = await stored(name)

    const isRead = readFor(name)
    getHook = (sql, params) => {
      if (isRead(sql, params)) throw new Error('Connection terminated unexpectedly')
    }
    log.gets.length = 0
    log.runs.length = 0

    const change = jest.fn((doc: ProductsDoc) => ({ ...doc, imported: [] }))
    const err = await persistError(mutateJson<ProductsDoc>(name, EMPTY, change))

    expect(err.reason).toBe('unreadable')
    expect(err.message).toContain('Connection terminated unexpectedly')
    expect(err.message).toContain('Nothing was changed')
    expect(change).not.toHaveBeenCalled()
    expect(log.gets.filter(isCompareAndSet)).toHaveLength(0)
    expect(log.runs).toHaveLength(0)

    getHook = null
    expect(await stored(name)).toEqual(before)
  })

  it('reports a non-Error rejection from the read too', async () => {
    const name = fresh('read-error-string')
    const isRead = readFor(name)
    getHook = (sql, params) => {
      if (isRead(sql, params)) return Promise.reject('ECONNRESET')
    }

    const err = await persistError(mutateJson<ProductsDoc>(name, EMPTY, (d) => d))
    expect(err.reason).toBe('unreadable')
    expect(err.message).toContain('ECONNRESET')
  })
})

// ── Write failures ──────────────────────────────────────────────────────────

describe('mutateJson: a write that fails', () => {
  it('throws PersistError("write-failed"), does not retry, and leaves the stored document alone', async () => {
    const name = fresh('write-error')
    await writeJson(name, docWith('whey-a'))
    const before = await stored(name)

    const isCas = casFor(name)
    getHook = (sql, params) => {
      if (isCas(sql, params)) throw new Error('SQLITE_IOERR: disk I/O error')
    }

    const change = jest.fn((doc: ProductsDoc) => ({ ...doc, imported: [] }))
    const err = await persistError(mutateJson<ProductsDoc>(name, EMPTY, change))

    expect(err.reason).toBe('write-failed')
    expect(err.message).toContain('disk I/O error')
    expect(change).toHaveBeenCalledTimes(1)

    getHook = null
    expect(await stored(name)).toEqual(before)
  })

  it('drops the cache entry, so the next read asks the database what actually happened', async () => {
    const name = fresh('write-error-cache')
    await writeJson(name, docWith('whey-a'))
    await readJson<ProductsDoc>(name, EMPTY) // cached [whey-a]
    await kvSet(keyOf(name), docWith('whey-a', 'creatine-x')) // another instance

    const isCas = casFor(name)
    getHook = (sql, params) => {
      if (isCas(sql, params)) throw new Error('timeout')
    }
    await persistError(mutateJson<ProductsDoc>(name, EMPTY, (d) => d))
    getHook = null

    expect(ids(await readJson<ProductsDoc>(name, EMPTY))).toEqual(['whey-a', 'creatine-x'])
  })

  it('lets an error thrown by change itself through untouched, with nothing written', async () => {
    const name = fresh('change-throws')
    await writeJson(name, docWith('whey-a'))
    const before = await stored(name)

    await expect(
      mutateJson<ProductsDoc>(name, EMPTY, () => {
        throw new RangeError('price must be positive')
      }),
    ).rejects.toThrow(RangeError)
    expect(await stored(name)).toEqual(before)
  })
})

// ── PersistError ────────────────────────────────────────────────────────────

describe('PersistError', () => {
  it('is an Error with a name and a machine-readable reason', () => {
    const err = new PersistError('Could not save products.', 'write-failed')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(PersistError)
    expect(err.name).toBe('PersistError')
    expect(err.reason).toBe('write-failed')
    expect(err.message).toBe('Could not save products.')
  })
})

// ── Legacy `.data/<name>.json` snapshots ────────────────────────────────────

describe('legacy snapshot migration', () => {
  const LEGACY_DIR = path.join(process.cwd(), '.data')

  /** Pretend `.data/<name>.json` holds `text`; every other path reads for real. */
  function legacyFile(name: string, text: string) {
    const target = path.join(LEGACY_DIR, `${name}.json`)
    const real = fs.readFileSync
    const reads: string[] = []
    const spy = jest.spyOn(fs, 'readFileSync').mockImplementation(((p: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (p === target) {
        reads.push(String(p))
        return text
      }
      return (real as (...a: unknown[]) => unknown)(p, ...rest)
    }) as typeof fs.readFileSync)
    return { reads, spy }
  }

  describe('readJson', () => {
    it('migrates a snapshot into an empty slot and reads it from the database afterwards', async () => {
      const name = fresh('legacy-read')
      const legacy = docWith('legacy-whey')
      const { reads } = legacyFile(name, JSON.stringify(legacy))

      expect(await readJson<ProductsDoc>(name, EMPTY)).toEqual(legacy)
      expect(await storedDoc(name)).toEqual(legacy)
      expect(reads).toHaveLength(1)

      // The filesystem is reached once per process, not once per read.
      expect(await readJson<ProductsDoc>(name, EMPTY)).toEqual(legacy)
      expect(await readJson<ProductsDoc>(name, EMPTY)).toEqual(legacy)
      expect(reads).toHaveLength(1)
    })

    it('never replaces a row that was written after the read saw "no row"', async () => {
      const name = fresh('legacy-race')
      legacyFile(name, JSON.stringify(docWith('legacy-whey')))

      const isCas = casFor(name)
      getHook = async (sql, params) => {
        if (isCas(sql, params)) await kvSet(keyOf(name), docWith('fresh-edit'))
      }
      await readJson<ProductsDoc>(name, EMPTY)
      getHook = null

      expect(ids((await storedDoc(name))!)).toEqual(['fresh-edit'])
      expect(ids(await readJson<ProductsDoc>(name, EMPTY))).toEqual(['fresh-edit'])
    })

    it('ignores the snapshot once the row exists', async () => {
      const name = fresh('legacy-ignored')
      await writeJson(name, docWith('db-whey'))
      clearPersistCache()
      const { reads } = legacyFile(name, JSON.stringify(docWith('legacy-whey')))

      expect(ids(await readJson<ProductsDoc>(name, EMPTY))).toEqual(['db-whey'])
      expect(reads).toHaveLength(0)
    })

    it('falls back, writing nothing, when the snapshot is not JSON', async () => {
      const name = fresh('legacy-garbage')
      legacyFile(name, '{"imported": [')

      expect(await readJson<ProductsDoc>(name, EMPTY)).toEqual(EMPTY)
      expect(await stored(name)).toEqual({ raw: null, stamp: null })
    })
  })

  describe('mutateJson', () => {
    it('starts from the snapshot, not the fallback, when there is no row yet', async () => {
      const name = fresh('legacy-mutate')
      legacyFile(name, JSON.stringify(docWith('legacy-whey')))

      const seen: string[][] = []
      await mutateJson<ProductsDoc>(name, EMPTY, (doc) => {
        seen.push(ids(doc))
        return { ...doc, imported: [...doc.imported, product({ id: 'whey-b' })] }
      })

      expect(seen).toEqual([['legacy-whey']])
      expect(ids((await storedDoc(name))!)).toEqual(['legacy-whey', 'whey-b'])
    })

    it('ignores the snapshot once the row exists', async () => {
      const name = fresh('legacy-mutate-ignored')
      await writeJson(name, docWith('db-whey'))
      const { reads } = legacyFile(name, JSON.stringify(docWith('legacy-whey')))

      await mutateJson<ProductsDoc>(name, EMPTY, (doc) => ({ ...doc, imported: [...doc.imported, product({ id: 'whey-b' })] }))

      expect(reads).toHaveLength(0)
      expect(ids((await storedDoc(name))!)).toEqual(['db-whey', 'whey-b'])
    })

    it('uses the fallback when there is neither a row nor a snapshot', async () => {
      const name = fresh('no-legacy')
      const seen: ProductsDoc[] = []
      await mutateJson<ProductsDoc>(name, EMPTY, (doc) => {
        seen.push(JSON.parse(JSON.stringify(doc)))
        return doc
      })
      expect(seen).toEqual([EMPTY])
      expect(await storedDoc(name)).toEqual(EMPTY)
    })
  })
})
