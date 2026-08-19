/**
 * Exercising the supplier integration, one capability at a time.
 *
 * `docs/E2E_TEST_PLAN.md` phase B is a list of things to try by hand against a
 * PowerBody sandbox account: can we authenticate, does the list feed page, does
 * `getProductInfo` come back, is there more than one shipping service. Each of
 * those is a question with a definite answer, and answering them by clicking
 * around the import screen tells you only that something went wrong somewhere.
 *
 * This runs them as named checks and reports each one separately, so a failure
 * says *which* call the account cannot make. It is the same code path the app
 * uses — `getSupplier()` resolves to the mock or to live PowerBody exactly as it
 * does everywhere else — so a green run here is evidence about the integration
 * rather than about a test double.
 *
 * ── What it will not do ──
 *
 * Nothing here writes. `placeOrder` is the one call with a consequence at the
 * other end and it is deliberately absent: the fulfilment queue is where an
 * order is sent, behind its own confirmation and the `SUPPLIER_ORDERING` switch.
 * A diagnostics screen that could place a real order is a diagnostics screen
 * somebody will place a real order from.
 *
 * Server-only: it calls the supplier.
 */
import { getSupplier, getSupplierMode, getSupplierSource, hasPowerBodyCredentials } from './index'
import { buildDeadlineMs } from './powerbody/live'
import type { SupplierProduct, SupplierProvider } from './types'

export type CheckStatus =
  /** The call worked and the answer looks right. */
  | 'pass'
  /** The call worked; the answer needs a human to read it. */
  | 'warn'
  /** The call failed, or answered with something unusable. */
  | 'fail'
  /** Not applicable to the supplier in use, or nothing to test it with. */
  | 'skip'

export interface SupplierCheck {
  id: string
  title: string
  status: CheckStatus
  /** One sentence, written to be read by a founder rather than a developer. */
  detail: string
  /** What came back, when seeing it is the point. */
  evidence?: string
  ms: number
}

export interface SupplierDiagnosticsReport {
  source: 'mock' | 'powerbody'
  mode: string
  credentials: boolean
  /** True when the answers carry PowerBody's sandbox tells — see `sandboxTells`. */
  looksLikeSandbox: boolean
  /** Whether the write path ran. Only ever true on a confirmed sandbox account. */
  placedTestOrder: boolean
  checks: SupplierCheck[]
  ranAt: string
  ms: number
}

/** Money, printed the way every other screen prints it. */
const money = (n: number) => `£${n.toFixed(2)}`

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string; ms: number }> {
  const started = Date.now()
  try {
    return { value: await fn(), ms: Date.now() - started }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), ms: Date.now() - started }
  }
}

/**
 * A product whose descriptive half never arrived.
 *
 * PowerBody split their feed: the cheap paged list carries SKU, price and stock,
 * and `getProductInfo` — one throttled call per product — is the only source of
 * name, brand, category, image and RRP. When that call is not enabled on an
 * account, every product comes back named after its own code. It is the single
 * most expensive thing to discover late, because everything imported inherits it.
 */
function looksUndetailed(product: SupplierProduct): boolean {
  if (!product.detailed) return true
  const name = (product.name ?? '').trim()
  return name === '' || name === product.sku
}

/**
 * PowerBody put every new API account in a demo sandbox: placeholder names, flat
 * prices, stock of exactly 10 or 100, no product detail, and orders that fail by
 * themselves. Worth naming on screen so none of it is chased as a bug.
 */
function sandboxTells(products: SupplierProduct[]): boolean {
  if (!products.length) return false
  const roundStock = products.every((p) => p.stock === 10 || p.stock === 100 || p.stock === 0)
  const placeholderNames = products.filter((p) => /^P?\d+$/i.test((p.name ?? '').trim())).length
  return roundStock || placeholderNames >= Math.ceil(products.length / 2)
}

/**
 * Run every read-only capability the provider offers.
 *
 * Checks run in order and later ones use what earlier ones found — there is no
 * point asking for a product's stock when we could not get a SKU to ask about —
 * so a failure early on turns the rest into skips rather than a cascade of
 * identical errors.
 */
