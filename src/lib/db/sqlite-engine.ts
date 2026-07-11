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
  if (configured) return configured
  const dir = path.join(process.cwd(), '.data')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'chrgd.db')
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
