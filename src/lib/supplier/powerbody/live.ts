/**
 * Live PowerBody supplier adapter.
 *
 * Implements the same `SupplierProvider` interface the mock does, over the SOAP
 * client in `./soap.ts`, so nothing outside this folder knows which one it is
 * talking to. Flip to it with `SUPPLIER_SOURCE=powerbody` (or the Founders Hub
 * Settings → Supplier toggle) once the credentials below are set.
 *
 * Two things shape the design:
 *
 *  1. **The feed is split in two, and only one half is affordable in bulk.**
 *     `getProductList` is cheap, paged, and carries sku/price/qty — everything a
 *     stock-and-price refresh needs. `getProductInfo` is one call *per product*
 *     and is the only source of name, brand, image and description, so detailing
 *     a whole catalogue is thousands of throttled calls: minutes of work that no
 *     request can wait for.
 *
 *     So nothing here pulls a catalogue through. `getStockLevels()` uses the
 *     cheap call alone, and `getProductsBySku()` — the only thing that calls
 *     `getProductInfo` — fetches full detail for the handful of SKUs actually
 *     being imported. Detail is cached durably, so a product is fetched once.
 *
 *  2. **Placing an order is not idempotent.** `createOrder` errors on a repeat,
 *     so our own order id goes in as `id` and `ALREADY_EXISTS` is read as
 *     success — see `readOrderAck` in ./wire.ts.
 *
 * Server-only.
 */
import type {
  SupplierOrder,
  SupplierOrderInput,
  SupplierOrderResult,
  SupplierShippingMethod,
  SupplierProduct,
  SupplierFeed,
  SupplierFeedOptions,
  SupplierProvider,
  SupplierStockLevel,
} from '../types'
import { createSoapClient, type PowerBodySoapClient } from './soap'
import { partitionBySkuMap } from '../product-id-map'
import { createKvDetailStore, isStale, type DetailStore } from './detail-cache'
import {
  readOrderAck,
  toCreateOrderPayload,
  toStockLevel,
  toSupplierOrder,
  toSupplierProduct,
  type CreateOrderContext,
  type PbOrder,
  type PbOrderResponse,
  type PbProductInfo,
  type PbProductListItem,
} from './wire'

/** Their list feed is paged; stop when a page comes back empty. The cap is a
 *  guard against a feed that never returns an empty page, not a real limit. */
const MAX_PAGES = 200

/** In-flight `getProductInfo` calls we queue up. The transport is what actually
 *  paces them (see `soap.ts`); this only bounds how many promises exist at once. */
const DETAIL_CONCURRENCY = 6

/**
 * Wall-clock budget for one SKU lookup.
 *
 * Resolving a SKU means paging the cheap feed to find its product id, then one
 * detail call — quick, normally. This is the backstop for when it is not: a
 * single wire call can hang for over two minutes on its own (30s per attempt,
 * retried four times), and a request that outlives its own timeout is delivered
 * to nobody. When the clock is spent we stop waiting and say so.
 *
 * Keep this comfortably under the route's `maxDuration`.
 */
const DEFAULT_BUILD_DEADLINE_MS = 20_000

/**
 * The budget one list build actually gets, for anything that needs to explain
 * itself afterwards.
 *
 * `sampleSkus` and the rest hand back whatever pages landed before the clock
 * ran out, so "no products" and "we stopped waiting" arrive as the same empty
 * array. The diagnostics screen tells them apart by comparing how long the call
 * took against this — a distinction worth drawing, because one of them is fixed
 * by raising `POWERBODY_BUILD_DEADLINE_MS` and the other is not.
 */
export function buildDeadlineMs(): number {
  return envInt('POWERBODY_BUILD_DEADLINE_MS', DEFAULT_BUILD_DEADLINE_MS)
}

/**
 * How long the SKU → list-row index is reused.
 *
 * Looking up three SKUs and then adding them is two requests that need the same
 * mapping, and re-paging a long feed for the second is several throttled calls
 * to save none. Prices and stock come from the same rows, so this doubles as
 * how stale a looked-up row may be.
 */
