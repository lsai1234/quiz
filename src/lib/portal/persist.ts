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
 *
 * Server-only. Anything that fails degrades to the caller's fallback value
 * rather than crashing, matching the old JSON-file behaviour.
 *
 * ── Why there is a cache in front of it now ─────────────────────────────────
 * This used to read through to the database on every call, on the stated
 * reasoning that every serverless instance should see the latest edits. That is
 * the right instinct and it was costing more than it looked, because of what is
 * behind one of these keys: `portal:products` holds *every imported product* as
 * a single JSON document. Measured against the mock product as a template, a
 * 600-product import is a 1.4MB row and a 1,500-product one is 3.5MB — and it
 * was being fetched and parsed again for every request that touches the
 * catalogue. That is most of the hub, plus the quiz, plus the card renderer.
 * Open one hub screen that fires five calls and the same megabytes crossed the
 * database connection five times.
 *
 * So reads are cached in the process for a few seconds, and a write refreshes
 * the entry it wrote. What that costs is bounded and small: an edit made on
 * another instance can be up to `CACHE_TTL_MS` stale, and the founder who made
 * it sees it immediately because their own write updated the cache in the
 * process that served it. `syncPortalRuntime` in `store.ts` has made exactly
 * this trade for the settings key since it was written; this extends it to the
 * key where the bytes actually are.
 *
 * The cache holds the stored *text*, not the parsed object, and every read
 * parses it. That is deliberate: several callers mutate what they read before
 * writing it back, and handing two of them the same object would let one see
 * the other's half-finished edit.
 */
import fs from 'fs'
import path from 'path'
import { kvGetRaw, kvSet } from '@/lib/db/kv'

const LEGACY_DATA_DIR = path.join(process.cwd(), '.data')
const KV_PREFIX = 'portal:'

/**
 * How long a read is reused. Short enough that a founder never has to wonder
 * whether the hub is showing them the truth, long enough to collapse the burst
 * of calls one screen makes into a single trip to the database.
 */
const CACHE_TTL_MS = 5_000

/** name → the stored JSON text, or null for "there is no row". */
const cache = new Map<string, { at: number; raw: string | null }>()

function cached(name: string): string | null | undefined {
  const hit = cache.get(name)
  if (!hit) return undefined
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(name)
    return undefined
  }
  return hit.raw
}

/** Drop everything cached. For tests, and for a caller that must not be stale. */
export function clearPersistCache(): void {
  cache.clear()
}

/** Migrate a legacy `.data/<name>.json` snapshot into the kv table, once. */
async function migrateLegacyFile<T>(name: string): Promise<T | undefined> {
  try {
    const raw = fs.readFileSync(path.join(LEGACY_DATA_DIR, `${name}.json`), 'utf8')
    const data = JSON.parse(raw) as T
    await kvSet(KV_PREFIX + name, data)
    cache.set(name, { at: Date.now(), raw: JSON.stringify(data) })
    return data
  } catch {
    return undefined
  }
}

/** Read a persisted value, returning `fallback` when missing or unreadable. */
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    let raw = cached(name)
    if (raw === undefined) {
      raw = await kvGetRaw(KV_PREFIX + name)
      cache.set(name, { at: Date.now(), raw })
    }

    if (raw !== null) {
      try {
        return JSON.parse(raw) as T
      } catch {
        return fallback
      }
    }

    // No row. A legacy snapshot may still be sitting on disk from before the
    // database existed; the migration writes it in and caches the result, so
    // this only reaches the filesystem once per process rather than per read.
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
    // The writer's own instance is never stale: whoever just saved an edit is
    // the person most likely to reload the screen a second later.
    cache.set(name, { at: Date.now(), raw: JSON.stringify(data) })
  } catch {
    /* unreachable database — keep the in-memory value, just don't persist */
    cache.delete(name)
  }
}