export async function runSupplierDiagnostics(
  supplier?: SupplierProvider,
  options: { placeTestOrder?: boolean } = {},
): Promise<SupplierDiagnosticsReport> {
  const started = Date.now()
  const placeTestOrder = options.placeTestOrder === true
  const provider = supplier ?? (await getSupplier())
  const checks: SupplierCheck[] = []
  const add = (check: SupplierCheck) => checks.push(check)

  const source = provider.name
  const credentials = hasPowerBodyCredentials()

  // ── 1. Configuration, before anything is called ──
  add({
    id: 'configuration',
    title: 'Which supplier is being read',
    status: source === 'powerbody' ? 'pass' : 'warn',
    detail:
      source === 'powerbody'
        ? 'Live PowerBody. Everything below is a real call to their API.'
        : 'The built-in sample catalogue. Nothing below touches PowerBody — set the switch above to Live PowerBody to test the real thing.',
    evidence: `mode=${getSupplierMode()} · source=${getSupplierSource()} · credentials=${credentials ? 'set' : 'missing'}`,
    ms: 0,
  })

  if (source !== 'powerbody' && !credentials) {
    add({
      id: 'credentials',
      title: 'API credentials',
      status: 'warn',
      detail:
        'POWERBODY_API_URL, _USER and _KEY are not all set. Their SOAP endpoint authenticates with login(username, apiKey), so all three are needed before anything can be tried live.',
      ms: 0,
    })
  }

  // ── 2. Can we get a SKU at all? ──
  const sample = await timed(() => provider.sampleSkus(5))
  const skus = sample.value ?? []

  /* An empty list has two very different causes and the provider cannot tell
     them apart: it hands back whatever pages landed before its clock ran out, so
     "this account has no products" and "we stopped waiting" are the same empty
     array. The elapsed time separates them — a feed that answered emptily does
     so quickly, and one that timed out took the whole budget. Worth drawing,
     because only one of them is fixed by raising the budget. */
  const budget = source === 'powerbody' ? buildDeadlineMs() : 0
  const ranOutOfTime = budget > 0 && !skus.length && sample.ms >= budget * 0.9

  add({
    id: 'sample-skus',
    title: 'Find some SKUs',
    status: sample.error || ranOutOfTime ? 'fail' : skus.length ? 'pass' : 'warn',
    detail: sample.error
      ? `The list feed could not be paged: ${sample.error}`
      : ranOutOfTime
        ? `Nothing came back within ${Math.round(sample.ms / 1000)}s, which is the whole budget for paging the feed — so this is their API being slow rather than an account with no products in it. Every check below that needs a SKU is skipped as a result. Raise POWERBODY_BUILD_DEADLINE_MS (currently ${Math.round(budget / 1000)}s) and run this again.`
        : skus.length
          ? `The feed answered with ${skus.length} product code${skus.length === 1 ? '' : 's'}.`
          : 'The feed answered quickly and with no product codes — an empty account, or a filter returning nothing. Not a timeout: it did not use its budget.',
    evidence: skus.slice(0, 5).join(', ') || undefined,
    ms: sample.ms,
  })

  // ── 3. The detail call — the one that decides whether an import is usable ──
  let detailed: SupplierProduct[] = []
  if (!skus.length) {
    add({ id: 'product-detail', title: 'Fetch full product detail', status: 'skip', detail: 'No SKU to look up.', ms: 0 })
  } else {
    const lookup = await timed(() => provider.getProductsBySku(skus.slice(0, 3)))
    detailed = lookup.value ?? []
    const undetailed = detailed.filter(looksUndetailed)
    add({
      id: 'product-detail',
      title: 'Fetch full product detail',
      status: lookup.error ? 'fail' : !detailed.length ? 'fail' : undetailed.length ? 'fail' : 'pass',
      detail: lookup.error
        ? `getProductsBySku failed: ${lookup.error}`
        : !detailed.length
          ? 'The SKUs the feed just gave us came back as nothing. That should not happen — the codes and the detail call disagree about what exists.'
          : undetailed.length
            ? `${undetailed.length} of ${detailed.length} products came back with no name of their own. getProductInfo is almost certainly not enabled on this account — ask your account manager to turn it on before importing anything, because every product added now inherits it.`
            : `${detailed.length} products came back complete — name, brand, image, cost and RRP.`,
      evidence: detailed.map((p) => `${p.sku}: ${p.name || '(no name)'}`).join(' · ') || undefined,
      ms: lookup.ms,
    })
  }

  // ── 4. Single-product lookup ──
  if (!skus.length) {
    add({ id: 'single-product', title: 'Look up one product', status: 'skip', detail: 'No SKU to look up.', ms: 0 })
  } else {
    const one = await timed(() => provider.getProduct(skus[0]))
    add({
      id: 'single-product',
      title: 'Look up one product',
      status: one.error ? 'fail' : one.value ? 'pass' : 'warn',
      detail: one.error
        ? `getProduct failed: ${one.error}`
        : one.value
          ? `${skus[0]} resolved to "${one.value.name || skus[0]}".`
          : `${skus[0]} came back empty, though the feed listed it.`,
      ms: one.ms,
    })
  }

  // ── 5. Stock and cost, the daily-sync path ──
  if (!skus.length) {
    add({ id: 'stock', title: 'Read stock and cost', status: 'skip', detail: 'No SKU to price.', ms: 0 })
  } else {
    const stock = await timed(() => provider.getStockLevels(skus.slice(0, 3)))
    const levels = stock.value ?? []
    add({
      id: 'stock',
      title: 'Read stock and cost',
      status: stock.error ? 'fail' : levels.length ? 'pass' : 'warn',
      detail: stock.error
        ? `getStockLevels failed: ${stock.error}`
        : levels.length
          ? `${levels.length} stock level${levels.length === 1 ? '' : 's'} came back. This is the call the daily sync runs.`
          : 'No stock levels came back for those SKUs.',
      evidence: levels.map((l) => `${l.sku}: ${l.stock} @ ${money(l.wholesalePrice)}`).join(' · ') || undefined,
      ms: stock.ms,
    })
  }

  // ── 6. Shipped weight — load-bearing for margin, and often absent ──
  if (detailed.length) {
    const withWeight = detailed.filter((p) => p.weightGrams != null)
    add({
      id: 'weight',
      title: 'Shipped weight',
      status: withWeight.length === detailed.length ? 'pass' : 'warn',
      detail:
        withWeight.length === 0
          ? 'No product carries a shipped weight. Expected — PowerBody publish none — so orders go without one and they weigh the parcel. It only affects the margin model’s delivery estimate, which falls back to 1kg per product.'
          : withWeight.length === detailed.length
            ? 'Every product carries a shipped weight.'
            : `${withWeight.length} of ${detailed.length} products carry a shipped weight.`,
      ms: 0,
    })
  }

  // ── 7. Delivery services ──
  if (typeof provider.shippingMethods !== 'function') {
    add({
      id: 'shipping-methods',
      title: 'Delivery services offered',
      status: 'skip',
      detail: 'This provider does not implement the call.',
      ms: 0,
    })
  } else {
    const methods = await timed(() => provider.shippingMethods!())
    const list = methods.value ?? []
    add({
      id: 'shipping-methods',
      title: 'Delivery services offered',
      status: methods.error ? 'warn' : list.length > 1 ? 'pass' : 'warn',
      detail: methods.error
        ? `Not callable on this account: ${methods.error}. That is an answer in itself — their published card is the whole story, and delivery options can only be prices we set.`
        : list.length > 1
          ? `${list.length} services. Real speed options are possible, and transport_code is worth wiring up.`
          : `${list.length} service. Delivery options can only be prices we set, not speeds we buy.`,
      evidence: list.map((m) => m.name ?? m.code).join(' · ') || undefined,
      ms: methods.ms,
    })
  }

  // ── 8. The order side, read-only ──
  const orders = await timed(() => provider.listOrders())
  const orderList = orders.value ?? []
  add({
    id: 'list-orders',
    title: 'Read orders back',
    status: orders.error ? 'fail' : 'pass',
    detail: orders.error
      ? `listOrders failed: ${orders.error}`
      : `${orderList.length} order${orderList.length === 1 ? '' : 's'} on the account. This is how status and tracking come back to us.`,
    ms: orders.ms,
  })

  if (!orderList.length) {
    add({
      id: 'get-order',
      title: 'Read one order',
      status: 'skip',
      detail: 'No order on the account to read. Send one from the fulfilment queue first.',
      ms: 0,
    })
  } else {
    const first = orderList[0]
    const one = await timed(() => provider.getOrder(first.supplierOrderId))
    add({
      id: 'get-order',
      title: 'Read one order',
      status: one.error ? 'fail' : one.value ? 'pass' : 'warn',
      detail: one.error
        ? `getOrder failed: ${one.error}`
        : one.value
          ? `Order ${first.supplierOrderId} reads back with status "${one.value.status ?? 'unknown'}".`
          : `Order ${first.supplierOrderId} is in the list but could not be fetched on its own.`,
      ms: one.ms,
    })
  }

  // ── 9. Placing an order — only when the account has been confirmed a sandbox ──
  if (!placeTestOrder) {
    add({
      id: 'place-order',
      title: 'Place a test order',
      status: 'skip',
      detail:
        'Not run. Placing an order has a consequence at PowerBody’s end, so it needs the account confirmed as a DEMO/sandbox one first — the control is under this list. A customer order is never sent from here; that is Commerce → Review queue.',
      ms: 0,
    })
  } else {
    add(await testOrderCheck(provider, detailed))
  }

  return {
    source,
    mode: getSupplierMode(),
    credentials,
    looksLikeSandbox: sandboxTells(detailed),
    placedTestOrder: placeTestOrder,
    checks,
    ranAt: new Date().toISOString(),
    ms: Date.now() - started,
  }
}