const LIST_INDEX_TTL_MS = 10 * 60 * 1000

/** The list rows the last paging run read, by SKU. */
let listIndex: { at: number; bySku: Map<string, PbProductListItem> } | null = null

function rememberListItems(items: PbProductListItem[]): void {
  const bySku = new Map<string, PbProductListItem>()
  for (const item of items) {
    const sku = String(item.sku ?? '')
    if (sku !== '') bySku.set(sku, item)
  }
  listIndex = { at: Date.now(), bySku }
}

/** Drop the cached SKU index (tests, and after an explicit resync). */
export function __resetPowerBodyCache(): void {
  listIndex = null
}

/**
 * Resolve as soon as `work` settles — or give up at `deadline` and resolve null.
 *
 * Checking the clock between calls is not enough on its own: one wire call can
 * outlast the whole budget by itself (the transport allows 30s per attempt and
 * retries a timeout four times), which is exactly the case that leaves a request
 * hanging for minutes. The call in flight cannot be cancelled from here, but
 * nothing good comes of waiting for an answer nobody is going to see — it is
 * dropped, and whatever was finished by then is used instead.
 *
 * A rejection still propagates when it arrives before the deadline, so a real
 * failure (bad credentials, a fault) is reported rather than timed out.
 */
function untilDeadline<T>(work: Promise<T>, deadline: number): Promise<T | null> {
  const remaining = deadline - Date.now()
  if (remaining <= 0) return Promise.resolve(null)
  return new Promise<T | null>((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), remaining)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/** Run `worker` over `items` with a bounded number in flight. */
async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return results
}

export interface PowerBodyProviderOptions {
  /** Injected by tests; otherwise built from the environment. */
  client?: PowerBodySoapClient
  /** Where fetched product detail is kept between requests. */
  detailStore?: DetailStore
  /** Wall-clock budget for one `listProducts()` or `getProductsBySku()` call, in ms. */
  buildDeadlineMs?: number
  /** Extra fields for `createOrder` that only the caller knows (weight, our
   *  shipping charge, per-line prices for their invoice). */
  orderContext?: (order: SupplierOrderInput) => CreateOrderContext
}

