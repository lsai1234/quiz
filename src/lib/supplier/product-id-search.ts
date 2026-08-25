/**
 * Finding a PowerBody `product_id` from a SKU, when the feed cannot be walked.
 *
 * THE PROBLEM
 * ───────────
 * `getProductList` is the only bulk source of the SKU → product id mapping, and
 * this account's copy of it stops dead at 200 pages × 15 rows = 3,000 products
 * against a catalogue of 8,023. The cap is undocumented and there is no `limit`,
 * `offset` or filter to raise it, no bulk export carrying ids, and no method
 * that takes a SKU. So for a product past the ceiling there is no forward route
 * from the code we have to the id the detail call needs.
 *
 * THE WAY ROUND
 * ─────────────
 * `getProductInfo` takes an id and its reply CARRIES THE SKU. That makes it
 * invertible: probe an id, read which SKU lives there, and you know whether the
 * one you want is above or below. Product ids run near-perfectly monotone in SKU
 * number (Spearman 0.9997 over 3,000 known pairs), so that is a binary search.
 *
 * WHAT MAKES IT SAFE
 * ──────────────────
 * A hit is accepted ONLY when the returned SKU string equals the target exactly.
 * Position is never trusted, and an id is never inferred from a fit. That matters
 * more than it sounds: ids and SKU numbers correlate, so a near miss returns a
 * REAL product — just the wrong one — and importing that would attach another
 * brand's product to your SKU. Verifying the SKU is what makes the difference
 * between a search and a guess.
 *
 * Pure and transport-free: the caller supplies `probe`, so the algorithm is
 * testable without a network, a session or a rate limiter.
 */

/** What one probe of an id found. `null` sku = no product there to compare. */
export interface ProbeResult {
  sku: string | null
}

export interface SearchOptions {
  /** The SKU we want, e.g. "P44338". */
  target: string
  /**
   * Inclusive id bracket to search.
   *
   * It has to be roughly where the products actually are. Ids are sparse, so
   * the search finds its footing by scanning near each midpoint for a real
   * product — and a bracket vastly wider than the cluster leaves every midpoint
   * in empty space. It then reports `exhausted` rather than answering, which is
   * the safe failure, but it is a wasted sweep. Bracket from `fitIdFromSku`.
   */
  lo: number
  hi: number
  /** Ask the supplier what lives at this id. */
  probe: (productId: number) => Promise<ProbeResult>
  /**
   * How far to step away from an empty id looking for a real product.
   *
   * Ids are sparse — the observed feed holds 3,000 products across 108,630 ids —
   * so a probe usually lands on nothing, and nothing carries no direction. The
   * scan finds the nearest real neighbour so the bisect has a SKU to compare.
   * Density is far better than the global figure suggests near the top of the
   * range (median gap of 3 across the last 500 known rows), which is where every
   * unresolved SKU sits, so this rarely runs long.
   */
  neighbourReach?: number
  /** Hard ceiling on probes, so a pathological range cannot run forever. */
  maxProbes?: number
}

export interface SearchOutcome {
  productId: number | null
  /** Probes actually spent — the thing that costs rate limit. */
  probes: number
  /** Why it stopped, for a log a person has to read. */
  reason: 'found' | 'exhausted' | 'probe-budget'
}

const DEFAULT_NEIGHBOUR_REACH = 40
const DEFAULT_MAX_PROBES = 200

/** The numeric part of a PowerBody SKU ("P44338" → 44338); null when it has none. */
export function skuNumber(sku: string): number | null {
  const digits = sku.replace(/\D/g, '')
  return digits === '' ? null : Number(digits)
}

/**
 * Search a bracket of product ids for the one carrying `target`.
 *
 * Bisects on SKU number, stepping off empty ids to the nearest real neighbour so
 * every comparison is made against an actual product. Returns the id only on an
 * exact SKU match.
 */
