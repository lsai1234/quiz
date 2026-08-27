/**
 * Resolving a SKU to a PowerBody `product_id` at runtime, past the feed ceiling.
 *
 * WHY THE OBVIOUS ROUTE FAILS
 * ───────────────────────────
 * `getProductsBySku` pages `getProductList` looking for the row that carries the
 * id. This account's copy of that feed stops dead at 200 pages × 15 rows — 3,000
 * products against a catalogue of over 8,000 — with no `limit`, `offset` or
 * filter to raise it. A SKU above the ceiling is not merely slow to find: it is
 * unreachable by that route, however long you wait.
 *
 * THE WAY ROUND, AND WHY IT IS SOUND
 * ──────────────────────────────────
 * `getProductInfo` takes an id and its reply CARRIES THE SKU. That makes the
 * mapping invertible: probe an id, read which SKU lives there, and you know
 * whether the one you want is above or below. Ids run near-monotone in SKU
 * number, so that is a binary search — `product-id-search.ts` — and this module
 * is what supplies it a supplier, a bracket and a clock.
 *
 * The bracket comes from real pairs, not a constant. A few pages of the cheap
 * feed give sixty known {sku, id} pairs; a least-squares fit over those says
 * roughly where a SKU should live, and the search starts there. Nothing about
 * the fit is ever treated as an answer — an id is accepted ONLY when the product
 * at it returns the exact SKU asked for. Ids and SKU numbers correlate, so a
 * near miss returns a REAL product that is the WRONG product, and importing that
 * would put another brand's tub behind your code.
 *
 * WHY A CLOCK, AND WHY IT REPORTS ITSELF
 * ──────────────────────────────────────
 * Every probe is a throttled request. Running out of time and running out of
 * range are completely different answers — one means "ask again", the other
 * means "this SKU is not on this account" — and the whole reason this file
 * exists is that the feed walk conflated them. So a search that runs out of
 * clock says `deadline`, and NEVER `not-found`.
 */
import type { SupplierProvider } from './types'
import { findProductIdForSku, sweepForSku, fitIdFromSku, skuNumber, type ProbeResult } from './product-id-search'
import { productIdForSku } from './product-id-map'

/** Thrown through the search when the clock runs out, so a timeout can never be
 *  mistaken for an exhausted range. Caught by `resolveProductIdForSku`. */
class SearchExpired extends Error {}

/**
 * Thrown when the search has spent its allowance of requests.
 *
 * Separate from the clock on purpose. The clock protects the platform's request
 * timeout; this protects PowerBody, who answer 429 when asked too fast. A fast
 * account is exactly the case where a clock alone stops limiting anything — 45
 * seconds of 50ms replies is nine hundred calls — so the ceiling has to be
 * counted in requests, not seconds.
 */
class ProbeBudgetSpent extends Error {}

/**
 * One thing the search did, as it did it.
 *
 * Emitted rather than logged because the caller is a button on a phone: a
 * resolve can spend a minute making throttled requests, and a screen that shows
 * nothing for a minute is indistinguishable from one that has hung. It is also
 * the debugging record — every step carries what it actually saw, so a failure
 * can be read back rather than guessed at.
 */
export interface ResolveStep {
  phase: 'anchors' | 'canary' | 'gallop' | 'edge' | 'bisect' | 'sweep' | 'done'
  message: string
  /** Requests spent by the time this step happened. */
  probes: number
}

export interface ResolveOutcome {
  productId: number | null
  /** Throttled requests actually spent. */
  probes: number
  reason: 'map' | 'found' | 'not-found' | 'deadline' | 'probe-budget' | 'no-anchors' | 'unusable-sku'
  /** How many known pairs the bracket was fitted from. */
  anchors: number
  /** The bracket searched, for a log a person has to read. */
  bracket: { lo: number; hi: number } | null
  /** Everything it did, in order. */
  trace: ResolveStep[]
  /**
   * Why the feed could not be read, when that is what stopped it.
   *
   * `no-anchors` used to be reported as "check the supplier credentials", which
   * is one guess among several — the feed may have thrown, been rate-limited,
   * or answered with rows carrying no product id at all. Those need different
   * fixes, so the real reason travels instead of being replaced by a hunch.
   */
  feedError?: string
}

