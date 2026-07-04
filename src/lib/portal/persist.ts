/**
 * Key→JSON persistence for the Founders Hub.
 *
 * State that founders manage over time (product overrides, removed/imported
 * products, pricing overrides, the improvements backlog) is stored as named
 * JSON documents. Two backends sit behind the same `readJson` / `writeJson`
 * contract — callers never touch anything else:
 *
 * - **Postgres (Neon)** when `DATABASE_URL` is set — the `kv` table via
 *   `@/lib/db`. The durable production path: serverless hosts (Vercel) have an
 *   ephemeral filesystem, so files can't be trusted there.
 * - **JSON files** under `.data/` at the project root otherwise — local dev
 *   and mock mode, no database needed.
 *
 * Both degrade gracefully rather than crash: a failed read returns `fallback`,
 * a failed write keeps the caller's in-memory value (database errors are
 * logged; they matter more than a read-only local fs). Server-only (node fs).
 */
import fs from 'fs'
import path from 'path'
import { hasDatabase, kvGet, kvSet } from '@/lib/db'

const DATA_DIR = path.join(process.cwd(), '.data')

function fileFor(name: string): string {
  return path.join(DATA_DIR, `${name}.json`)
}

/** Read a JSON document, returning `fallback` when missing or unreadable. */
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  if (hasDatabase()) {
    try {
      const value = await kvGet<T>(name)
      return value === undefined ? fallback : value
    } catch (err) {
      console.error(`[persist] database read failed for "${name}":`, err)
      return fallback
    }
  }
  try {
    const raw = fs.readFileSync(fileFor(name), 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Write a JSON document. Best-effort (never throws). */
export async function writeJson<T>(name: string, data: T): Promise<void> {
  if (hasDatabase()) {
    try {
      await kvSet(name, data)
    } catch (err) {
      console.error(`[persist] database write failed for "${name}":`, err)
    }
    return
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(fileFor(name), JSON.stringify(data, null, 2), 'utf8')
  } catch {
    /* read-only fs / sandbox — keep the in-memory value, just don't persist */
  }
}
