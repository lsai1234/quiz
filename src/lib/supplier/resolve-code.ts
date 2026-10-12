import type { SupplierProduct, SupplierProvider } from './types'
import { productIdForSku } from './product-id-map'
import { resolveProductIdForSku, type ResolveStep } from './resolve-sku'
import { PowerBodySoapError } from './powerbody/soap'
import { readSupplierIndex, rememberIndexed, type SupplierIndex } from '@/lib/portal/supplier-index'

/**
 * Find a product at PowerBody from whatever code a founder has: a SKU or a
 * product id. The one way every screen does it.
 *
 * ── Why this is hard ─────────────────────────────────────────────────────────
 * PowerBody's spreadsheet lists SKUs. Every useful call — a product's details,
 * its live stock, placing an order — wants their numeric PRODUCT ID, and the
 * only route from one to the other is their product list: pages of {sku, id}
 * rows, which one session can only read so far into. So there are two ways to
 * an id, and this uses them in this order:
 *
 *   1. one we already hold  — saved on a catalogue product, in the committed
 *                             map, or in the stored index (the whole list, read
 *                             once by the index builder, plus every id found
 *                             since). Checked with ONE call and done.
 *   2. the id search        — `resolve-sku`: probes ids around where this SKU
 *                             should sit until one answers with it. Slow
 *                             (throttled requests), but reaches anything.
 *
 * There used to be a third — walking their list page by page for each code —
 * and it was the source of "PowerBody timed out": it could not be stopped once
 * started, shared the rate limit with everything else, and brought on the very
 * throttling the search then misread. Reading the list is the index builder's
 * job, done once, paced, and kept.
 *
 * Every id is CHECKED: it is used only if PowerBody's reply carries the exact
 * SKU asked for, because neighbouring ids are real products and the wrong one
 * would put another brand's tub behind our code.
 *
 * ── Every answer says what to do next ───────────────────────────────────────
 *   found           here it is
 *   not-yet         the search ran out of time or requests before finding it.
 *                   NOT evidence it is missing: search again (each search
 *                   learns from the last — every id it saw is kept), or paste
 *                   the product id
 *   not-on-account  not in PowerBody's list, and the stored index read ALL of
 *                   it — the only evidence of absence there is. Check the code;
 *                   search their ids anyway if you are sure
 *   refused         PowerBody would not answer. Why decides the fix:
 *                   rate-limited (wait — it passes), sandbox (their DEMO
 *                   account cannot do this — ask them to switch it to live),
 *                   credentials (Settings → Supplier), supplier-error (their
 *                   words, and the checks)
 *   wrong-product   a pasted id belongs to a different SKU than the card it
 *                   was pasted on
 *   unusable        a SKU with no number in it cannot be searched for
 */

export type ResolveStatus = 'found' | 'not-yet' | 'not-on-account' | 'refused' | 'wrong-product' | 'unusable'
export type ResolveVia = 'id' | 'saved' | 'map' | 'index' | 'search' | 'sample'
export type RefusalKind = 'rate-limited' | 'sandbox' | 'credentials' | 'supplier-error'
export type NextStep =
  | 'search-again'
  | 'search-anyway'
  | 'paste-id'
  | 'check-code'
  | 'run-checks'
  | 'wait'
  | 'open-settings'
  | 'refresh-index'
  | 'ask-powerbody'

export interface CodeResolution {
  code: string
  /** What the code looked like. A numeric code is tried as an id first, then as a SKU. */
  kind: 'sku' | 'id'
  status: ResolveStatus
  refusal?: RefusalKind
  /** The product, fully detailed, when found. */
  product?: SupplierProduct
  productId?: string
  via?: ResolveVia
  /** One plain sentence for the founder. */
  message: string
  next: NextStep[]
  /** For an all-digit code that is ALSO a SKU we know of ("44338" vs "P44338"). */
  alsoMeant?: { code: string; productId: string }
  /** Throttled requests the id search spent. */
  probes: number
  trace: ResolveStep[]
}

export interface ResolveCodeOptions {
  supplier: SupplierProvider
  /** Wall-clock this lookup may spend in total. */
  budgetMs?: number
  /** An id already saved on a catalogue product for this SKU, if any. */
  savedIdFor?: (sku: string) => string | null | undefined
  /** Search their ids even when the complete index says the SKU is not there. */
  searchAnyway?: boolean
  /** A pasted id must belong to this SKU (the card it was pasted on). */
  expectSku?: string | null
  onStep?: (step: ResolveStep) => void
  now?: () => number
  /** Supplied by tests; read from storage otherwise. */
  index?: SupplierIndex | null
}