/** Ids either side of the fit's prediction to search.
 *
 *  The observed residual spread is a few hundred ids, so this is generous by
 *  design: a bracket too narrow to contain the answer produces a confident
 *  "not found", which is the one wrong answer that matters here. */
const DEFAULT_MARGIN = 5_000

/** Never bracket tighter than this, however tidy the fit looks. */
const MIN_MARGIN = 400

/**
 * The most throttled requests one resolve may spend, however fast they answer.
 *
 * At the observed ~450ms a probe this is never the binding constraint — the
 * clock is. It binds when PowerBody are quick, which is precisely when nothing
 * else would stop a single button press making hundreds of calls.
 */
const DEFAULT_MAX_PROBES = 250

/**
 * How far to step off an empty id looking for a real neighbour, measured from
 * the feed rather than fixed.
 *
 * This is the single biggest cost in the whole search. A scan that finds nothing
 * spends its full width in throttled requests and learns one bit, so a reach
 * sized for the sparsest imaginable patch makes every empty probe forty times
 * more expensive than it needs to be. The anchors already say how far apart this
 * catalogue's products actually sit; three times that gap finds a neighbour
 * essentially always, and costs a sixth of a blanket 40.
 */
function neighbourReach(anchors: Pair[]): number {
  const ids = anchors.map((a) => a.productId).sort((a, b) => a - b)
  if (ids.length < 2) return 40
  const gaps: number[] = []
  for (let i = 1; i < ids.length; i++) {
    const gap = ids[i] - ids[i - 1]
    // Anchors are sampled from pages far apart, so consecutive pairs across a
    // sample boundary are a jump between regions, not a gap between products.
    if (gap > 0 && gap < 500) gaps.push(gap)
  }
  if (gaps.length === 0) return 40
  gaps.sort((a, b) => a - b)
  const median = gaps[Math.floor(gaps.length / 2)]
  return Math.min(60, Math.max(8, median * 3))
}

/** What one probe is assumed to cost, for turning a clock into a probe budget.
 *  Rate limiting sets the floor (150ms minimum interval) and their latency the
 *  rest; the budget only has to be the right order of magnitude. */
const ASSUMED_PROBE_MS = 450

/** Where to stop doubling when looking for the end of the feed. 4,096 pages is
 *  more than 60,000 products — far past any ceiling worth discovering. */
const MAX_PAGE_SEARCH = 4_096

type Pair = { sku: string; productId: number }

interface PageRead {
  pairs: Pair[]
  /** Rows the feed returned, before any were dropped for lacking an id. */
  rows: number
  /** The supplier's own words, when the page could not be read at all. */
  error?: string
}

/**
 * Read one page of the cheap list feed.
 *
 * `rows` and `error` are returned rather than collapsed into an empty array,
 * because three different situations wear the same clothes here: the feed
 * refused, the feed ended, or the feed answered with rows carrying no
 * `product_id`. The last is invisible without this — it looks exactly like an
 * empty page while actually meaning their feed's shape has changed — and each
 * needs a different fix from whoever reads the error.
 */
