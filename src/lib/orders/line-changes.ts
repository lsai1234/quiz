/**
 * What to do when an item on a paid order cannot be sent.
 *
 * It happens between payment and sending: PowerBody sell the last one to
 * somebody else. The checkout stock check (`lib/supplier/stock-check`) makes it
 * rare — the gap is minutes once automatic sending is on — but it cannot make it
 * impossible, and before this the only tools were Refund (all of it) and Cancel.
 *
 * Three answers, one per line, each taken by a founder from the order page:
 *
 *   SWAP          The closest like-for-like product instead — same swap group,
 *                 never less safe than the original (dietary tags kept,
 *                 stimulant-free kept, no new contraindications). If it costs
 *                 less, the difference goes back; if it costs more, we absorb it.
 *   REMOVE        Take it off and refund exactly that line; the rest ships.
 *   SEND LATER    Take it off into its own linked order, held until it is back
 *                 in stock, while the rest ships now. The new order shares the
 *                 original payment, so it can later be sent, swapped, or
 *                 refunded on its own — for its own value, never the whole
 *                 payment. On a one-line order it is simply the order that waits.
 *
 * Each one emails the customer what happened unless told not to, and every one
 * of them offers a refund by reply: a one-off customer never agreed in advance
 * to a substitute the way a subscriber does (`lib/changes/policy`).
 *
 * Only before PowerBody have the order. Once they do, it is theirs to pick, and
 * a change here would only make the hub disagree with the parcel.
 *
 * Server-only.
 */
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import { getPaymentSource } from '@/lib/payments'
import { checkLiveStock, type LiveStock } from '@/lib/supplier/stock-check'
import type { SupplierProvider } from '@/lib/supplier/types'
import { getOrder, saveOrder, updateOrder } from './repo'
import { newOrderId, newOrderReference, orderReference } from './service'
import { neverPaid } from './unpaid'
import type { Order, OrderLine } from './types'

const round = (n: number) => Math.round(n * 100) / 100
const lineValue = (line: Pick<OrderLine, 'unitPrice' | 'quantity'>) => round(line.unitPrice * line.quantity)
const at = () => new Date().toISOString()

export interface LineChangeDeps {
  supplier?: SupplierProvider
  catalogue?: CatalogueProduct[]
}

export interface ChangeOptions {
  by?: string | null
  /** Email the customer about it. Default true. */
  notify?: boolean
  /**
   * Swap: the founder picked this product by hand and has seen what it does not
   * keep from the original. Without it, a swap that breaks a promise is refused.
   */
  acceptWarnings?: boolean
}

async function catalogueFor(deps: LineChangeDeps): Promise<CatalogueProduct[]> {
  if (deps.catalogue) return deps.catalogue
  const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
  return (await getResolvedCatalogue()).products
}

// ─── Guards ──────────────────────────────────────────────────────────────────

/** Why this order's lines cannot be changed, or null. */
export function lineChangeBlocker(order: Order): string | null {
  if (neverPaid(order)) return 'This order was never paid for, so there is nothing to change.'
  if (order.supplierOrderId) {
    return 'PowerBody already have this order, so its items can no longer be changed here.'
  }
  if (order.status !== 'paid' && order.status !== 'failed') {
    return `This order is ${order.status.replace(/_/g, ' ')} — items can only be changed before it is sent.`
  }
  return null
}

/** The line, checked against the SKU the screen thought it was changing. */
function lineAt(order: Order, index: number, sku: string | null | undefined): OrderLine {
  const line = order.lines[index]
  if (!line) throw new Error('That item is no longer on the order — reload the page.')
  if ((sku ?? null) !== (line.sku ?? null)) {
    throw new Error('The order changed while you were looking at it — reload the page and try again.')
  }
  return line
}

async function editable(id: string): Promise<Order> {
  const order = await getOrder(id)
  if (!order) throw new Error('Order not found.')
  const blocked = lineChangeBlocker(order)
  if (blocked) throw new Error(blocked)
  return order
}