/** A code as PowerBody write it: trimmed, upper-case. */
export function normaliseCode(code: string): string {
  return code.trim().replace(/\s+/g, '').toUpperCase()
}

export function isProductId(code: string): boolean {
  return /^\d{1,9}$/.test(code)
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Why PowerBody refused, as the fix it needs. */
export function refusalOf(err: unknown): { kind: RefusalKind; message: string; next: NextStep[] } {
  const text = errorText(err)
  if ((err instanceof PowerBodySoapError && err.retryable) || /\b429\b|rate.?limit|too many|throttl|slow down/i.test(text)) {
    return {
      kind: 'rate-limited',
      message: `PowerBody are limiting how fast we can ask (“${text}”). It passes on its own — wait a minute, then carry on.`,
      next: ['wait', 'search-again'],
    }
  }
  if (/\bdemo\b|sandbox|not enabled/i.test(text)) {
    return {
      kind: 'sandbox',
      message: `PowerBody's answer suggests this API account is still their DEMO sandbox, which cannot look products up (“${text}”). Ask PowerBody to switch the account to live API access.`,
      next: ['ask-powerbody', 'run-checks'],
    }
  }
  if (/login|credential|api ?key|access denied|username|not authori[sz]ed|invalid session/i.test(text)) {
    return {
      kind: 'credentials',
      message: `PowerBody did not accept our login (“${text}”). Check the API user and key in Settings → Supplier.`,
      next: ['open-settings', 'run-checks'],
    }
  }
  return {
    kind: 'supplier-error',
    message: `PowerBody would not answer: ${text}`,
    next: ['run-checks', 'search-again'],
  }
}

function daysAgo(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null
  const at = Date.parse(iso)
  return Number.isFinite(at) ? Math.floor((now - at) / 86_400_000) : null
}

function dateLabel(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/**
 * Wrap a supplier so every product it returns during a search is remembered.
 * Each is a verified {sku, id} pair; kept, they make the next search's fit
 * tighter and start it closer — which is what makes "search again" carry on
 * rather than repeat itself.
 */
function recording(supplier: SupplierProvider): { supplier: SupplierProvider; seen: Map<string, SupplierProduct> } {
  const seen = new Map<string, SupplierProduct>()
  const wrapped: SupplierProvider = Object.create(supplier)
  wrapped.getProductsById = async (ids: string[]) => {
    const found = await supplier.getProductsById(ids)
    for (const p of found) if (p.sku && p.productId) seen.set(p.sku, p)
    return found
  }
  return { supplier: wrapped, seen }
}

export async function resolveCode(raw: string, options: ResolveCodeOptions): Promise<CodeResolution> {
  const now = options.now ?? (() => Date.now())
  const started = now()
  const budget = options.budgetMs ?? 45_000
  const remaining = () => Math.max(0, started + budget - now())

  const code = normaliseCode(raw)
  const expect = options.expectSku ? normaliseCode(options.expectSku) : null
  const trace: ResolveStep[] = []
  let probes = 0
  const step = (phase: ResolveStep['phase'], message: string) => {
    const entry: ResolveStep = { phase, message, probes }
    trace.push(entry)
    options.onStep?.(entry)
  }
  const result = (r: Omit<CodeResolution, 'code' | 'trace' | 'probes' | 'kind'> & { kind?: 'sku' | 'id' }): CodeResolution => ({
    code,
    kind: r.kind ?? (isProductId(code) ? 'id' : 'sku'),
    probes,
    trace,
    ...r,
  })

  if (!code) return result({ status: 'unusable', message: 'That code is blank.', next: ['check-code'] })

  const { supplier: recorder, seen } = recording(options.supplier)
  const supplier = recorder
  const remember = async (extra: SupplierProduct[] = []) => {
    const pairs = [...seen.values(), ...extra]
      .filter((p) => p.sku && p.productId && /^\d+$/.test(String(p.productId)))
      .slice(0, 300)
      .map((p) => ({ sku: p.sku, productId: String(p.productId), name: p.name, wholesalePrice: p.wholesalePrice, stock: p.stock }))
    if (pairs.length > 0) await rememberIndexed(pairs).catch(() => undefined)
  }

  /** Ask for one id and keep it only if it is the product we mean. */
  const fetchId = async (id: string, sku: string | null): Promise<SupplierProduct | null> => {
    const [found] = await supplier.getProductsById([id])
    if (!found) return null
    if (sku && normaliseCode(found.sku ?? '') !== sku) return null
    return { ...found, productId: found.productId ?? id }
  }

  const found = async (product: SupplierProduct, via: ResolveVia, kind: 'sku' | 'id', extra: Partial<CodeResolution> = {}): Promise<CodeResolution> => {
    const productId = String(product.productId ?? '')
    if (expect && normaliseCode(product.sku ?? '') !== expect) {
      return result({
        status: 'wrong-product',
        kind,
        message: `Product id ${productId} is ${product.sku} (${product.name || 'no name'}), not ${expect}. Check the id.`,
        next: ['paste-id'],
      })
    }
    await remember(via === 'search' || via === 'id' ? [product] : [])
    step('done', `${product.sku} is PowerBody product ${productId}: ${product.name || 'no name given'}.`)
    const message =
      kind === 'id'
        ? `Product id ${productId} is ${product.name || 'a product with no name'} (SKU ${product.sku}).`
        : `Found ${product.name || product.sku}.`
    return result({ status: 'found', product, productId, via, kind, message, next: [], ...extra })
  }

  // ── The sample catalogue: no ids, no search — it either has it or not ──
  if (options.supplier.name === 'mock') {
    const [hit] = await options.supplier.getProductsBySku([code]).catch(() => [] as SupplierProduct[])
    if (hit) return found(hit, 'sample', 'sku')
    return result({
      status: 'not-on-account',
      message: `${code} is not in the sample catalogue — the supplier is set to Sample, so nothing is being asked of PowerBody. Switch it to Live in Settings → Supplier to look up real products.`,
      next: ['open-settings', 'check-code'],
    })
  }

  const index = options.index !== undefined ? options.index : await readSupplierIndex().catch(() => null)
  const heldFor = (sku: string): Array<{ id: string; via: ResolveVia; label: string }> => {
    const out: Array<{ id: string; via: ResolveVia; label: string }> = []
    const saved = options.savedIdFor?.(sku)
    if (saved && /^\d+$/.test(String(saved))) out.push({ id: String(saved), via: 'saved', label: 'saved on one of your products' })
    const mapped = productIdForSku(sku)
    if (mapped !== null) out.push({ id: String(mapped), via: 'map', label: 'in the committed id list' })
    const indexed = index?.bySku[sku]?.productId
    if (indexed) out.push({ id: indexed, via: 'index', label: 'in the stored PowerBody index' })
    return out.filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i)
  }

  // ── 1. A product id: one call ─────────────────────────────────────────────
  let idNote: string | null = null
  if (isProductId(code)) {
    // "44338" may be product id 44338, or SKU P44338 with the P lost on the way
    // out of a spreadsheet. Both are checked; neither is assumed.
    const asSku = `P${code}`
    const skuIds = heldFor(asSku)
    step('canary', `${code} looks like a PowerBody product id — asking for it directly.`)
    try {
      const byId = await fetchId(code, null)
      if (byId?.sku) {
        const other = skuIds.find((c) => c.id !== code)
        return found(byId, 'id', 'id', other ? { alsoMeant: { code: asSku, productId: other.id } } : {})
      }
      idNote = `PowerBody have no product with id ${code}.`
    } catch (err) {
      // A refusal that searching cannot get past (a rate limit, the sandbox, a
      // login) stops here, as it does for a held id below — a search would only
      // spend throttled requests on the same refusal.
      const why = refusalOf(err)
      if (why.kind !== 'supplier-error') return result({ status: 'refused', refusal: why.kind, message: why.message, next: why.next })
      idNote = `PowerBody would not answer for product ${code}: ${errorText(err)}`
    }
    if (skuIds.length > 0) {
      step('canary', `${idNote} But SKU ${asSku} is known — trying that.`)
      for (const c of skuIds) {
        const hit = await fetchId(c.id, asSku).catch(() => null)
        if (hit) return found(hit, c.via, 'sku', { message: `No product has id ${code}, but SKU ${asSku} is ${hit.name || 'known'} — is that the one?` })
      }
    }
    step('canary', `${idNote} Trying it as a SKU instead.`)
  }
  const sku = code

  // ── 2. An id we already hold for this SKU ────────────────────────────────
  let refusal: unknown = null
  for (const candidate of heldFor(sku)) {
    step('canary', `Found ${sku} ${candidate.label} as product ${candidate.id} — checking it with PowerBody.`)
    try {
      const hit = await fetchId(candidate.id, sku)
      if (hit) return found(hit, candidate.via, 'sku')
      step('canary', `Product ${candidate.id} no longer answers for ${sku}, so it is being looked up again.`)
    } catch (err) {
      refusal = err
      step('canary', `PowerBody would not answer for product ${candidate.id}: ${errorText(err)}`)
    }
  }
  if (refusal) {
    const why = refusalOf(refusal)
    if (why.kind !== 'supplier-error') {
      return result({ status: 'refused', refusal: why.kind, kind: 'sku', message: why.message, next: why.next })
    }
  }

  // ── The stored index read their WHOLE list: absence there is evidence ──
  if (index?.complete && !index.bySku[sku] && !options.searchAnyway) {
    const age = daysAgo(index.updatedAt, now())
    const when = index.updatedAt ? ` (read in full on ${dateLabel(index.updatedAt)})` : ''
    step('done', `${sku} is not in PowerBody's product list${when}.`)
    return result({
      status: 'not-on-account',
      kind: 'sku',
      message:
        `${sku} is not in PowerBody's product list${when}, so it is not on this account under that code. ` +
        'Check the code' + (age != null && age > 7 ? ', or refresh the list — it is over a week old' : '') +
        '. If you are sure it exists, their ids can be searched anyway.' + (idNote ? ` (${idNote})` : ''),
      next: ['check-code', ...(age != null && age > 7 ? (['refresh-index'] as NextStep[]) : []), 'search-anyway', 'paste-id'],
    })
  }

  // ── 3. The id search ──────────────────────────────────────────────────────
  if (remaining() < 4_000) {
    return result({
      status: 'not-yet',
      kind: 'sku',
      message: `Ran out of time before searching PowerBody's ids for ${sku}. Search again to carry on.`,
      next: ['search-again', 'paste-id'],
    })
  }

  // Pairs from the stored index make a better starting fit than reading pages
  // of their list again — and still work when the list is refusing us.
  const anchors = index
    ? Object.entries(index.bySku)
        .map(([s, e]) => ({ sku: s, productId: Number(e.productId) }))
        .filter((a) => Number.isFinite(a.productId) && a.productId > 0)
    : []
  const spread = anchors.length >= 40 ? sample(anchors, 240) : undefined

  try {
    const outcome = await resolveProductIdForSku(sku, supplier, {
      budgetMs: remaining() - 2_000,
      anchors: spread,
      onStep: (s) => {
        probes = s.probes
        trace.push(s)
        options.onStep?.(s)
      },
    })
    probes = outcome.probes
    if (outcome.productId !== null) {
      const hit = await fetchId(String(outcome.productId), sku)
      if (hit) return found(hit, 'search', 'sku')
      await remember()
      return result({
        status: 'refused',
        refusal: 'supplier-error',
        kind: 'sku',
        message: `Found an id for ${sku}, but PowerBody then answered for a different product. Not using it — run the supplier checks.`,
        next: ['run-checks', 'paste-id'],
      })
    }
    await remember()
    switch (outcome.reason) {
      case 'deadline':
      case 'probe-budget':
      case 'not-found':
        // An exhausted bracket is NOT proof of absence: a sparse patch of ids,
        // or a range the fit put in the wrong place, ends a search the same
        // way. Only the complete index can say a SKU is not there.
        return result({
          status: 'not-yet',
          kind: 'sku',
          message:
            outcome.reason === 'not-found'
              ? `Searched PowerBody's ids ${outcome.bracket?.lo}–${outcome.bracket?.hi} for ${sku} and it is not in that range — it may sit outside it. ` +
                'Search again (it starts from what it has learned), or paste its product id.'
              : `Checked ${outcome.probes} of PowerBody's product ids without reaching ${sku} yet. That is not a "not found" — search again to carry on, or paste its product id.`,
          next: ['search-again', 'paste-id'],
        })
      case 'unusable-sku':
        return result({
          status: 'unusable',
          kind: 'sku',
          message: `${sku} has no number in it, so there is no way to search for it. Paste its PowerBody product id instead.`,
          next: ['paste-id', 'check-code'],
        })
      case 'no-anchors':
      default: {
        const why = refusalOf(new Error(outcome.feedError ?? `PowerBody's product list could not be read, so ${sku} could not be searched for.`))
        return result({ status: 'refused', refusal: why.kind, kind: 'sku', message: why.message, next: why.next })
      }
    }
  } catch (err) {
    await remember()
    const why = refusalOf(err)
    return result({ status: 'refused', refusal: why.kind, kind: 'sku', message: why.message, next: why.next })
  }
}

/** Up to `n` pairs spread evenly across the id range, so the fit sees both ends. */
function sample<T extends { productId: number }>(pairs: T[], n: number): T[] {
  const sorted = [...pairs].sort((a, b) => a.productId - b.productId)
  if (sorted.length <= n) return sorted
  const out: T[] = []
  const stepSize = (sorted.length - 1) / (n - 1)
  for (let i = 0; i < n; i += 1) out.push(sorted[Math.round(i * stepSize)])
  return out
}

// ── The quick pass: many codes, one round trip ──────────────────────────────

export interface QuickResult {
  code: string
  kind: 'sku' | 'id'
  status: 'found' | 'unresolved' | 'not-on-account'
  product?: SupplierProduct
  productId?: string
  via?: ResolveVia
  message: string
}

/**
 * Answer as many codes as possible without searching: ids already held (on our
 * products, in the map, in the index) and codes that ARE ids, all checked with
 * one batch of detail calls. What is left needs `resolveCode`, one at a time.
 *
 * With a complete index this answers nearly every real code in seconds — the
 * 20- or 50-code paste that used to take a quarter of an hour.
 */
export async function quickResolve(
  codes: string[],
  options: { supplier: SupplierProvider; savedIdFor?: (sku: string) => string | null | undefined; index?: SupplierIndex | null },
): Promise<{ results: QuickResult[]; refusal: { kind: RefusalKind; message: string; next: NextStep[] } | null }> {
  const { supplier } = options
  const wanted = [...new Set(codes.map(normaliseCode).filter(Boolean))]

  if (supplier.name === 'mock') {
    const hits = await supplier.getProductsBySku(wanted).catch(() => [] as SupplierProduct[])
    return {
      refusal: null,
      results: wanted.map((code) => {
        const hit = hits.find((h) => normaliseCode(h.sku) === code)
        return hit
          ? { code, kind: 'sku' as const, status: 'found' as const, product: hit, productId: hit.productId ?? undefined, via: 'sample' as const, message: `Found ${hit.name}.` }
          : {
              code,
              kind: 'sku' as const,
              status: 'not-on-account' as const,
              message: `${code} is not in the sample catalogue — the supplier is set to Sample. Switch it to Live in Settings → Supplier.`,
            }
      }),
    }
  }

  const index = options.index !== undefined ? options.index : await readSupplierIndex().catch(() => null)
  const ask = new Map<string, Array<{ id: string; via: ResolveVia; sku: string | null }>>()
  for (const code of wanted) {
    const list: Array<{ id: string; via: ResolveVia; sku: string | null }> = []
    if (isProductId(code)) list.push({ id: code, via: 'id', sku: null })
    for (const sku of isProductId(code) ? [code, `P${code}`] : [code]) {
      const saved = options.savedIdFor?.(sku)
      if (saved && /^\d+$/.test(String(saved))) list.push({ id: String(saved), via: 'saved', sku })
      const mapped = productIdForSku(sku)
      if (mapped !== null) list.push({ id: String(mapped), via: 'map', sku })
      const indexed = index?.bySku[sku]?.productId
      if (indexed) list.push({ id: indexed, via: 'index', sku })
    }
    ask.set(code, list)
  }

  const ids = [...new Set([...ask.values()].flat().map((c) => c.id))]
  const byId = new Map<string, SupplierProduct>()
  let refusal: ReturnType<typeof refusalOf> | null = null
  for (let i = 0; i < ids.length; i += 20) {
    try {
      for (const p of await supplier.getProductsById(ids.slice(i, i + 20))) {
        if (p.productId) byId.set(String(p.productId), p)
      }
    } catch (err) {
      const why = refusalOf(err)
      if (why.kind !== 'supplier-error') {
        refusal = why
        break
      }
    }
  }

  const results = wanted.map((code): QuickResult => {
    for (const c of ask.get(code) ?? []) {
      const p = byId.get(c.id)
      if (!p) continue
      if (c.sku && normaliseCode(p.sku ?? '') !== c.sku) continue
      const kind = c.via === 'id' ? ('id' as const) : ('sku' as const)
      return {
        code,
        kind,
        status: 'found',
        product: p,
        productId: c.id,
        via: c.via,
        message: kind === 'id' ? `Product id ${c.id} is ${p.name || 'a product'} (SKU ${p.sku}).` : `Found ${p.name || p.sku}.`,
      }
    }
    const kind = isProductId(code) ? ('id' as const) : ('sku' as const)
    if (kind === 'sku' && index?.complete && !index.bySku[code]) {
      return {
        code,
        kind,
        status: 'not-on-account',
        message: `${code} is not in PowerBody's product list${index.updatedAt ? ` (read in full on ${dateLabel(index.updatedAt)})` : ''}. Check the code.`,
      }
    }
    return { code, kind, status: 'unresolved', message: 'Needs a search of PowerBody’s ids.' }
  })
  return { results, refusal }
}
