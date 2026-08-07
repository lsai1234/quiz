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
 *     So nothing here details products in bulk. `listProducts()` and
 *     `getStockLevels()` use the cheap call alone, and detail is fetched for the
 *     products that actually need it — the one being opened, or the ones being
 *     added to our catalogue — through `getProductsBySku()`. It is cached
 *     durably, so a product is detailed once and browsing gets richer over time
 *     without ever paying for it up front.
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
  SupplierProduct,
  SupplierProvider,
  SupplierStockLevel,
} from '../types'
import { createSoapClient, type PowerBodySoapClient } from './soap'
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
 * Wall-clock budget for one catalogue build, and for a SKU lookup.
 *
 * Nothing here fetches detail in bulk any more, so a build is just the cheap
 * paged feed and should be quick. This is the backstop for when it isn't: a
 * single wire call can hang for over two minutes on its own (30s per attempt,
 * retried), and a request that outlives its own timeout is delivered to nobody —
 * the hub sits on "Loading the PowerBody feed…" forever. When the clock is spent
 * we return what has landed rather than waiting for an answer no one will see.
 *
 * Keep this comfortably under the route's `maxDuration`.
 */
const DEFAULT_BUILD_DEADLINE_MS = 20_000

/** How long a built catalogue is reused in memory. Stock is NOT served from
 *  here — `getStockLevels` always goes to the wire. */
const CATALOGUE_TTL_MS = 10 * 60 * 1000

/** A catalogue the deadline cut short is held only briefly, so the next load
 *  carries on instead of serving the same short list for ten minutes. */
const PARTIAL_TTL_MS = 30 * 1000

interface Cached {
  at: number
  products: SupplierProduct[]
  /** False when the deadline stopped us mid-feed, so this is not the whole thing. */
  complete: boolean
}

let catalogueCache: Cached | null = null

/** The build currently running, if any. Two founders hitting Refresh at the same
 *  time (or one page mounting twice) must not start two builds against a
 *  supplier that is already rate-limiting us — they wait on the same one. */
let inFlightBuild: Promise<SupplierProduct[]> | null = null

/**
 * The list rows the last paging run read, by SKU.
 *
 * Pressing Details on a row should not re-read the entire feed to find out what
 * the browse list already knows — that is several throttled calls to save one,
 * and on a slow feed it is what puts a lookup near its own deadline. Held to the
 * same clock as the catalogue cache, so a row it serves is exactly as fresh as
 * the one on screen that was clicked.
 */
let listIndex: { at: number; bySku: Map<string, PbProductListItem> } | null = null

/**
 * Where a paging run the clock cut short got to.
 *
 * Without this, "the feed was only partly paged, more will appear on a refresh"
 * is a promise the code cannot keep: every build restarted at page one and hit
 * the same wall at the same place, so the far end of a big feed was unreachable
 * no matter how many times you pressed refresh. Each run now continues from
 * where the last stopped and keeps what it already had.
 */
const PAGING_RESUME_TTL_MS = 30 * 60 * 1000
let pagingCursor: { at: number; nextPage: number; items: PbProductListItem[] } | null = null

/** De-dupe merged pages: a resumed run can overlap when the feed shifts under
 *  us, and the same product twice in a browse list is its own bug. */
