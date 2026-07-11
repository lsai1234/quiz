/**
 * Founders Hub persistence — now backed by the app database.
 *
 * State that founders manage over time (product overrides, removed/imported
 * products, the improvements backlog) lives in the SQLite `kv` table
 * (`src/lib/db/`), keyed by the same names as the legacy `.data/*.json` files.
 * A legacy JSON snapshot, if present, is migrated into the database the first
 * time its key is read, so existing local edits survive the upgrade.
 *
 * Callers only ever touch `readJson` / `writeJson` — this stays the single
 * seam for the storage engine (SQLite today, Postgres later via `src/lib/db`).
 *
 * Server-only. Reads/writes are synchronous (the portal store hydrates at
 * module load); anything that fails degrades to the in-memory value rather
 * than crashing, matching the old JSON-file behaviour.
 */
import fs from 'fs'
import path from 'path'
import { kvGet, kvSet, kvHas } from '@/lib/db/kv'

const LEGACY_DATA_DIR = path.join(process.cwd(), '.data')
const KV_PREFIX = 'portal:'

/** Migrate a legacy `.data/<name>.json` snapshot into the kv table, once. */
function migrateLegacyFile<T>(name: string): T | undefined {
  try {
    const raw = fs.readFileSync(path.join(LEGACY_DATA_DIR, `${name}.json`), 'utf8')
    const data = JSON.parse(raw) as T
    kvSet(KV_PREFIX + name, data)
    return data
  } catch {
    return undefined
  }
}

/** Read a persisted value, returning `fallback` when missing or unreadable. */
export function readJson<T>(name: string, fallback: T): T {
  try {
    if (kvHas(KV_PREFIX + name)) {
      const stored = kvGet<T>(KV_PREFIX + name)
      if (stored !== undefined) return stored
    }
    const migrated = migrateLegacyFile<T>(name)
    return migrated !== undefined ? migrated : fallback
  } catch {
    return fallback
  }
}

/** Persist a value. Best-effort (never throws). */
export function writeJson<T>(name: string, data: T): void {
  try {
    kvSet(KV_PREFIX + name, data)
  } catch {
    /* read-only fs / sandbox — keep the in-memory value, just don't persist */
  }
}