export function createPowerBodyProvider(options: PowerBodyProviderOptions = {}): SupplierProvider {
  const client = options.client ?? clientFromEnv()
  const detailStore = options.detailStore ?? createKvDetailStore()
  const buildDeadlineMs =
    options.buildDeadlineMs ?? envInt('POWERBODY_BUILD_DEADLINE_MS', DEFAULT_BUILD_DEADLINE_MS)

  interface ListFeedOptions {
    /** Epoch ms to stop paging at, returning what has been read so far. */
    deadline?: number
    /** Checked after each page — true means we already have what we came for. */
    enough?: (rowsSoFar: PbProductListItem[]) => boolean
    /** Rows are appended here as they arrive, so a caller that stops waiting can
     *  still use the pages that did land. */
    into?: PbProductListItem[]
    /** First page to read. Lets a caller resume where a previous read stopped
     *  instead of starting the whole feed again. */
    fromPage?: number
    /** Pages this call may read before handing back. Defaults to `MAX_PAGES`. */
    pageBudget?: number
  }

  interface ListFeed {
    items: PbProductListItem[]
    /** False when we stopped early (deadline or page budget) rather than
     *  reaching the end of the feed. */
    complete: boolean
    /** Pages actually read by this call. */
    pages: number
    /** The page to resume from when `complete` is false; null when the feed
     *  ended. This is what turns a short read from a dead end into a pause. */
    nextPage: number | null
  }

  /** Page through `getProductList` until a page comes back empty — or until the
   *  caller has enough, or the clock runs out. */
  async function fetchListItems(listOptions: ListFeedOptions = {}): Promise<ListFeed> {
    const all: PbProductListItem[] = listOptions.into ?? []
    const first = Math.max(1, listOptions.fromPage ?? 1)
    const budget = Math.max(1, listOptions.pageBudget ?? MAX_PAGES)
    let read = 0
    for (let page = first; page < first + budget; page++) {
      const rows = await client.call<PbProductListItem[] | null>('dropshipping.getProductList', { page })
      read += 1
      // An empty page is the feed's own full stop — the only signal it gives
      // that there is nothing after this.
      if (!Array.isArray(rows) || rows.length === 0) return { items: all, complete: true, pages: read, nextPage: null }
      all.push(...rows)
      if (listOptions.enough?.(all)) return { items: all, complete: true, pages: read, nextPage: null }
      if (listOptions.deadline !== undefined && Date.now() >= listOptions.deadline) {
        return { items: all, complete: false, pages: read, nextPage: page + 1 }
      }
    }
    // Out of budget rather than out of feed. `nextPage` is what makes that a
    // pause the caller can resume from instead of a silent ceiling.
    return { items: all, complete: false, pages: read, nextPage: first + budget }
  }

  /**
   * The fields only `getProductInfo` carries. One of them has to be present for
   * a reply to be product detail rather than an echo, an empty object or an
   * error envelope — all of which are objects, and accepting them as detail is
   * what produced products that "answered" but had no name.
   */
  const DETAIL_FIELDS = ['name', 'manufacturer', 'category', 'detail_price', 'description_en', 'image'] as const

  /** True when this record actually carries the descriptive half. */
  function carriesDetail(info: PbProductInfo | undefined | null): boolean {
    if (!info || typeof info !== 'object') return false
    const row = info as Record<string, unknown>
    return DETAIL_FIELDS.some((field) => {
      const v = row[field]
      return v !== undefined && v !== null && v !== ''
    })
  }

  /**
   * A cached entry worth using: present, unexpired, and actually detail.
   *
   * The last clause is what stops a bad run poisoning the cache for a week. An
   * earlier version stored whatever came back, so an account answering
   * `getProductInfo` with an empty record filled the cache with entries that
   * showed no name and — because they were not stale — were never re-fetched.
   * Treating them as absent means the cache heals itself the next time someone
   * presses Details, with no purge and no deploy.
   */
  function usableEntry(id: string, cache: Record<string, { info: PbProductInfo; at: number }>, now: number) {
    const entry = cache[id]
    return entry && !isStale(entry, now) && carriesDetail(entry.info) ? entry : null
  }

  /** A `getProductInfo` reply, if it actually looks like one. Magento wraps
   *  single results in an array as readily as it returns them bare. */
  function readInfo(reply: unknown): PbProductInfo | null {
    const value = Array.isArray(reply) ? reply[0] : reply
    if (!value || typeof value !== 'object') return null
    return carriesDetail(value as PbProductInfo) ? (value as PbProductInfo) : null
  }

  /**
   * PowerBody's own error text, when the reply is one of their envelopes.
   *
   * `api_response` is the field they answer `createOrder` with, and a
   * `getProductInfo` reply carrying it plus `status`/`time`/`ip` is not product
   * detail — it is them telling us why they said no. Reporting that verbatim is
   * strictly better than any cause we could infer from the shape.
   */
  function readApiResponse(reply: unknown): string | null {
    const value = Array.isArray(reply) ? reply[0] : reply
    if (!value || typeof value !== 'object') return null
    const row = value as Record<string, unknown>
    const said = row.api_response ?? row.message ?? row.error
    const text = typeof said === 'string' ? said.trim() : ''
    return text === '' ? null : text
  }

  /** What came back, trimmed to something a person can read in an error. */
  function describeReply(reply: unknown): string {
    const value = Array.isArray(reply) ? reply[0] : reply
    if (value === null || value === undefined) return 'nothing'
    if (typeof value === 'object') {
      const keys = Object.keys(value as object)
      if (keys.length === 0) return 'an empty record'
      return `a record with only: ${keys.slice(0, 12).join(', ')}${keys.length > 12 ? '…' : ''}`
    }
    return JSON.stringify(value)?.slice(0, 120) ?? String(value)
  }

  /**
   * Detail for one product id.
   *
   * Two things here are deliberate.
   *
   * **The bare id goes first, because that is what their guide documents.**
   * Page 11: "getProductInfo – acquiring information for a single product.
   * Parameters: (int) product id", with the example
   * `$client->call($session, 'dropshipping.getProductInfo', $productId)` —
   * a raw id, not a JSON object. It is the one method here that does not take
   * a JSON string, which is easy to miss because every other one does.
   *
   * This used to try `{product_id}` first, reasoning by analogy with
   * `getProductList`'s `{page}`. That reasoning was wrong, and it cost a
   * wasted call on a rate-limited API for EVERY product fetched — the
   * documented shape was only ever reached as the fallback. The named form is
   * kept as the fallback because it costs nothing when the first call works,
   * and the failure it guards against — every product silently unnamed — is
   * far worse than one extra request on an account that wants the other shape.
   *
   * **Errors are NOT swallowed.** This is only ever called because someone asked
   * for this exact product, so "PowerBody said X" has to reach them. Returning
   * null on a fault is what made a broken detail call look like a page that
   * simply would not fill in.
   */
  async function fetchDetail(id: string): Promise<PbProductInfo> {
    let firstFailure: unknown = null
    let lastReply: unknown = undefined
    for (const args of [id, { product_id: id }]) {
      try {
        const reply = await client.call<unknown>('dropshipping.getProductInfo', args)
        const info = readInfo(reply)
        if (info) return info
        lastReply = reply
      } catch (err) {
        firstFailure ??= err
      }
    }
    if (firstFailure) throw firstFailure
    // Say what they actually sent. Guessing at this from the outside is what
    // cost a round of "it still doesn't work" — the reply is the diagnosis.
    if (lastReply !== undefined) {
      // Their own words first, when they gave any. A reply carrying
      // `api_response` is PowerBody's error envelope — the same field
      // `createOrder` answers with — so it says WHY, and quoting it beats
      // guessing at a cause. Leading with the sandbox theory sent a real
      // investigation down the wrong path for an afternoon: the account was
      // fine and the call was being refused for another reason entirely.
      const said = readApiResponse(lastReply)
      if (said) {
        throw new Error(
          `PowerBody refused the detail call for product ${id}: "${said}". That is their own message — ` +
            'it is usually rate limiting or a permission on the API account, not a missing product.',
        )
      }
      throw new Error(
        `PowerBody answered for product ${id} with no product detail in it — they sent ${describeReply(lastReply)}. ` +
          'getProductInfo may not be enabled on this API account (new accounts start in their DEMO sandbox).',
      )
    }
    throw new Error(`PowerBody returned no details for product ${id}.`)
  }

  const idOf = (item: PbProductListItem): string =>
    item.product_id === undefined || item.product_id === null ? '' : String(item.product_id)

  function matchesFromIndex(wanted: Set<string>): PbProductListItem[] {
    if (!listIndex || Date.now() - listIndex.at >= LIST_INDEX_TTL_MS) return []
    const hits: PbProductListItem[] = []
    for (const sku of wanted) {
      const item = listIndex.bySku.get(sku)
      if (!item) return []
      hits.push(item)
    }
    return hits
  }

  async function getProductsBySku(skus: string[]): Promise<SupplierProduct[]> {
    const asked = skus.filter(Boolean)
    if (asked.length === 0) return []

    // ── The committed id map goes first ────────────────────────────────────
    // A SKU we already know the id for needs no search at all: straight to the
    // detail call, one throttled request, no paging and nothing that can time
    // out. This is the only route to a product past the feed's 3,000-item
    // ceiling, because there the walk cannot find the row however long it runs.
    // See `product-id-map.ts` and `scripts/backfill-product-ids.ts`.
    const { mapped, unmapped } = partitionBySkuMap(asked)
    const fromMap = mapped.length > 0 ? await getProductsById(mapped.map((m) => String(m.productId))) : []
    // Verified, not assumed: a mapped id is only accepted when the product it
    // returns actually carries the SKU we asked for. A stale entry then costs a
    // wasted call and falls back to the feed, instead of quietly importing
    // somebody else's product under our SKU.
    const askedSet = new Set(asked)
    const verified = fromMap.filter((p) => askedSet.has(p.sku))
    const stillMissing = asked.filter((sku) => !verified.some((p) => p.sku === sku))

    if (stillMissing.length === 0) return verified
    // Anything the map could not answer for — or answered wrongly — falls
    // through to the feed exactly as before.
    const wanted = new Set(stillMissing)

    const deadline = Date.now() + buildDeadlineMs
    let matches = matchesFromIndex(wanted)

    if (matches.length === 0) {
      // Paging is not cut short here the way a catalogue build is: a SKU that
      // exists but sits on a later page must be findable, and "not in the feed"
      // has to mean it. It does stop as soon as every requested SKU has turned
      // up, so the common case — a handful of known codes — costs a page or two
      // rather than the whole feed. The clock only decides when to stop
      // *waiting*, and running out of it is an error, never a silent "no such
      // SKU".
      const countMatches = (rows: PbProductListItem[]) =>
        rows.reduce((n, item) => (wanted.has(String(item.sku ?? '')) ? n + 1 : n), 0)
      const listing = await untilDeadline(
        fetchListItems({ enough: (rows) => countMatches(rows) >= wanted.size }),
        deadline,
      )
      if (!listing) {
        throw new Error(
          `PowerBody did not answer within ${Math.round(buildDeadlineMs / 1000)}s, so these SKUs could not be ` +
            'checked. Their feed may be slow or rate-limiting us — try again in a moment.',
        )
      }
      rememberListItems(listing.items)
      matches = listing.items.filter((item) => wanted.has(String(item.sku ?? '')))
    }
    if (matches.length === 0) return verified

    const cache = await detailStore.load()
    const now = Date.now()
    // `usableEntry`, not `isStale`: an entry cached from a reply that carried no
    // detail must be re-fetched, or a single bad run means seven days of a row
    // that quietly refuses to fill in.
    const missing = matches.map(idOf).filter((id) => id !== '' && !usableEntry(id, cache, now))

    // A product with no id in the list row can never be detailed — say so rather
    // than returning a nameless row and letting it look like a failed fetch.
    if (missing.length === 0 && matches.some((item) => idOf(item) === '')) {
      throw new Error(
        'PowerBody sent these products without a product id, so their details cannot be fetched. ' +
          'The list feed may have changed shape.',
      )
    }

    const failures: unknown[] = []
    const fetched = await mapLimit(missing, DETAIL_CONCURRENCY, async (id) => {
      try {
        return { id, info: await fetchDetail(id) }
      } catch (err) {
        // Collected rather than thrown: one unreadable product in a batch of
        // fifty should not lose the other forty-nine.
        failures.push(err)
        return { id, info: null }
      }
    })

    let added = 0
    for (const { id, info } of fetched) {
      if (!info) continue
      cache[id] = { info, at: now }
      added += 1
    }
    if (added > 0) await detailStore.save(cache)

    // Nothing at all came back and something went wrong: report the supplier's
    // own words. Answering with nameless rows here is what turned a broken
    // detail call into a page that just would not fill in.
    if (added === 0 && failures.length > 0) throw failures[0]

    const updatedAt = new Date().toISOString()
    const fromFeed = matches.map((item) => {
      const entry = usableEntry(idOf(item), cache, now)
      // Fresh list row on top: cached detail must never supply today's price
      // or stock.
      return toSupplierProduct(entry ? { ...entry.info, ...item } : item, updatedAt)
    })
    return [...verified, ...fromFeed]
  }

  /**
   * Products by PowerBody product id — the detail call, with no search in front.
   *
   * `getProductsBySku` spends most of its time and all of its risk on the half
   * that turns a SKU into a product id: paging the cheap feed. This skips that
   * entirely, so it is one throttled `getProductInfo` per id, no paging, and
   * nothing that can exhaust the build deadline.
   *
   * DETAIL IS RE-FETCHED, NOT SERVED FROM CACHE
   * ───────────────────────────────────────────
   * The SKU path is free to trust the 7-day detail cache because it overlays
   * the fresh list row on top, so price and stock always come from today. Here
   * there is no list row — `getProductInfo` is the only source of every field —
   * so reading a cached entry would hand back a price and a stock level up to a
   * week old, which is the one thing that cache must never do. The call is made
   * every time and the answer refreshes the cache for everyone else.
   *
   * Ids that answer with no product in them are dropped, so the caller can
   * report exactly which did not resolve. If NOTHING resolved and something
   * failed, the supplier's own words are thrown rather than an empty result —
   * "PowerBody refused" and "no such product" must not look the same.
   */
  async function getProductsById(productIds: string[]): Promise<SupplierProduct[]> {
    const ids = [...new Set(productIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
    if (ids.length === 0) return []

    const failures: unknown[] = []
    const fetched = await mapLimit(ids, DETAIL_CONCURRENCY, async (id) => {
      try {
        return { id, info: await fetchDetail(id) }
      } catch (err) {
        // Collected, not thrown: one unreadable id in a batch must not lose the
        // rest — the same rule the SKU path follows.
        failures.push(err)
        return { id, info: null }
      }
    })

    const resolved = fetched.filter((f): f is { id: string; info: PbProductInfo } => f.info !== null)
    if (resolved.length === 0) {
      if (failures.length > 0) throw failures[0]
      return []
    }

    // Refresh the shared cache with what we just paid for, so a later SKU
    // lookup of the same product costs no detail call.
    const cache = await detailStore.load()
    const now = Date.now()
    for (const { id, info } of resolved) cache[id] = { info, at: now }
    await detailStore.save(cache)

    const updatedAt = new Date().toISOString()
    return resolved.map(({ id, info }) =>
      // Their reply does not always echo the id back, and the whole point of
      // this path is that the caller already knows it — so it is put back on
      // rather than left null.
      toSupplierProduct({ ...info, product_id: info.product_id ?? id }, updatedAt),
    )
  }

  /**
   * Read the whole feed, and say whether it really was the whole feed.
   *
   * `complete` is not decoration. The export exists to answer "what does this
   * account NOT carry?", and a short read answers that wrongly while looking
   * identical to a right answer: every SKU on the pages we never reached reads
   * as absent. Someone then strikes real products off a roster because of it.
   * So the pager's own verdict is carried out rather than dropped on the floor,
   * which is what `getStockLevels` used to do with it.
   */
  async function readFeed(options: SupplierFeedOptions = {}): Promise<SupplierFeed> {
    const { items, complete, pages, nextPage } = await fetchListItems({
      fromPage: options.fromPage,
      pageBudget: options.pageBudget,
    })
    const updatedAt = new Date().toISOString()
    return {
      levels: items.map((item) => toStockLevel(item, updatedAt)).filter((level) => level.sku !== ''),
      complete,
      pages,
      nextPage,
    }
  }

  /**
   * A handful of SKUs that exist, so you have something to type into the box.
   *
   * Deliberately not a catalogue: no detail is fetched, nothing is named, and it
   * stops as soon as it has `limit` codes. Importing goes by SKU precisely
   * because pulling a browsable feed through is not worth what it costs — but
   * that leaves nowhere to find a code when you have not got one to hand,
   * particularly on a sandbox account whose products exist only in the API.
   * This is that, and nothing more.
   */
  async function sampleSkus(limit: number): Promise<string[]> {
    const wanted = Math.max(1, Math.min(limit, 200))
    const deadline = Date.now() + buildDeadlineMs
    const collected: PbProductListItem[] = []
    const listing = await untilDeadline(
      fetchListItems({
        deadline,
        into: collected,
        enough: (rows) => rows.filter((r) => String(r.sku ?? '') !== '').length >= wanted,
      }),
      deadline,
    )
    const items = listing?.items ?? collected
    // Whatever we read is worth keeping — a lookup straight after this then
    // costs no paging at all.
    if (items.length > 0) rememberListItems(items)
    return items
      .map((item) => String(item.sku ?? ''))
      .filter((sku) => sku !== '')
      .slice(0, wanted)
  }

  return {
    name: 'powerbody',

    async getProduct(sku: string): Promise<SupplierProduct | null> {
      const [found] = await getProductsBySku([sku])
      return found ?? null
    },

    getProductsBySku,

    getProductsById,

    sampleSkus,

    async getStockLevels(skus?: string[]): Promise<SupplierStockLevel[]> {
      // Always live — this is the call the daily check exists to make.
      const { levels } = await readFeed()
      const wanted = skus && skus.length > 0 ? new Set(skus) : null
      return wanted ? levels.filter((level) => wanted.has(level.sku)) : levels
    },

    getFeed: readFeed,

    /**
     * Ask what delivery services this account has.
     *
     * Their guide documents the call and not its reply, so the shape is read
     * defensively: an array of rows, an object keyed by code, or an empty
     * answer, which is what an account with a single service looks like.
     */
    async shippingMethods(): Promise<SupplierShippingMethod[]> {
      const reply = await client.call<unknown>('dropshipping.getShippingMethod', '')
      const rows: unknown[] = Array.isArray(reply)
        ? reply
        : reply && typeof reply === 'object'
          ? Object.entries(reply as Record<string, unknown>).map(([code, value]) =>
              value && typeof value === 'object' ? { code, ...(value as object) } : { code, name: String(value) },
            )
          : []
      return rows.flatMap((row) => {
        if (!row || typeof row !== 'object') return []
        const r = row as Record<string, unknown>
        const code = String(r.code ?? r.transport_code ?? r.id ?? '').trim()
        if (!code) return []
        const price = r.price ?? r.cost ?? null
        return [{
          code,
          name: String(r.name ?? r.title ?? r.label ?? code),
          price: price == null || price === '' ? null : Number(price) || 0,
        }]
      })
    },

    async placeOrder(order: SupplierOrderInput): Promise<SupplierOrderResult> {
      const payload = toCreateOrderPayload(order, options.orderContext?.(order) ?? {})
      const response = await client.call<PbOrderResponse | null>('dropshipping.createOrder', payload)
      const ack = readOrderAck(response)
      if (!ack.ok) {
        throw new Error(
          `PowerBody rejected order ${order.reference}: ${ack.response}. ` +
            'Nothing has shipped — fix the order and send it again.',
        )
      }
      // They answer with a status but not always their own order id; our
      // reference is the durable handle either way, and `getOrder` resolves the
      // rest on the next status sync.
      const supplierOrderId =
        response?.powerbody_order_id != null && String(response.powerbody_order_id) !== ''
          ? String(response.powerbody_order_id)
          : order.reference
      return { supplierOrderId, status: toSupplierOrder({ ...response, status: response?.status }).status }
    },

    async getOrder(supplierOrderId: string): Promise<SupplierOrder | null> {
      // `ids` matches on our reference, which is what we sent as `id`. An order
      // we only know by their increment id is found by scanning the same reply.
      const rows = await client.call<PbOrder[] | null>('dropshipping.getOrders', { ids: [supplierOrderId] })
      const found = Array.isArray(rows)
        ? rows.find(
            (r) => String(r.order_id) === supplierOrderId || String(r.powerbody_order_id) === supplierOrderId,
          )
        : null
      return found ? toSupplierOrder(found) : null
    },

    async listOrders(): Promise<SupplierOrder[]> {
      // No parameters = the current day's orders plus anything they removed,
      // which is exactly the window a status sync cares about.
      const rows = await client.call<PbOrder[] | null>('dropshipping.getOrders', {})
      return Array.isArray(rows) ? rows.map((r) => toSupplierOrder(r)) : []
    },
  }
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function clientFromEnv(): PowerBodySoapClient {
  const url = process.env.POWERBODY_API_URL
  const username = process.env.POWERBODY_API_USER
  const apiKey = process.env.POWERBODY_API_KEY
  if (!url || !username || !apiKey) {
    throw new Error(
      'POWERBODY_API_URL, POWERBODY_API_USER and POWERBODY_API_KEY must all be set to use the live PowerBody adapter.',
    )
  }
  return createSoapClient({ url, username, apiKey })
}
