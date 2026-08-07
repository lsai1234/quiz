/**
 * Persistent cache of PowerBody product detail.
 *
 * `getProductInfo` is one call per product and is the only source of name,
 * brand, image and description. With the transport now throttled (see
 * `soap.ts`), fetching detail for a few thousand products cannot be done inside
 * one request — so it is fetched ONCE per product and kept, rather than being
 * re-fetched every time an in-memory cache expires or a serverless instance
 * goes cold.
 *
 * Only the descriptive fields are trusted from here. Price, stock and VAT are
 * always overlaid from the live list feed on read (see `live.ts`), so a cached
 * entry can never serve a stale price — which is the one thing a cache like
 * this must not do.
 *
 * Entries carry a fetch timestamp and expire, so a product that is renamed,
 * rephotographed or discontinued eventually refreshes rather than being frozen
 * forever.
 */
import type { PbProductInfo } from './wire'

/** How long a cached detail record is trusted before it is fetched again. */
export const DETAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000

const KV_KEY = 'powerbody:product-detail'

export interface DetailEntry {
  info: PbProductInfo
  /** Epoch ms. */
  at: number
}

/** Keyed by PowerBody's numeric product id — what `getProductInfo` takes. */
export type DetailMap = Record<string, DetailEntry>

export interface DetailStore {
  load(): Promise<DetailMap>
  save(map: DetailMap): Promise<void>
}

/** True when an entry is missing or old enough to be worth re-fetching. */
export function isStale(entry: DetailEntry | undefined, now = Date.now()): boolean {
  return !entry || now - entry.at >= DETAIL_TTL_MS
}

/**
 * The database-backed store. Kept behind an interface so the adapter can be
 * tested without a database, and so this is the only place that knows the key.
 *
 * Best-effort in both directions: a cache that cannot be read or written must
 * degrade to "fetch it again", never fail the catalogue.
 */
export function createKvDetailStore(): DetailStore {
  return {
    async load(): Promise<DetailMap> {
      try {
        const { kvGet } = await import('@/lib/db/kv')
        return (await kvGet<DetailMap>(KV_KEY)) ?? {}
      } catch {
        return {}
      }
    },
    async save(map: DetailMap): Promise<void> {
      try {
        const { kvSet } = await import('@/lib/db/kv')
        await kvSet(KV_KEY, map)
      } catch {
        /* unreachable database — the work still counts for this request */
      }
    },
  }
}

/** An in-memory store, for tests and for callers that want no persistence. */
export function createMemoryDetailStore(initial: DetailMap = {}): DetailStore {
  let map: DetailMap = { ...initial }
  return {
    async load() {
      return map
    },
    async save(next) {
      map = next
    },
  }
}