const titleOf = (line: Pick<OrderLine, 'title' | 'variantTitle'>) =>
  line.variantTitle ? `${line.title} (${line.variantTitle})` : line.title

// ─── Money ───────────────────────────────────────────────────────────────────

/**
 * Put `amount` back on the order's payment. Throws BEFORE anything on the order
 * changes, so a refund that did not happen is never recorded as one.
 *
 * Mock payments move no money, so there is nothing to refund — the order still
 * records the amount, so the numbers read the same either way.
 */
async function refundPart(order: Order, amount: number, key: string, reason: string): Promise<'stripe' | 'mock'> {
  if (amount <= 0 || getPaymentSource() !== 'stripe') return 'mock'
  if (!order.stripePaymentIntentId) {
    throw new Error(
      'There is no card payment on this order to refund against. Refund it in Stripe by hand, then remove the item.',
    )
  }
  const { refundPaymentAmount } = await import('@/lib/payments/stripe')
  await refundPaymentAmount(order.stripePaymentIntentId, amount, { idempotencyKey: key, reason })
  return 'stripe'
}

/**
 * How much the Refund button should give back for this order: the whole payment
 * when the order is the whole payment, else exactly what the order is worth now.
 *
 * Null means "the whole payment", which is what Refund always did. An order
 * that was split, or has already had a line refunded, is no longer the whole
 * payment — refunding the payment would hand back money for goods in another
 * order, or refund the same item twice.
 */
export function refundAmountFor(order: Order): number | null {
  const shared = Boolean(order.splitFrom) || (order.splitInto?.length ?? 0) > 0 || (order.refundedAmount ?? 0) > 0
  return shared ? round(order.total) : null
}

// ─── Email ───────────────────────────────────────────────────────────────────

async function tellCustomer(
  order: Order,
  update: { kind: 'removed' | 'swapped' | 'backordered'; productTitle: string; replacementTitle?: string; refund?: number; restOnItsWay: boolean },
  dedupe: string,
): Promise<boolean> {
  if (!order.email) return false
  try {
    const { appBaseUrl, canSendFromHub } = await import('@/lib/notify')
    const { queueNotification, sendNotificationNow } = await import('@/lib/notify/outbox')
    const { orderItemUpdate } = await import('@/lib/notify/templates')
    const base = appBaseUrl()
    const queued = await queueNotification({
      userId: order.userId,
      email: order.email,
      template: 'order-item-update',
      dedupeKey: `order-item-update:${order.id}:${dedupe}`,
      rendered: orderItemUpdate(
        {
          ...update,
          reference: orderReference(order),
          firstName: order.shippingAddress?.name?.split(' ')[0] ?? null,
          accountUrl: order.userId ? `${base}/myhub` : null,
        },
        { baseUrl: base },
      ),
    })
    // A founder pressing the button IS the decision this email reports, so it
    // goes now rather than waiting in Emails for a second press. With no
    // provider it stays there to be copied out, as every email does.
    if (canSendFromHub()) await sendNotificationNow(queued.id)
    return true
  } catch (err) {
    console.error('[orders] item update email failed:', err)
    return false
  }
}

// ─── Options for one line ────────────────────────────────────────────────────

export interface ReplacementOption {
  productId: string
  variantId: string
  sku: string
  title: string
  variantTitle: string | null
  /** Our price for it (£). */
  price: number
  /** Price minus what they paid per unit. Negative: we refund the gap. */
  difference: number
  /** PowerBody's stock, when asked live; else the catalogue's figure. */
  stock: number | null
  /** True when PowerBody confirmed it just now. */
  confirmed: boolean
}

export interface LineOptions {
  index: number
  line: OrderLine
  value: number
  /** What PowerBody hold of this item right now, when they answered. */
  live: LiveStock | null
  replacements: ReplacementOption[]
  /** Removing it would empty the order — Refund/Cancel the order instead. */
  onlyLine: boolean
}