export async function findProductIdForSku(options: SearchOptions): Promise<SearchOutcome> {
  const { target, probe } = options
  const reach = options.neighbourReach ?? DEFAULT_NEIGHBOUR_REACH
  const budget = options.maxProbes ?? DEFAULT_MAX_PROBES
  const wanted = skuNumber(target)
  if (wanted === null) return { productId: null, probes: 0, reason: 'exhausted' }

  let lo = Math.max(1, Math.floor(options.lo))
  let hi = Math.floor(options.hi)
  let probes = 0
  // Ids already looked at. Bisecting a sparse range revisits the same
  // neighbours repeatedly otherwise, and each repeat is a wasted throttled call.
  const seen = new Map<number, string | null>()

  async function look(id: number): Promise<string | null> {
    const cached = seen.get(id)
    if (cached !== undefined) return cached
    probes += 1
    const { sku } = await probe(id)
    seen.set(id, sku)
    return sku
  }

  while (lo <= hi) {
    if (probes >= budget) return { productId: null, probes, reason: 'probe-budget' }
    const mid = Math.floor((lo + hi) / 2)

    // Find something real at or near the midpoint. An empty id tells us nothing
    // about direction, so bisecting on one would discard half the range on no
    // evidence — the flaw that makes a naive sparse bisect silently wrong.
    let landedId: number | null = null
    let landedSku: string | null = null
    for (let step = 0; step <= reach; step++) {
      for (const id of step === 0 ? [mid] : [mid - step, mid + step]) {
        if (id < lo || id > hi) continue
        if (probes >= budget) return { productId: null, probes, reason: 'probe-budget' }
        const sku = await look(id)
        if (sku) {
          landedId = id
          landedSku = sku
          break
        }
      }
      if (landedId !== null) break
    }

    // Nothing real anywhere near the middle of what is left. The range is
    // genuinely empty rather than merely sparse, so there is nothing to find.
    if (landedId === null || landedSku === null) {
      return { productId: null, probes, reason: 'exhausted' }
    }

    if (landedSku === target) return { productId: landedId, probes, reason: 'found' }

    const landedNumber = skuNumber(landedSku)
    if (landedNumber === null) {
      // A SKU we cannot compare. Treat its id as consumed and carry on rather
      // than reading a direction out of it.
      lo = landedId + 1
      continue
    }
    if (landedNumber < wanted) lo = landedId + 1
    else hi = landedId - 1
  }

  return { productId: null, probes, reason: 'exhausted' }
}

/**
 * A linear sweep, for when the bisect comes back empty-handed.
 *
 * Worth having because the ordering is *near* monotone, not monotone: there are
 * 92 inversions across the 3,000 known pairs, about 3%. A product sitting on the
 * wrong side of one is invisible to a bisect but sits a few ids from where the
 * fit says it should be, so a short sweep around the prediction finds it. Same
 * exact-SKU rule — this narrows where to look, never what to accept.
 */
export async function sweepForSku(options: {
  target: string
  centre: number
  radius: number
  probe: (productId: number) => Promise<ProbeResult>
  skip?: (productId: number) => boolean
}): Promise<SearchOutcome> {
  const { target, centre, radius, probe, skip } = options
  let probes = 0
  for (let step = 0; step <= radius; step++) {
    for (const id of step === 0 ? [centre] : [centre - step, centre + step]) {
      if (id < 1 || skip?.(id)) continue
      probes += 1
      const { sku } = await probe(id)
      if (sku === target) return { productId: id, probes, reason: 'found' }
    }
  }
  return { productId: null, probes, reason: 'exhausted' }
}

/**
 * Least-squares fit of product id against SKU number, from pairs already known.
 *
 * Used only to centre a search — never to answer one. The residual spread on the
 * real feed is a few hundred ids, which is useless as an answer and ideal as a
 * starting point.
 */
export function fitIdFromSku(pairs: Array<{ sku: string; productId: number }>): (sku: string) => number | null {
  const points = pairs
    .map((p) => ({ x: skuNumber(p.sku), y: p.productId }))
    .filter((p): p is { x: number; y: number } => p.x !== null)

  if (points.length < 2) return () => null

  const n = points.length
  const meanX = points.reduce((s, p) => s + p.x, 0) / n
  const meanY = points.reduce((s, p) => s + p.y, 0) / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY)
    den += (p.x - meanX) ** 2
  }
  // Every pair sharing one SKU number leaves the slope undefined; fall back to
  // the mean rather than dividing by zero.
  const slope = den === 0 ? 0 : num / den
  const intercept = meanY - slope * meanX

  return (sku: string) => {
    const x = skuNumber(sku)
    return x === null ? null : Math.round(slope * x + intercept)
  }
}