async function readPage(supplier: SupplierProvider, page: number): Promise<PageRead> {
  try {
    const feed = await supplier.getFeed({ fromPage: page, pageBudget: 1 })
    const pairs = feed.levels
      .map((l) => ({ sku: l.sku, productId: Number(l.productId) }))
      .filter((p) => p.sku && Number.isFinite(p.productId) && p.productId > 0)
    return { pairs, rows: feed.levels.length }
  } catch (err) {
    // One unreadable page is a worse fit, not a failed resolve — but the reason
    // travels, so the caller can say what happened if every page fails.
    return { pairs: [], rows: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Find the last page of the list feed that actually returns rows.
 *
 * Not a constant, on purpose. The anchor pages used to be hardcoded to a
 * 200-page feed, and against anything shorter every sample but the first came
 * back empty — leaving the fit with fifteen pairs spanning fifteen SKUs, which
 * is no lever at all. Extrapolating a whole catalogue from that turned a
 * ~35-probe search into a ~165-probe one.
 *
 * Doubling then bisecting costs a handful of CHEAP calls to save tens of
 * expensive ones, and it is the honest way to treat a ceiling nobody documented:
 * measure where it is rather than assuming it has not moved.
 */
export async function lastPopulatedPage(supplier: SupplierProvider, firstPagePopulated?: boolean): Promise<number> {
  const firstOk = firstPagePopulated ?? (await readPage(supplier, 1)).pairs.length > 0
  if (!firstOk) return 0

  let good = 1
  let bad = 0
  for (let page = 2; page <= MAX_PAGE_SEARCH; page *= 2) {
    if ((await readPage(supplier, page)).pairs.length > 0) good = page
    else { bad = page; break }
  }
  if (bad === 0) return good

  while (bad - good > 1) {
    const mid = Math.floor((good + bad) / 2)
    if ((await readPage(supplier, mid)).pairs.length > 0) good = mid
    else bad = mid
  }
  return good
}

/**
 * Sample the cheap list feed for {sku, productId} pairs to fit a bracket from.
 *
 * Spread across the feed's real extent rather than bunched: a fit needs leverage
 * across the range, and pairs from one end predict the other end badly. These
 * come from `getProductList`, which is free of the detail call's per-product
 * cost and is the same read the nightly stock sync makes.
 */
export interface AnchorRead {
  pairs: Pair[]
  /** Pages actually asked for. */
  pages: number[]
  /** Rows the feed returned across those pages, before any were dropped. */
  rows: number
  /** The first refusal, if any page could not be read. */
  error?: string
}

export async function anchorsFromFeed(supplier: SupplierProvider, pages?: number[]): Promise<AnchorRead> {
  const pairs = new Map<string, number>()
  let rows = 0
  let error: string | undefined
  const absorb = (read: PageRead) => {
    rows += read.rows
    if (read.error && !error) error = read.error
    for (const pair of read.pairs) pairs.set(pair.sku, pair.productId)
  }
  const collected = (chosen: number[]): AnchorRead => ({
    pairs: [...pairs].map(([sku, productId]) => ({ sku, productId })),
    pages: chosen,
    rows,
    error,
  })

  if (pages) {
    for (const page of pages) absorb(await readPage(supplier, page))
    return collected(pages)
  }

  // Page one is read first and KEPT, not just tested. Finding the feed's extent
  // used to throw this read away, so when it came back refused or shapeless the
  // reason vanished and the caller could only report "empty" — which is what
  // sent someone to check working credentials.
  const first = await readPage(supplier, 1)
  absorb(first)
  if (first.pairs.length === 0) return collected([1])

  const last = await lastPopulatedPage(supplier, true)
  // Both ends plus two inside them. The ends carry the leverage; the middle two
  // are what show the fit is a line rather than assuming it.
  const chosen = [...new Set([1, Math.round(last / 3), Math.round((2 * last) / 3), last])].filter((p) => p >= 1)
  for (const page of chosen) {
    if (page === 1) continue // already read, and kept
    absorb(await readPage(supplier, page))
  }
  return collected(chosen)
}

/**
 * Probe a single id through the supplier's detail call.
 *
 * An id with no product behind it throws rather than returning empty
 * (`getProductsById` throws when NOTHING in the batch resolved), and for a
 * one-id batch those are the same case. So a throw is read as "nothing there" —
 * which is right for a sparse id range and wrong for a broken account, where
 * every probe would throw and the search would grind through its whole budget
 * before reporting an empty range.
 *
 * Hence `firstError`: if nothing has ever answered, the supplier's own words are
 * thrown instead of a confident "not on this account".
 */
export function supplierProbe(supplier: SupplierProvider): {
  probe: (productId: number) => Promise<ProbeResult>
  /** The first failure seen, kept in case NOTHING ever answers. */
  firstError: () => Error | null
  answered: () => number
} {
  let firstError: Error | null = null
  let answered = 0
  return {
    answered: () => answered,
    firstError: () => firstError,
    probe: async (productId: number): Promise<ProbeResult> => {
      try {
        const [found] = await supplier.getProductsById([String(productId)])
        if (found?.sku) {
          answered += 1
          return { sku: found.sku }
        }
        return { sku: null }
      } catch (err) {
        if (!firstError) firstError = err instanceof Error ? err : new Error(String(err))
        return { sku: null }
      }
    },
  }
}

/**
 * How far either side of the prediction to search, measured rather than guessed.
 *
 * A fitted line is only as good as its residuals, and those are knowable: fit
 * the anchors, see how far the worst one sits from where the line put it, and
 * bracket a multiple of that. A constant cannot do this — too tight and the
 * answer falls outside the bracket and is reported "not found", which is the one
 * wrong answer that matters; too wide and every extra doubling costs probes at
 * ~450ms each against a fixed clock.
 *
 * The multiple is generous (6×) and floored, because the target sits OUTSIDE
 * the fitted range — that is the whole point — and extrapolation error grows
 * beyond anything the residuals can show. `resolveProductIdForSku` widens and
 * re-searches if this comes up empty, so being wrong here costs time, never a
 * false "not on this account".
 */
export function marginFromResiduals(anchors: Pair[], fit: (sku: string) => number | null): number {
  let worst = 0
  for (const a of anchors) {
    const predicted = fit(a.sku)
    if (predicted !== null) worst = Math.max(worst, Math.abs(predicted - a.productId))
  }
  return Math.min(DEFAULT_MARGIN, Math.max(MIN_MARGIN, Math.round(worst * 6)))
}

/**
 * The nearest real product to an id, and which SKU lives there.
 *
 * Ids are sparse — thousands of products across hundreds of thousands of ids —
 * so a probe usually lands on nothing, and nothing carries no information. Every
 * decision made from a probe therefore has to be made against a product that
 * actually exists, which means stepping outward until one does.
 */
async function nearestReal(
  centre: number,
  reach: number,
  probe: (id: number) => Promise<ProbeResult>,
): Promise<{ id: number; sku: string } | null> {
  for (let step = 0; step <= reach; step++) {
    for (const id of step === 0 ? [centre] : [centre - step, centre + step]) {
      if (id < 1) continue
      const { sku } = await probe(id)
      if (sku) return { id, sku }
    }
  }
  return null
}

export interface ResolveOptions {
  /** Wall-clock milliseconds this may spend. */
  budgetMs?: number
  /** Ids either side of the prediction to bracket. */
  margin?: number
  /** Throttled requests this may spend, whatever the clock says. */
  maxProbes?: number
  /** Called as each step happens, so a caller can show progress live. */
  onStep?: (step: ResolveStep) => void
  /** Supplied by tests, and by a caller that already has pairs to hand. */
  anchors?: Array<{ sku: string; productId: number }>
  now?: () => number
}

/**
 * Find the PowerBody product id for a SKU, whatever side of the ceiling it sits.
 *
 * Order of attack, cheapest first:
 *   1. The committed map — free, exact, and empty until the backfill runs.
 *   2. A fitted binary search over `getProductInfo`.
 *   3. A short linear sweep around the prediction, because the ordering is
 *      *near* monotone: about 3% of pairs sit on the wrong side of an inversion
 *      and are invisible to a bisect while sitting a few ids from the fit.
 */
export async function resolveProductIdForSku(
  sku: string,
  supplier: SupplierProvider,
  options: ResolveOptions = {},
): Promise<ResolveOutcome> {
  const now = options.now ?? (() => Date.now())
  const started = now()
  const budget = options.budgetMs ?? 45_000
  const expiresAt = started + budget

  const trace: ResolveStep[] = []
  let probes = 0
  const step = (phase: ResolveStep['phase'], message: string) => {
    const entry: ResolveStep = { phase, message, probes }
    trace.push(entry)
    options.onStep?.(entry)
  }

  const known = productIdForSku(sku)
  if (known !== null) {
    step('done', `Already knew ${sku} is product ${known}.`)
    return { productId: known, probes: 0, reason: 'map', anchors: 0, bracket: null, trace }
  }

  const wanted = skuNumber(sku)
  if (wanted === null) {
    // Nothing to bisect on. A SKU with no number in it cannot be compared
    // against the ones probing returns, so the search has no ordering to use.
    step('done', `${sku} has no number in it, so there is nothing to order the search by.`)
    return { productId: null, probes: 0, reason: 'unusable-sku', anchors: 0, bracket: null, trace }
  }

  const read = options.anchors
    ? { pairs: options.anchors, pages: [], rows: options.anchors.length, error: undefined as string | undefined }
    : await anchorsFromFeed(supplier)
  const anchors = read.pairs

  if (anchors.length < 2) {
    // Three different situations reach here and they need different fixes, so
    // the message says which one it was instead of picking the scariest.
    const why = read.error
      ? `PowerBody refused their product list: ${read.error}`
      : read.rows > 0
        ? `PowerBody's product list answered with ${read.rows} rows but none carried a product id, so there is nothing to search by. Their feed's shape may have changed.`
        : 'PowerBody\'s product list came back empty.'
    step('anchors', why)
    return {
      productId: null, probes: 0, reason: 'no-anchors', anchors: anchors.length,
      bracket: null, trace, feedError: why,
    }
  }
  step('anchors', `Read ${anchors.length} known products from pages ${read.pages.join(', ') || 'supplied'} to work out where ${sku} sits.`)

  const fit = fitIdFromSku(anchors)
  const predicted = fit(sku)
  const margin = options.margin ?? marginFromResiduals(anchors, fit)

  // Where the known products actually end. When the target sits above every SKU
  // we can see — the ceiling case, and the whole reason this exists — monotonicity
  // says its id is above their ids too, so the search starts there rather than
  // wasting half its budget re-walking ground the feed already covers.
  let topId = 0
  let topSkuNumber = -Infinity
  for (const a of anchors) {
    const n = skuNumber(a.sku)
    if (n !== null && n > topSkuNumber) { topSkuNumber = n; topId = a.productId }
  }

  const centre = predicted ?? topId
  const aboveCeiling = wanted > topSkuNumber
  let lo = Math.max(1, aboveCeiling ? topId : centre - margin)
  let hi = Math.max(lo + 1, aboveCeiling ? Math.max(centre, topId) + margin : centre + margin)

  const reach = neighbourReach(anchors)
  const { probe, firstError } = supplierProbe(supplier)

  /**
   * Prove the detail call works before reading anything into its silence.
   *
   * `getProductsById` throws identically for "no product at that id" and "this
   * method is not enabled on your account". During a search the first is normal
   * and constant — ids are sparse, most probes land on nothing — so the second
   * is invisible, and a permissions failure would spend the whole budget and
   * then report the SKU missing.
   *
   * Counting how many probes answered does not separate them either: a bracket
   * that happens to sit in a genuinely empty stretch of ids answers zero times
   * while the account is perfectly healthy. So instead: probe an id we KNOW
   * exists, because the feed just handed it to us. One call, and it settles the
   * question outright — anything after it can be trusted to mean "nothing here".
   */
  const canary = anchors[0]
  step('canary', `Checking their detail call works, using product ${canary.productId} (${canary.sku}).`)
  probes += 1
  const canaryResult = await probe(canary.productId)
  if (canaryResult.sku === null) {
    throw (
      firstError() ??
      new Error(
        `PowerBody's product list names product ${canary.productId}, but their detail call returns nothing for it. ` +
          'getProductInfo may not be enabled on this account.',
      )
    )
  }
  const maxProbes = options.maxProbes ?? DEFAULT_MAX_PROBES
  const timed = async (id: number): Promise<ProbeResult> => {
    if (now() >= expiresAt) throw new SearchExpired()
    if (probes >= maxProbes) throw new ProbeBudgetSpent()
    probes += 1
    return probe(id)
  }

  const remaining = () => Math.max(0, expiresAt - now())
  const budgetProbes = () => Math.max(1, Math.min(maxProbes - probes, Math.floor(remaining() / ASSUMED_PROBE_MS)))

  // The canary above already proved the detail call works, so from here a
  // failure to find is genuinely about this SKU and can be reported as such.
  const fail = (reason: ResolveOutcome['reason']): ResolveOutcome => {
    step('done', `Gave up on ${sku} after ${probes} requests: ${reason}.`)
    return { productId: null, probes, reason, anchors: anchors.length, bracket: { lo, hi }, trace }
  }

  // Everything from here spends throttled requests, and both the clock and the
  // request allowance report themselves through the catch below.
  try {
  /**
   * When the SKU sits above everything the feed can see, find a real upper bound
   * instead of inventing one.
   *
   * This is the case the whole module exists for, and it is the one where a
   * constant is least defensible: the feed stops at 3,000 of 8,000+ products, so
   * the target is outside the fitted data and the fit's residuals say nothing
   * about how far. Guessing narrow reports a real product missing; guessing wide
   * spends the clock.
   *
   * So it gallops — probe progressively further above the last known product
   * until one turns up whose SKU is PAST the target. That product's id is a
   * proven ceiling, and the last one before it a proven floor, so the bisect
   * that follows searches a bracket that is known to contain the answer rather
   * than hoped to.
   */
  if (aboveCeiling) {
    step('gallop', `${sku} is above every code their list feed can see (it stops at ${topSkuNumber}), so looking upward from product ${topId} for one past it.`)
    let below = topId
    let ceilingId: number | null = null
    let firstEmpty: number | null = null
    let stride = Math.max(margin, 500)

    for (let i = 0; i < 24 && remaining() > ASSUMED_PROBE_MS * 6; i++) {
      const point = topId + stride
      // Reach is deliberately modest. A scan through genuinely empty ids costs
      // its full width in throttled requests and buys nothing, and near the top
      // of the real feed the median gap between products is 3.
      const hit = await nearestReal(point, Math.min(reach, Math.ceil(stride / 4)), timed)
      if (hit) {
        const n = skuNumber(hit.sku)
        // A product PAST the target: a proven ceiling, and the best possible
        // outcome — the bisect that follows now searches a bracket known to
        // contain the answer rather than hoped to.
        if (n !== null && n >= wanted) {
          ceilingId = hit.id
          step('gallop', `Product ${hit.id} is ${hit.sku}, past ${sku} — so the answer is between ${below} and ${hit.id}.`)
          break
        }
        if (n !== null) below = Math.max(below, hit.id)
      } else {
        // Nothing here at all. Not a ceiling in the SKU sense, but a real
        // observation: the catalogue has thinned out or ended by this point, so
        // it bounds the search honestly when no product past the target is ever
        // found. Fabricating a bound from `margin` instead is how a product
        // sitting between the last hit and here gets reported missing.
        firstEmpty = point
        // Stop escalating. Everything past an empty point is emptier still, and
        // each further step pays a full scan to learn that again.
        break
      }
      stride *= 2
      // Past here the range is not sparse, it is empty: nothing lives this far
      // above the known catalogue and continuing only burns the clock.
      if (stride > 4_000_000) break
    }

    /**
     * No product past the target anywhere — so the target is at or near the top
     * of the catalogue, and the only bound we have is a point that came back
     * empty. That point cannot be handed to the bisect as-is: its first midpoint
     * lands in the void above the last product, the neighbour scan finds
     * nothing, and the search reports the range empty while the answer sits
     * below it. (That is what "the range is genuinely empty rather than merely
     * sparse" cannot distinguish.)
     *
     * So close the gap first: bisect for the EDGE of the populated region
     * between a product we found and a point we know is empty. A handful of
     * probes turns a bracket that is mostly void into one that is mostly
     * products, which is the shape the search needs.
     */
    if (ceilingId === null && firstEmpty !== null) {
      step('edge', `Nothing past ${sku} anywhere — it is near the top of their catalogue. Finding where their product ids run out.`)
      let populated = below
      let empty = firstEmpty
      while (empty - populated > 200 && remaining() > ASSUMED_PROBE_MS * 8) {
        const mid = Math.floor((populated + empty) / 2)
        const hit = await nearestReal(mid, reach, timed)
        if (hit) populated = Math.max(populated, hit.id)
        else empty = mid
      }
      firstEmpty = empty
    }

    lo = Math.max(1, below)
    hi = ceilingId ?? firstEmpty ?? lo + margin
    if (hi <= lo) hi = lo + margin
  }

    step('bisect', `Searching product ids ${lo}–${hi} for ${sku}.`)
    let search = await findProductIdForSku({ target: sku, lo, hi, probe: timed, maxProbes: budgetProbes() })

    // An exhausted bracket means "not in the range we looked at", which is only
    // the same as "not on this account" if the range was right. The target sits
    // outside the fitted data by construction, so a residual-sized bracket can
    // genuinely undershoot — widen once and look again before saying no.
    if (search.productId === null && search.reason === 'exhausted' && remaining() > ASSUMED_PROBE_MS * 12) {
      const wideLo = Math.max(1, lo - margin * 3)
      const wideHi = hi + margin * 3
      step('bisect', `Not in ${lo}–${hi}. Widening to ${wideLo}–${wideHi} before concluding anything.`)
      search = await findProductIdForSku({
        target: sku, lo: wideLo, hi: wideHi, probe: timed, maxProbes: budgetProbes(),
      })
      if (search.productId !== null) {
        step('done', `Found ${sku} at product ${search.productId} after ${probes} requests.`)
        return { productId: search.productId, probes, reason: 'found', anchors: anchors.length, bracket: { lo: wideLo, hi: wideHi }, trace }
      }
    }

    if (search.productId !== null) {
      step('done', `Found ${sku} at product ${search.productId} after ${probes} requests.`)
      return { productId: search.productId, probes, reason: 'found', anchors: anchors.length, bracket: { lo, hi }, trace }
    }

    // The bisect came back empty. Ordering is near-monotone, not monotone, so a
    // product on the wrong side of an inversion is invisible to it — and sits a
    // few ids from where the fit says. Only worth doing with clock left.
    if (predicted !== null && remaining() > ASSUMED_PROBE_MS * 10) {
      step('sweep', `Still not found. Checking ids either side of ${predicted}, where the fit says ${sku} should sit.`)
      const swept = await sweepForSku({
        target: sku,
        centre: predicted,
        radius: Math.min(120, Math.floor(budgetProbes() / 2)),
        probe: timed,
      })
      if (swept.productId !== null) {
        step('done', `Found ${sku} at product ${swept.productId} after ${probes} requests.`)
        return { productId: swept.productId, probes, reason: 'found', anchors: anchors.length, bracket: { lo, hi }, trace }
      }
    }

    return fail(search.reason === 'probe-budget' ? 'probe-budget' : 'not-found')
  } catch (err) {
    // A clock that ran out says so. It is NOT a "not found": conflating the two
    // is the exact bug this module was written to escape.
    if (err instanceof SearchExpired) return fail('deadline')
    // Out of requests, not out of range: pressing again picks up with a fresh
    // allowance, which is a different instruction from "this is not there".
    if (err instanceof ProbeBudgetSpent) return fail('probe-budget')
    throw err
  }
}