/**
 * Like-for-like, and never less safe than what they bought.
 *
 * Without the customer's quiz answers on a one-off order, the original product
 * is the best statement of what suits them: whatever it promised — vegan,
 * stimulant-free, free of a contraindication — the replacement has to promise
 * too.
 */
export function isSafeReplacement(original: CatalogueProduct, candidate: CatalogueProduct): boolean {
  return safetyWarnings(original, candidate).length === 0
}

const CONTRAINDICATION_WORDS: Record<string, string> = {
  pregnancy: 'pregnancy or breastfeeding',
  medication: 'prescription medication',
  shellfish: 'a shellfish allergy',
}

/**
 * Every promise the original made that this candidate breaks, in words.
 *
 * Empty means like-for-like on safety. The suggested swaps only ever offer
 * those; a founder picking by hand sees these instead, and has to confirm.
 */
export function safetyWarnings(original: CatalogueProduct, candidate: CatalogueProduct): string[] {
  const warnings: string[] = []
  for (const tag of original.dietaryTags ?? []) {
    const has = candidate.dietaryTags?.includes(tag) || (tag === 'vegetarian' && candidate.dietaryTags?.includes('vegan'))
    if (!has) warnings.push(`Not ${tag} — the original was`)
  }
  if (!original.hasStimulants && candidate.hasStimulants) warnings.push('Contains stimulants — the original did not')
  const allowed = new Set(original.contraindications ?? [])
  for (const flag of candidate.contraindications ?? []) {
    if (!allowed.has(flag)) warnings.push(`Not suitable with ${CONTRAINDICATION_WORDS[flag] ?? flag} — the original was`)
  }
  return warnings
}

/** The variant to offer: in stock, coded, and priced nearest what they paid. */
function bestVariant(product: CatalogueProduct, paidUnit: number): CatalogueVariant | null {
  const sellable = product.variants.filter((v) => v.available && v.sku)
  if (sellable.length === 0) return null
  return [...sellable].sort((a, b) => Math.abs(a.price - paidUnit) - Math.abs(b.price - paidUnit))[0]
}

export function replacementCandidates(
  order: Order,
  line: OrderLine,
  catalogue: CatalogueProduct[],
  limit = 6,
): ReplacementOption[] {
  const original = catalogue.find((p) => p.id === line.productId)
  if (!original) return []
  const onOrder = new Set(order.lines.map((l) => l.productId))
  const sameKind = (p: CatalogueProduct) =>
    original.swapGroup ? p.swapGroup === original.swapGroup : p.category === original.category

  return catalogue
    .filter((p) => p.id !== original.id && !onOrder.has(p.id) && sameKind(p) && isSafeReplacement(original, p))
    .map((p) => ({ product: p, variant: bestVariant(p, line.unitPrice) }))
    .filter((c): c is { product: CatalogueProduct; variant: CatalogueVariant } => c.variant !== null)
    .sort((a, b) => Math.abs(a.variant.price - line.unitPrice) - Math.abs(b.variant.price - line.unitPrice))
    .slice(0, limit)
    .map(({ product, variant }) => ({
      productId: product.id,
      variantId: variant.id,
      sku: variant.sku!,
      title: product.title,
      variantTitle: variant.flavour || variant.size || null,
      price: variant.price,
      difference: round(variant.price - line.unitPrice),
      stock: variant.inventory ?? null,
      confirmed: false,
    }))
}

export interface ProductPick {
  productId: string
  title: string
  brand: string | null
  category: string
  /** Variants that can be sent: in stock in the catalogue and coded. */
  variants: { variantId: string; sku: string; label: string | null; price: number; difference: number; stock: number | null }[]
  /** What it does not keep from the original — see `safetyWarnings`. */
  warnings: string[]
}

/**
 * Any product in the catalogue, for a founder who knows what they want to send.
 *
 * The suggested swaps are deliberately narrow: same kind of product, every
 * promise kept. Sometimes the right replacement is none of them — a different
 * brand the customer mentioned, a bigger tub as an apology — so this searches
 * the whole sendable catalogue by name, brand, category, flavour or code. What
 * it does not keep from the original is shown, not hidden, and the swap asks
 * for a second press when there is anything to show.
 */