function dedupeItems(items: PbProductListItem[]): PbProductListItem[] {
  const seen = new Set<string>()
  const out: PbProductListItem[] = []
  for (const item of items) {
    const key = `${item.product_id ?? ''}:${item.sku ?? ''}`
    if (key === ':' || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function rememberListItems(items: PbProductListItem[]): void {
  const bySku = new Map<string, PbProductListItem>()
  for (const item of items) {
    const sku = String(item.sku ?? '')
    if (sku !== '') bySku.set(sku, item)
  }
  listIndex = { at: Date.now(), bySku }
}

/** How the last catalogue build went — surfaced in the hub so a list of
 *  bare SKUs explains itself instead of looking broken. */
export interface CatalogueProgress {
  total: number
  /** How many carry full detail already, from the durable cache. Detail is
   *  fetched per product on demand, so this grows as products are opened and
   *  added rather than being filled in up front. */
  detailed: number
  /** False when the time budget stopped us part-way through the list feed, so
   *  `total` is a floor rather than the size of the catalogue. */
  listComplete: boolean
  /** True when the build ran out of time before it ran out of work. */
  timeBudgetSpent: boolean
  at: string
}

let lastProgress: CatalogueProgress | null = null

export function getPowerBodyCatalogueProgress(): CatalogueProgress | null {
  return lastProgress
}

/** Drop the cached catalogue (tests, and after an explicit resync). */
export function __resetPowerBodyCache(): void {
  catalogueCache = null
  lastProgress = null
  inFlightBuild = null
  listIndex = null
  pagingCursor = null
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
    /** Page to start from. Lets a run the clock cut short be continued. */
    startPage?: number
    /**
     * Updated after every page read, so a caller that stops WAITING on this run
     * still knows where it got to. `nextPage` on the returned value only exists
     * when the run finished; the deadline race means the common cut-short case
     * never sees it.
     */
    reached?: { nextPage: number }
  }

  interface ListFeed {
    items: PbProductListItem[]
    /** False when we stopped early (deadline or page cap) rather than reaching
     *  the end of the feed. */
    complete: boolean
    /** The page to ask for next, so a run cut short can be continued. */
    nextPage: number
  }

  /** Page through `getProductList` until a page comes back empty — or until the
   *  caller has enough, or the clock runs out. */
  async function fetchListItems(listOptions: ListFeedOptions = {}): Promise<ListFeed> {
    const all: PbProductListItem[] = listOptions.into ?? []
    const from = listOptions.startPage ?? 1
    let page = from
    for (; page < from + MAX_PAGES; page++) {
      const rows = await client.call<PbProductListItem[] | null>('dropshipping.getProductList', { page })
      if (!Array.isArray(rows) || rows.length === 0) return { items: all, complete: true, nextPage: page }
      all.push(...rows)
      if (listOptions.reached) listOptions.reached.nextPage = page + 1
      if (listOptions.enough?.(all)) return { items: all, complete: true, nextPage: page + 1 }
      // Out of time: hand back a short catalogue rather than a request that
      // never answers, and say where to resume so the next call gets FURTHER
      // rather than reading the same first pages again.
      if (listOptions.deadline !== undefined && Date.now() >= listOptions.deadline) {
        return { items: all, complete: false, nextPage: page + 1 }
      }
    }
    // Hit the page cap — a feed that never returns an empty page.
    return { items: all, complete: false, nextPage: page }
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
   * **Both argument shapes are tried.** Their methods take a JSON string, and
   * `getProductList` takes a named argument (`{page}`) — so `{product_id}` is
   * the shape that matches. A bare id is the other reading of their guide, and
   * which one an account answers to is not something we can settle from here.
   * The named form goes first; a null or a fault falls through to the bare id
   * before giving up. That costs a second call only when the first shape is
   * wrong, and the failure mode it replaces — every product silently unnamed —
   * is far worse than an extra request.
   *
   * **Errors are NOT swallowed.** This is only ever called because someone asked
   * for this exact product, so "PowerBody said X" has to reach them. Returning
   * null on a fault is what made a broken detail call look like a page that
   * simply would not fill in.
   */
  async function fetchDetail(id: string): Promise<PbProductInfo> {
    let firstFailure: unknown = null
    let lastReply: unknown = undefined
    for (const args of [{ product_id: id }, id]) {
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
      throw new Error(
        `PowerBody answered for product ${id} with no product detail in it — they sent ${describeReply(lastReply)}. ` +
          'getProductInfo may not be enabled on this API account (new accounts start in their DEMO sandbox).',
      )
    }
    throw new Error(`PowerBody returned no details for product ${id}.`)
  }

  const idOf = (item: PbProductListItem): string =>
    item.product_id === undefined || item.product_id === null ? '' : String(item.product_id)

  /**
   * The full catalogue from the cheap list feed, wearing whatever detail the
   * cache already holds. Named rather than reached through `this`, so the
   * provider survives being destructured.
   *
   * No `getProductInfo` calls happen here, by design. Detailing a whole feed is
   * one throttled call per product, which is minutes of work for names nobody
   * has asked to see — and it is the browse list, so it has to be fast. Rows
   * come back with SKU, cost, stock and VAT (all correct, all from today's
   * feed), and `detailed: false` marks the ones whose descriptive fields are
   * placeholders. `getProductsBySku` fills those in for the product being opened
   * or added, and the cache means each product is only ever fetched once.
   */
  function cachedCatalogue(): SupplierProduct[] | null {
    if (!catalogueCache) return null
    const ttl = catalogueCache.complete ? CATALOGUE_TTL_MS : PARTIAL_TTL_MS
    return Date.now() - catalogueCache.at < ttl ? catalogueCache.products : null
  }

  async function listProducts(): Promise<SupplierProduct[]> {
    const cached = cachedCatalogue()
    if (cached) return cached
    if (!inFlightBuild) {
      inFlightBuild = buildCatalogue().finally(() => {
        inFlightBuild = null
      })
    }
    return inFlightBuild
  }

  async function buildCatalogue(): Promise<SupplierProduct[]> {
    const deadline = Date.now() + buildDeadlineMs

    // Carry on from where a cut-short run stopped, keeping what it had, so each
    // refresh reaches further into the feed instead of re-reading page one.
    const resume = pagingCursor && Date.now() - pagingCursor.at < PAGING_RESUME_TTL_MS ? pagingCursor : null

    // Pages land in `paged` as they arrive, so if the supplier stops answering
    // mid-feed we still have the ones that did.
    const paged: PbProductListItem[] = resume ? [...resume.items] : []
    const startPage = resume?.nextPage ?? 1
    const reached = { nextPage: startPage }
    const listing = await untilDeadline(
      fetchListItems({ deadline, into: paged, startPage, reached }),
      deadline,
    )
    const items = dedupeItems(listing?.items ?? paged)
    const listComplete = listing?.complete ?? false

    // Remember where to carry on — and stop remembering once the feed is whole.
    pagingCursor = listComplete
      ? null
      : { at: Date.now(), nextPage: listing?.nextPage ?? reached.nextPage, items }

    // Pressing Details on one of these rows should not have to read the feed
    // again to find the product id we are holding right here.
    if (items.length > 0) rememberListItems(items)

    if (items.length === 0) {
      // Nothing at all, and the clock is gone: say so. An empty catalogue would
      // read as "PowerBody carry no products", which is a very different thing.
      if (!listing) {
        throw new Error(
          `PowerBody did not answer within ${Math.round(buildDeadlineMs / 1000)}s. Their feed may be slow or ` +
            'rate-limiting us — try again, or look a product up by SKU.',
        )
      }
      lastProgress = {
        total: 0,
        detailed: 0,
        listComplete,
        timeBudgetSpent: false,
        at: new Date().toISOString(),
      }
      catalogueCache = { at: Date.now(), products: [], complete: listComplete }
      return []
    }

    // Read-only: whatever has already been fetched for other reasons dresses the
    // list up for free. Nothing is fetched or written here.
    const cache = await detailStore.load()
    const now = Date.now()

    const updatedAt = new Date().toISOString()
    const products = items
      .map((item) => {
        const entry = usableEntry(idOf(item), cache, now)
        // The FRESH list row goes on top of cached detail, never underneath:
        // price, qty and VAT must come from today's feed even when the name and
        // image came from a cache written a week ago.
        return toSupplierProduct(entry ? { ...entry.info, ...item } : item, updatedAt)
      })
      .filter((p) => p.sku !== '')

    lastProgress = {
      total: products.length,
      // Counted off the products themselves, not off cache entries. A cached
      // record that came back without a name leaves the row showing its code, so
      // counting the entry would claim names had been fetched while the list
      // plainly shows otherwise.
      detailed: products.filter((p) => p.detailed).length,
      listComplete,
      timeBudgetSpent: !listComplete,
      at: updatedAt,
    }
    catalogueCache = { at: Date.now(), products, complete: listComplete }
    return products
  }

  /**
   * Detail for specific SKUs, fetched on demand.
   *
   * This is the *only* thing that calls `getProductInfo`, and it is what makes
   * the split affordable: the expensive half of the feed is paid for one product
   * at a time, when someone opens it or adds it, instead of thousands of calls
   * up front for a catalogue nobody has looked at. The list feed maps SKU → their
   * numeric product id and is always complete (it is the cheap call), so any SKU
   * that exists is reachable here even when nothing about it has been fetched.
   *
   * What comes back is always whole — name, brand, category, image, real RRP —
   * which is why importing goes through here rather than through the browse list.
   */
  /**
   * The list rows for `wanted`, from the index the browse list built — but only
   * when EVERY one of them is in there. A partial hit is not good enough: the
   * missing one might be on a page that was never read, and "not in the feed"
   * has to be a fact rather than an artefact of what happened to be cached.
   */
  function matchesFromIndex(wanted: Set<string>): PbProductListItem[] {
    if (!listIndex || Date.now() - listIndex.at >= CATALOGUE_TTL_MS) return []
    const hits: PbProductListItem[] = []
    for (const sku of wanted) {
      const item = listIndex.bySku.get(sku)
      if (!item) return []
      hits.push(item)
    }
    return hits
  }

  async function getProductsBySku(skus: string[]): Promise<SupplierProduct[]> {
    const wanted = new Set(skus.filter(Boolean))
    if (wanted.size === 0) return []

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
    if (matches.length === 0) return []

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
    return matches.map((item) => {
      const entry = usableEntry(idOf(item), cache, now)
      // Fresh list row on top, exactly as in `listProducts` — cached detail must
      // never supply today's price or stock.
      return toSupplierProduct(entry ? { ...entry.info, ...item } : item, updatedAt)
    })
  }

  return {
    name: 'powerbody',

    listProducts,

    async getProduct(sku: string): Promise<SupplierProduct | null> {
      const [found] = await getProductsBySku([sku])
      return found ?? null
    },

    getProductsBySku,

    async getStockLevels(skus?: string[]): Promise<SupplierStockLevel[]> {
      // Always live — this is the call the daily check exists to make.
      const { items } = await fetchListItems()
      const updatedAt = new Date().toISOString()
      const wanted = skus && skus.length > 0 ? new Set(skus) : null
      return items
        .map((item) => toStockLevel(item, updatedAt))
        .filter((level) => level.sku !== '' && (!wanted || wanted.has(level.sku)))
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
