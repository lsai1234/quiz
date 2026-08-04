/**
 * Founders Hub persistence — backed by the app database.
 *
 * State that founders manage over time (product overrides, removed/imported
 * products, the top-25 quiz roster, runtime settings) lives in the `kv`
 * table (`src/lib/db/`), keyed by the same names as the legacy `.data/*.json`
 * files. A legacy JSON snapshot, if present locally, is migrated into the
 * database the first time its key is read, so existing local edits survive
 * the upgrade.
 *
 * Callers only ever touch `readJson` / `writeJson` — this stays the single
 * seam for the storage engine (SQLite locally, Postgres on serverless).
 * Async because Postgres is; reads always hit the database rather than a
 * module cache, so every serverless instance sees the latest edits.
 *
 * Server-only. Anything that fails degrades to the caller's fallback value
 * rather than crashing, matching the old JSON-file behaviour.
 */
import fs from 'fs'
import path from 'path'
import { kvGet, kvSet, kvHas } from '@/lib/db/kv'

const LEGACY_DATA_DIR = path.join(process.cwd(), '.data')
const KV_PREFIX = 'portal:'

/** Migrate a legacy `.data/<name>.json` snapshot into the kv table, once. */
async function migrateLegacyFile<T>(name: string): Promise<T | undefined> {
  try {
    const raw = fs.readFileSync(path.join(LEGACY_DATA_DIR, `${name}.json`), 'utf8')
    const data = JSON.parse(raw) as T
    await kvSet(KV_PREFIX + name, data)
    return data
  } catch {
    return undefined
  }
}

/** Read a persisted value, returning `fallback` when missing or unreadable. */
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    if (await kvHas(KV_PREFIX + name)) {
      const stored = await kvGet<T>(KV_PREFIX + name)
      if (stored !== undefined) return stored
    }
    const migrated = await migrateLegacyFile<T>(name)
    return migrated !== undefined ? migrated : fallback
  } catch {
    return fallback
  }
}

/** Persist a value. Best-effort (never throws). */
export async function writeJson<T>(name: string, data: T): Promise<void> {
  try {
    await kvSet(KV_PREFIX + name, data)
  } catch {
    /* unreachable database — keep the in-memory value, just don't persist */
  }
}