export async function searchReplacements(
  id: string,
  index: number,
  query: string,
  deps: LineChangeDeps = {},
): Promise<ProductPick[]> {
  const order = await editable(id)
  const line = order.lines[index]
  if (!line) throw new Error('That item is no longer on the order — reload the page.')
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []

  const catalogue = await catalogueFor(deps)
  const original = catalogue.find((p) => p.id === line.productId)
  const matches = (product: CatalogueProduct) => {
    const haystack = [
      product.title,
      product.brand ?? '',
      product.category,
      ...product.variants.flatMap((v) => [v.sku ?? '', v.flavour ?? '', v.size ?? '', v.title]),
    ]
      .join(' ')
      .toLowerCase()
    return tokens.every((t) => haystack.includes(t))
  }

  return catalogue
    .filter((p) => p.id !== line.productId && matches(p))
    .map((product): ProductPick => ({
      productId: product.id,
      title: product.title,
      brand: product.brand ?? null,
      category: product.category,
      variants: product.variants
        .filter((v) => v.available && v.sku)
        .map((v) => ({
          variantId: v.id,
          sku: v.sku!,
          label: v.flavour || v.size || null,
          price: v.price,
          difference: round(v.price - line.unitPrice),
          stock: v.inventory ?? null,
        })),
      warnings: original ? safetyWarnings(original, product) : [],
    }))
    .filter((p) => p.variants.length > 0)
    // Exact title matches first, then the nearest price to what they paid.
    .sort((a, b) => {
      const exact = Number(b.title.toLowerCase().includes(query.toLowerCase())) - Number(a.title.toLowerCase().includes(query.toLowerCase()))
      if (exact !== 0) return exact
      return Math.abs(a.variants[0].difference) - Math.abs(b.variants[0].difference)
    })
    .slice(0, 20)
}

/**
 * Everything the order page needs to decide about one line: what PowerBody hold
 * of it now, and the closest replacements they can actually send.
 */
export async function lineOptions(id: string, index: number, deps: LineChangeDeps = {}): Promise<LineOptions> {
  const order = await editable(id)
  const line = order.lines[index]
  if (!line) throw new Error('That item is no longer on the order — reload the page.')
  const catalogue = await catalogueFor(deps)
  const candidates = replacementCandidates(order, line, catalogue)

  const idFor = (productId: string) => catalogue.find((p) => p.id === productId)?.supplierProductId ?? null
  const check = await checkLiveStock(
    [
      ...(line.sku ? [{ sku: line.sku, quantity: line.quantity, title: titleOf(line), supplierProductId: idFor(line.productId) }] : []),
      ...candidates.map((c) => ({ sku: c.sku, quantity: line.quantity, title: c.title, supplierProductId: idFor(c.productId) })),
    ],
    { supplier: deps.supplier, deadlineMs: 10_000 },
  ).catch(() => null)

  const live = new Map((check?.live ?? []).map((l) => [l.sku, l]))
  const short = new Set((check?.shortfalls ?? []).map((s) => s.sku))
  return {
    index,
    line,
    value: lineValue(line),
    live: line.sku ? (live.get(line.sku) ?? null) : null,
    // A replacement PowerBody say is short is no replacement at all.
    replacements: candidates
      .filter((c) => !short.has(c.sku))
      .map((c) => {
        const l = live.get(c.sku)
        return l ? { ...c, stock: l.stock, confirmed: true } : c
      }),
    onlyLine: order.lines.length === 1,
  }
}

// ─── Swap ────────────────────────────────────────────────────────────────────