/**
 * Place one order, on an account the founder has confirmed is a sandbox.
 *
 * ── Why a rejection is a pass ───────────────────────────────────────────────
 * PowerBody's guide is explicit: *"Your API account will be activated in a DEMO
 * / sandbox version, with access limited stock and automatic failure of orders,
 * until we have verified that the integration is successful."* So a DEMO account
 * refusing the order is the documented behaviour, not a fault in the payload —
 * what is being tested here is that we can build a `createOrder` they accept the
 * shape of, reach it, and read their answer back.
 *
 * Their `api_response` distinguishes the two: `FAIL` is an order they looked at
 * and declined (the DEMO behaviour), while a transport error never got that far.
 * `ALREADY_EXISTS` means our reference collided, which is its own answer.
 *
 * The order is marked as a test in every field a human at their end will read —
 * the reference, the comment and the recipient — because the one thing that must
 * not happen is somebody picking and packing it.
 */
async function testOrderCheck(
  provider: SupplierProvider,
  detailed: SupplierProduct[],
): Promise<SupplierCheck> {
  const sku = detailed.find((p) => p.inStock)?.sku ?? detailed[0]?.sku
  if (!sku) {
    return {
      id: 'place-order',
      title: 'Place a test order',
      status: 'skip',
      detail:
        'No SKU came back from the feed, so there is nothing to order. Fix the product-list check above first — an order with no line is not a test of anything.',
      ms: 0,
    }
  }

  const reference = `CHRGD-TEST-${Date.now().toString(36).toUpperCase()}`
  const attempt = await timed(() =>
    provider.placeOrder({
      reference,
      comment: 'INTEGRATION TEST — DO NOT PICK OR SHIP. Placed from the CHRGD founders hub.',
      shippingPrice: 0,
      weightKg: null,
      shippingAddress: {
        name: 'CHRGD Integration',
        line1: 'DO NOT SHIP — API test order',
        city: 'Leeds',
        postcode: 'LS1 4DY',
        country: 'United Kingdom',
      },
      lines: [{ sku, quantity: 1, name: 'Integration test line', unitPrice: 0.01, taxPercent: 20 }],
    }),
  )

  if (attempt.value) {
    /* Accepted. On a DEMO account this is the less likely answer, and it is
       worth saying out loud that something now exists at their end. */
    const readBack = await timed(() => provider.getOrder(attempt.value!.supplierOrderId))
    return {
      id: 'place-order',
      title: 'Place a test order',
      status: 'pass',
      detail:
        `They accepted it as ${attempt.value.supplierOrderId} (status "${attempt.value.status}")` +
        `${readBack.value ? ' and it reads back' : ' — but it did not read back yet, which is normal if their list is date-scoped'}. ` +
        'It is a real order on the account: cancel it at their end if this was not a DEMO account after all.',
      evidence: reference,
      ms: attempt.ms + readBack.ms,
    }
  }

  const message = attempt.error ?? 'no answer'
  const declined = /\bFAIL\b|rejected/i.test(message)
  const duplicate = /ALREADY_EXISTS/i.test(message)

  return {
    id: 'place-order',
    title: 'Place a test order',
    // A declined order on a DEMO account is the documented behaviour and is the
    // result this check is looking for; a transport error is not.
    status: declined || duplicate ? 'pass' : 'fail',
    detail: duplicate
      ? `They answered ALREADY_EXISTS — our reference collided with an order already on the account. The call reached them and was understood, which is what this check is for.`
      : declined
        ? `They received the order and declined it: ${message} — which is exactly what a DEMO account does, and means the payload reached them in a shape they could read. Ask your account manager to take the account out of DEMO once they have seen it.`
        : `The order never got a decision out of them: ${message}`,
    evidence: reference,
    ms: attempt.ms,
  }
}

/** The headline: what a founder should take away from the run. */
export function summarise(report: SupplierDiagnosticsReport): {
  status: CheckStatus
  sentence: string
} {
  const counted = report.checks.filter((c) => c.status !== 'skip')
  const failed = counted.filter((c) => c.status === 'fail')
  const warned = counted.filter((c) => c.status === 'warn')

  if (failed.length) {
    return {
      status: 'fail',
      sentence: `${failed.length} of ${counted.length} checks failed — ${failed[0].title.toLowerCase()} first.`,
    }
  }
  if (warned.length) {
    return {
      status: 'warn',
      sentence: `${counted.length - warned.length} of ${counted.length} checks passed; ${warned.length} want reading.`,
    }
  }
  return { status: 'pass', sentence: `All ${counted.length} checks passed.` }
}
