/**
 * The local SQLite file has to be openable in a fresh clone.
 *
 * `.data/` is git-ignored, so it does not exist until something makes it, and
 * better-sqlite3 refuses to create a database inside a directory that isn't
 * there. The directory used to be created only on the DEFAULT path, so setting
 * `DATABASE_PATH` — which the e2e suite does, to keep its run off the dev
 * database — pointed the engine at a directory nothing had made. Every
 * database-backed journey then failed on a clean checkout, each one reporting a
 * missing button rather than a missing folder.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

describe('sqlite database path', () => {
  const created: string[] = []

  afterEach(() => {
    delete process.env.DATABASE_PATH
    jest.resetModules()
    for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('creates the parent directory of an explicit DATABASE_PATH', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chrgd-db-'))
    created.push(root)
    // A directory that does not exist yet — the fresh-clone case.
    const file = path.join(root, 'nested', 'e2e.db')
    expect(fs.existsSync(path.dirname(file))).toBe(false)

    process.env.DATABASE_PATH = file
    const { createSqliteEngine } = await import('../sqlite-engine')
    const engine = createSqliteEngine()

    expect(fs.existsSync(file)).toBe(true)
    // And it is a working, migrated database, not just a file.
    await engine.run("INSERT INTO kv (key, value, updated_at) VALUES ('k', '1', 'now')")
    expect(await engine.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', ['k'])).toEqual({
      value: '1',
    })
  })

  it('still creates the default .data directory when DATABASE_PATH is unset', async () => {
    delete process.env.DATABASE_PATH
    const { createSqliteEngine } = await import('../sqlite-engine')
    expect(() => createSqliteEngine()).not.toThrow()
    expect(fs.existsSync(path.join(process.cwd(), '.data'))).toBe(true)
  })

  it('does not try to make a directory for an in-memory database', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { createSqliteEngine } = await import('../sqlite-engine')
    const engine = createSqliteEngine()
    expect(fs.existsSync(path.join(process.cwd(), ':memory:'))).toBe(false)
    await engine.run("INSERT INTO kv (key, value, updated_at) VALUES ('k', '1', 'now')")
    expect(await engine.get('SELECT value FROM kv WHERE key = ?', ['k'])).toBeTruthy()
  })
})
