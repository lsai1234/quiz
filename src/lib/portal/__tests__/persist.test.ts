/**
 * The persistence seam: fs-backed by default, database-backed when configured.
 * The db module is mocked so both backends are exercised without a real
 * Postgres — what matters here is the routing, the fallbacks, and that a cold
 * instance can never save over persisted state it hasn't loaded.
 */
jest.mock('@/lib/db', () => ({
  hasDatabase: jest.fn(() => false),
  kvGet: jest.fn(),
  kvSet: jest.fn(),
}))

import { readJson, writeJson } from '../persist'
import { hasDatabase, kvGet, kvSet } from '@/lib/db'

const mockHasDatabase = hasDatabase as jest.Mock
const mockKvGet = kvGet as jest.Mock
const mockKvSet = kvSet as jest.Mock

afterEach(() => {
  mockHasDatabase.mockReturnValue(false)
  mockKvGet.mockReset()
  mockKvSet.mockReset()
})

describe('persist — fs backend (no DATABASE_URL)', () => {
  it('returns the fallback for a document that was never written', async () => {
    expect(await readJson('never-written-doc', { a: 1 })).toEqual({ a: 1 })
    expect(mockKvGet).not.toHaveBeenCalled()
  })
})

describe('persist — database backend', () => {
  beforeEach(() => mockHasDatabase.mockReturnValue(true))

  it('reads through the kv table', async () => {
    mockKvGet.mockResolvedValue([{ id: 'x' }])
    expect(await readJson('backlog', [])).toEqual([{ id: 'x' }])
    expect(mockKvGet).toHaveBeenCalledWith('backlog')
  })

  it('returns the fallback when the key has never been written', async () => {
    mockKvGet.mockResolvedValue(undefined)
    expect(await readJson('backlog', [])).toEqual([])
  })

  it('falls back (and never throws) when the database is unreachable', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockKvGet.mockRejectedValue(new Error('connection refused'))
    mockKvSet.mockRejectedValue(new Error('connection refused'))
    expect(await readJson('backlog', [])).toEqual([])
    await expect(writeJson('backlog', [{ id: 'x' }])).resolves.toBeUndefined()
    quiet.mockRestore()
  })

  it('writes through the kv table', async () => {
    mockKvSet.mockResolvedValue(undefined)
    await writeJson('backlog', [{ id: 'x' }])
    expect(mockKvSet).toHaveBeenCalledWith('backlog', [{ id: 'x' }])
  })
})

describe('store hydration on a cold instance', () => {
  it('loads persisted state before saving a mutation (never wipes unseen data)', async () => {
    jest.resetModules()
    jest.doMock('../persist', () => ({
      readJson: jest.fn(async (name: string, fallback: unknown) =>
        name === 'products'
          ? { overrides: { existing: { cost: 1 } }, removedIds: ['gone'], imported: [] }
          : fallback,
      ),
      writeJson: jest.fn(async () => undefined),
    }))

    const persist = require('../persist')
    const store = require('../store')
    await store.setProductOverride('new', { cost: 2 })

    // The saved document must contain the pre-existing persisted state merged
    // with the new mutation — a cold serverless instance starting from empty
    // memory must not overwrite founders' earlier edits.
    expect(persist.writeJson).toHaveBeenCalledWith(
      'products',
      expect.objectContaining({
        overrides: { existing: { cost: 1 }, new: { cost: 2 } },
        removedIds: ['gone'],
      }),
    )
    jest.dontMock('../persist')
  })
})