export async function swapLine(
  id: string,
  index: number,
  sku: string | null,
  replacement: { productId: string; variantId: string },
  options: ChangeOptions = {},
  deps: LineChangeDeps = {},
): Promise<Order> {
  const order = await editable(id)
  const line = lineAt(order, index, sku)
  const catalogue = await catalogueFor(deps)
  const product = catalogue.find((p) => p.id === replacement.productId)
  const variant = product?.variants.find((v) => v.id === replacement.variantId)
  if (!product || !variant || !variant.sku) throw new Error('That replacement is not in the catalogue any more.')
  if (!variant.available) throw new Error(`${product.title} is out of stock too — pick another.`)
  const original = catalogue.find((p) => p.id === line.productId)
  const warnings = original ? safetyWarnings(original, product) : []
  if (warnings.length > 0 && !options.acceptWarnings) {
    throw new Error(
      `${product.title} does not keep everything ${original!.title} promised: ${warnings.join('; ')}. Confirm to send it anyway.`,
    )
  }

  // Asked live: the whole point is to send something that IS there.
  const check = await checkLiveStock(
    [{ sku: variant.sku, quantity: line.quantity, title: product.title, supplierProductId: product.supplierProductId ?? null }],
    { supplier: deps.supplier, deadlineMs: 10_000 },
  )
  if (check.shortfalls.length > 0) throw new Error(`${product.title} is out of stock at PowerBody too — pick another.`)

  // They never pay more for our stock problem; a cheaper swap gives the gap back.
  const unitPrice = Math.min(variant.price, line.unitPrice)
  const refund = round((line.unitPrice - unitPrice) * line.quantity)
  const replacementTitle = variant.flavour || variant.size ? `${product.title} (${variant.flavour || variant.size})` : product.title
  const how = await refundPart(order, refund, `line-swap:${order.id}:${index}:${variant.sku}`, `Swapped ${line.sku} for ${variant.sku}`)

  const next: OrderLine = {
    sku: variant.sku,
    productId: product.id,
    title: product.title,
    variantTitle: variant.flavour || variant.size || null,
    quantity: line.quantity,
    unitPrice,
    supplierCost: variant.cost ?? product.cost ?? null,
    weightGrams: product.weightGrams ?? null,
  }
  const updated = await updateOrder(id, (o) => {
    o.lines[index] = next
    o.subtotal = round(o.subtotal - refund)
    o.total = round(o.subtotal + o.shipping)
    if (refund > 0) o.refundedAmount = round((o.refundedAmount ?? 0) + refund)
    o.events.push({
      at: at(),
      type: 'line_swapped',
      detail:
        `${titleOf(line)} (${line.sku}) → ${replacementTitle} (${variant.sku})` +
        (refund > 0 ? ` · refunded £${refund.toFixed(2)}${how === 'mock' ? ' (mock payments — no money moved)' : ''}` : '') +
        (warnings.length > 0 ? ` · chosen despite: ${warnings.join('; ')}` : '') +
        (options.by ? ` · by ${options.by}` : ''),
    })
  })
  if (!updated) throw new Error('Order not found.')
  if (options.notify !== false) {
    await tellCustomer(
      updated,
      { kind: 'swapped', productTitle: titleOf(line), replacementTitle, refund, restOnItsWay: updated.lines.length > 1 },
      `swap:${index}:${variant.sku}`,
    )
  }
  return updated
}

// ─── Remove and refund ───────────────────────────────────────────────────────

