/**
 * SQLite engine — better-sqlite3 behind the async SqlEngine surface.
 * The zero-config local default: file at `.data/chrgd.db` (DATABASE_PATH
 * overrides; tests use `:memory:`). Migrations tracked via PRAGMA user_version.
 */
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { MIGRATIONS } from './migrations'
import type { SqlEngine } from './engine'

function databasePath(): string {
  const configured = process.env.DATABASE_PATH
  const file = configured || path.join(process.cwd(), '.data', 'chrgd.db')
  // `.data/` is git-ignored, so it does not exist in a fresh clone and
  // better-sqlite3 fails to open a file inside it rather than creating it. The
  // directory used to be created only on the default path, which meant setting
  // DATABASE_PATH — as the e2e suite does (`.data/e2e.db`) — moved the database
  // somewhere nothing had made, and every database-backed journey failed on a
  // clean checkout for a reason that pointed at the journey.
  // `:memory:` (and its URI forms) name no directory; tests use it.
  if (!file.startsWith(':memory:') && !file.startsWith('file::memory:')) {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  }
  return file
}

export function createSqliteEngine(): SqlEngine {
  const db = new Database(databasePath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const version = db.pragma('user_version', { simple: true }) as number
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }

  return {
    kind: 'sqlite',
    async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      return db.prepare(sql).get(...params) as T | undefined
    },
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[]
    },
    async run(sql: string, params: unknown[] = []): Promise<void> {
      db.prepare(sql).run(...params)
    },
  }
}