export async function removeLine(
  id: string,
  index: number,
  sku: string | null,
  options: ChangeOptions = {},
): Promise<Order> {
  const order = await editable(id)
  const line = lineAt(order, index, sku)
  if (order.lines.length === 1) {
    throw new Error('This is the only item on the order — refund or cancel the whole order instead.')
  }
  const amount = lineValue(line)
  const how = await refundPart(order, amount, `line-remove:${order.id}:${index}:${line.sku ?? line.productId}`, `Removed ${line.sku ?? line.title}`)

  const updated = await updateOrder(id, (o) => {
    o.lines.splice(index, 1)
    o.subtotal = round(o.subtotal - amount)
    o.total = round(o.subtotal + o.shipping)
    o.refundedAmount = round((o.refundedAmount ?? 0) + amount)
    o.events.push({
      at: at(),
      type: 'line_removed',
      detail:
        `${titleOf(line)} (${line.sku ?? 'no code'}) taken off · refunded £${amount.toFixed(2)}` +
        (how === 'mock' ? ' (mock payments — no money moved)' : '') +
        (options.by ? ` · by ${options.by}` : ''),
    })
  })
  if (!updated) throw new Error('Order not found.')
  if (options.notify !== false) {
    await tellCustomer(updated, { kind: 'removed', productTitle: titleOf(line), refund: amount, restOnItsWay: true }, `remove:${index}:${line.sku}`)
  }
  return updated
}

// ─── Send the rest now, this one later ───────────────────────────────────────

export async function backorderLine(
  id: string,
  index: number,
  sku: string | null,
  options: ChangeOptions = {},
): Promise<{ order: Order; backorder: Order }> {
  const order = await editable(id)
  const line = lineAt(order, index, sku)
  const title = titleOf(line)
  const since = at()
  const note = `Waiting for ${title} to come back in stock at PowerBody.`

  // One line: nothing to split — the order itself waits.
  if (order.lines.length === 1) {
    const updated = await updateOrder(id, (o) => {
      o.backorder = { sku: line.sku ?? '', title, since }
      o.review = { state: 'held', by: options.by ?? null, at: since, note }
      if (o.status === 'failed') o.status = 'paid'
      o.events.push({ at: since, type: 'backordered', detail: `${title} out of stock — the order waits for it${options.by ? ` · by ${options.by}` : ''}` })
    })
    if (!updated) throw new Error('Order not found.')
    if (options.notify !== false) {
      await tellCustomer(updated, { kind: 'backordered', productTitle: title, restOnItsWay: false }, `backorder:${index}:${line.sku}`)
    }
    return { order: updated, backorder: updated }
  }

  const amount = lineValue(line)
  const childId = newOrderId()
  const child: Order = {
    ...order,
    id: childId,
    reference: newOrderReference(),
    status: 'paid',
    lines: [{ ...line }],
    subtotal: amount,
    // The parcel the customer already paid postage for is the first one. This
    // one is on us.
    shipping: 0,
    total: amount,
    review: { state: 'held', by: options.by ?? null, at: since, note },
    supplierOrderId: null,
    supplierStatus: null,
    supplierSimulated: undefined,
    trackingNumber: null,
    lastSupplierAttempt: null,
    autoSend: null,
    // Attribution stays with the original: the commission was earned on it once.
    partnerCode: null,
    partnerDiscountPct: null,
    billedAmount: null,
    refundedAmount: 0,
    splitFrom: order.id,
    splitInto: [],
    backorder: { sku: line.sku ?? '', title, since },
    foundersAlertedAt: undefined,
    analyticsReported: undefined,
    events: [
      { at: since, type: 'created', detail: `split from ${order.id} (${orderReference(order)}) to wait for stock` },
      { at: since, type: 'paid', detail: `paid as part of ${order.id}` },
    ],
    createdAt: since,
    updatedAt: since,
  }
  await saveOrder(child)

  const updated = await updateOrder(id, (o) => {
    o.lines.splice(index, 1)
    o.subtotal = round(o.subtotal - amount)
    o.total = round(o.subtotal + o.shipping)
    o.splitInto = [...(o.splitInto ?? []), childId]
    o.events.push({
      at: since,
      type: 'line_backordered',
      detail: `${title} (${line.sku ?? 'no code'}) moved to ${childId} to follow when back in stock${options.by ? ` · by ${options.by}` : ''}`,
    })
  })
  if (!updated) throw new Error('Order not found.')
  if (options.notify !== false) {
    await tellCustomer(updated, { kind: 'backordered', productTitle: title, restOnItsWay: true }, `backorder:${index}:${line.sku}`)
  }
  return { order: updated, backorder: child }
}
