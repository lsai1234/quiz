/**
 * "Why won't this order send?" — every question with a definite answer, asked
 * about one order.
 *
 * A refused order used to leave one line on its timeline, ending in whatever
 * single word PowerBody put in `api_response`. That is not something anyone can
 * act on, and the founder looking at it is on a phone with a customer waiting.
 * This runs the checks that separate the possible causes and says which one it
 * is, in the order a person would try them:
 *
 *   1. What PowerBody said last time — their own reason beats any inference.
 *   2. Whether a send even goes to PowerBody (simulate vs live).
 *   3. Our own gate — the same rules the send applies (`sendBlocker`).
 *   4. The delivery address, as their form will receive it.
 *   5. Each item, live at PowerBody: does the code exist, is it in stock, is it
 *      still sold.
 *   6. Whether PowerBody already hold an order under this reference.
 *   7. The two fields we send empty — weight and delivery service.
 *
 * ── What it will not do ──
 * Nothing here places, updates or cancels anything. Every supplier call is a
 * read. Sending is the order page's button, behind its own gate.
 *
 * Server-only: it calls the supplier.
 */
import { getSupplier, getSupplierSource } from '@/lib/supplier'
import { getOrderingSource } from '@/lib/supplier/ordering'
import { toCreateOrderPayload } from '@/lib/supplier/powerbody/wire'
import type { SupplierProduct, SupplierProvider } from '@/lib/supplier/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { getOrder } from './repo'
import { reviewStateOf, sendBlocker, supplierOrderInputFor } from './service'
import type { Order, SupplierAttempt } from './types'

export type SendCheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

export interface SendCheck {
  id: string
  title: string
  status: SendCheckStatus
  /** One or two sentences, written for a founder rather than a developer. */
  detail: string
  /** What came back, when seeing it is the point. */
  evidence?: string
}

export interface SendDiagnosis {
  orderId: string
  ranAt: string
  /** The one thing to take away. */
  headline: { status: SendCheckStatus; sentence: string }
  checks: SendCheck[]
  /** The last send, as recorded — or as recovered from the timeline. */
  lastAttempt: SupplierAttempt | null
  /**
   * True when `lastAttempt` was rebuilt from a timeline line, because the send
   * happened before attempts were recorded. Only the sentence survives those.
   */
  lastAttemptFromTimeline: boolean
  /** Exactly what a send would put on the wire now — to compare, or to forward. */
  payload: unknown | null
}

// ─── The last answer ─────────────────────────────────────────────────────────

/**
 * The last send, recorded or reconstructed.
 *
 * An order that failed before `lastSupplierAttempt` existed has only its
 * `submit_failed` sentence, which ended `…: <CODE>. Nothing has shipped`. The
 * code is read back out of it so those orders get a diagnosis too — including
 * the one that prompted this file.
 */
export function lastAttemptOf(order: Order): { attempt: SupplierAttempt | null; fromTimeline: boolean } {
  if (order.lastSupplierAttempt) return { attempt: order.lastSupplierAttempt, fromTimeline: false }

  const latest = [...order.events]
    .reverse()
    .find((e) => e.type === 'submit_failed' || e.type === 'submitted_to_supplier')
  if (!latest) return { attempt: null, fromTimeline: false }

  const sentence = latest.detail ?? ''
  if (latest.type === 'submitted_to_supplier') {
    return {
      attempt: {
        at: latest.at,
        ok: true,
        simulated: /SIMULATED/.test(sentence),
        outcome: 'accepted',
        code: null,
        reason: null,
        reply: null,
        request: null,
        error: null,
      },
      fromTimeline: true,
    }
  }

  const code = /: ([A-Z_]+)\. Nothing has shipped/.exec(sentence)?.[1] ?? null
  // The old reader said UNKNOWN for any reply it could not parse, so that word
  // means "unreadable", not a code PowerBody sent.
  const unreadable = code === 'UNKNOWN'
  return {
    attempt: {
      at: latest.at,
      ok: false,
      simulated: false,
      outcome: unreadable ? 'unreadable' : code ? 'rejected' : 'error',
      code: unreadable ? null : code,
      reason: null,
      reply: null,
      request: null,
      error: sentence,
    },
    fromTimeline: true,
  }
}

function lastAnswerCheck(attempt: SupplierAttempt | null, fromTimeline: boolean): SendCheck {
  const base = { id: 'last-answer', title: 'What PowerBody said last time' }
  if (!attempt) return { ...base, status: 'skip', detail: 'Not sent yet, so there is no answer to read.' }

  if (attempt.ok) {
    return {
      ...base,
      status: 'pass',
      detail: attempt.simulated
        ? 'The last send was a simulation — it never reached PowerBody.'
        : 'PowerBody accepted the last send.',
    }
  }

  const evidence = attempt.reply ? `Their reply: ${attempt.reply}` : undefined
  const oldRecord = fromTimeline
    ? ' This send was made before the hub kept their whole reply, so anything they said beyond that word was not saved. Press Retry once: the next answer, reason and all, is recorded here.'
    : ''

  switch (attempt.outcome) {
    case 'rejected':
      if (attempt.reason) {
        return {
          ...base,
          status: 'fail',
          detail: `PowerBody refused it and said why: “${attempt.reason}”${attempt.code ? ` (${attempt.code})` : ''}.`,
          evidence,
        }
      }
      if (attempt.code === 'TOO_MANY_REQUESTS') {
        return {
          ...base,
          status: 'warn',
          detail: 'PowerBody answered TOO_MANY_REQUESTS — they were rate limiting us, not refusing the order. Wait a minute and send it again.',
          evidence,
        }
      }
      return {
        ...base,
        status: 'fail',
        detail: `PowerBody answered ${attempt.code ?? 'with a refusal'} and gave no reason.${oldRecord}`,
        evidence,
      }
    case 'unreadable':
      return {
        ...base,
        status: 'fail',
        detail: fromTimeline
          ? 'The hub could not read PowerBody’s answer. That was before it could read every shape their API replies in — press Retry. If the order did reach them, it is now recognised rather than marked failed.'
          : 'PowerBody answered in a shape the hub could not read, and the order was not on their account when we looked. That is a fault at our end, not theirs — their exact reply is below.',
        evidence,
      }
    case 'fault':
      return {
        ...base,
        status: 'fail',
        detail: `PowerBody’s server refused the call: “${attempt.reason ?? attempt.error}”.`,
        evidence,
      }
    case 'unreachable':
      return {
        ...base,
        status: 'warn',
        detail: `No answer from PowerBody: ${attempt.reason ?? attempt.error}. Nothing was decided at their end, so sending again is safe.`,
      }
    default:
      return { ...base, status: 'fail', detail: attempt.error ?? 'The send failed before it reached PowerBody.' }
  }
}

// ─── The address, as their form receives it ──────────────────────────────────

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** UK numbers, as digits: 07… / 01… (11), or the same after 44 (12). */
function plausibleUkPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('44')) return digits.length === 12
  if (digits.startsWith('0')) return digits.length === 11
  return false
}

interface PayloadAddress {
  name: string
  surname: string
  address1: string
  postcode: string
  city: string
  country_code: string
  phone: string
  email: string
}

function addressCheck(address: PayloadAddress): SendCheck {
  const base = { id: 'address', title: 'Delivery address, as PowerBody receive it' }
  const problems: string[] = []
  const notes: string[] = []

  if (!UK_POSTCODE.test(address.postcode.trim())) problems.push(`“${address.postcode}” is not a UK postcode`)
  if (address.country_code !== 'GB') problems.push(`the country is “${address.country_code}”, and a UK account ships within the UK only`)
  if (!address.phone && !address.email) problems.push('there is neither a phone number nor an email for the courier')
  if (address.phone && !plausibleUkPhone(address.phone)) notes.push(`the phone number “${address.phone}” does not look like a UK number`)
  if (address.email && !EMAIL.test(address.email)) notes.push(`the email “${address.email}” does not look valid`)
  if (address.name === address.surname) notes.push('there is only one name, so it is sent as both first name and surname')

  const sent = `${address.name} / ${address.surname} · ${address.address1}, ${address.city}, ${address.postcode} · ${address.phone || 'no phone'} · ${address.email || 'no email'}`
  if (problems.length > 0) {
    return { ...base, status: 'fail', detail: `Fix before sending: ${problems.join('; ')}.`, evidence: sent }
  }
  if (notes.length > 0) {
    return { ...base, status: 'warn', detail: `Worth a look: ${notes.join('; ')}.`, evidence: sent }
  }
  return { ...base, status: 'pass', detail: 'UK postcode, a name, and a way for the courier to reach them.', evidence: sent }
}

// ─── The items, live at PowerBody ────────────────────────────────────────────

/**
 * Look the order's items up, by product id first.
 *
 * The id the catalogue already holds is one detail call per product, fresh, with
 * no paging — and it reaches products past the list feed's 3,000-row ceiling,
 * which a SKU search cannot. Only what that leaves unresolved goes through the
 * SKU search. An id is accepted only when the product behind it carries the SKU
 * the order asks for: a stale id must cost a wasted call, never a wrong answer.
 */
async function lookUpItems(
  supplier: SupplierProvider,
  order: Order,
  catalogue: CatalogueProduct[],
): Promise<{ found: Map<string, SupplierProduct>; error: string | null }> {
  const skus = [...new Set(order.lines.map((l) => l.sku).filter((s): s is string => !!s))]
  const found = new Map<string, SupplierProduct>()
  let error: string | null = null
  const note = (err: unknown) => {
    error ??= err instanceof Error ? err.message : String(err)
  }

  const ids = new Set<string>()
  for (const line of order.lines) {
    const id = catalogue.find((p) => p.id === line.productId)?.supplierProductId
    if (line.sku && id) ids.add(String(id))
  }
  if (ids.size > 0) {
    try {
      for (const product of await supplier.getProductsById([...ids])) {
        if (skus.includes(product.sku)) found.set(product.sku, product)
      }
    } catch (err) {
      note(err)
    }
  }

  const missing = skus.filter((sku) => !found.has(sku))
  if (missing.length > 0) {
    try {
      for (const product of await supplier.getProductsBySku(missing)) {
        if (missing.includes(product.sku)) found.set(product.sku, product)
      }
    } catch (err) {
      note(err)
    }
  }
  return { found, error }
}

function itemChecks(order: Order, found: Map<string, SupplierProduct>, error: string | null): SendCheck[] {
  return order.lines
    .filter((line) => line.sku)
    .map((line): SendCheck => {
      const sku = line.sku!
      const base = { id: `item-${sku}`, title: `${sku} · ${line.title}` }
      const product = found.get(sku)
      if (!product) {
        return error
          ? {
              ...base,
              status: 'warn',
              detail: `Could not be checked — PowerBody did not answer for it: ${error}`,
            }
          : {
              ...base,
              status: 'fail',
              detail: `PowerBody have no product with this code on your account. They cannot fill a line they do not sell — press Change on this item below to swap it or take it off and refund it.`,
            }
      }

      const evidence = `PowerBody: “${product.name}” · stock ${product.stock} · costs us £${product.wholesalePrice.toFixed(2)}`
      if (!product.inStock && product.stock > 0) {
        return {
          ...base,
          status: 'fail',
          detail: 'PowerBody have stopped selling this (disabled or archived), though some stock still shows. They will not ship it — press Change on this item below to swap it or take it off and refund it.',
          evidence,
        }
      }
      if (product.stock < line.quantity) {
        return {
          ...base,
          status: 'fail',
          detail:
            product.stock <= 0
              ? 'Out of stock at PowerBody, and an order with a line they cannot fill is refused. Press Change on this item below: swap it, take it off and refund it, or send the rest now and this later.'
              : `Only ${product.stock} in stock at PowerBody and this order needs ${line.quantity}. Press Change on this item below to sort it.`,
          evidence,
        }
      }
      return { ...base, status: 'pass', detail: `In stock — ${product.stock} available, ${line.quantity} needed.`, evidence }
    })
}

// ─── Already there? ──────────────────────────────────────────────────────────

async function alreadyThereCheck(supplier: SupplierProvider, order: Order): Promise<SendCheck> {
  const base = { id: 'already-there', title: 'Does PowerBody already have it?' }
  try {
    const theirs = await supplier.getOrder(order.id)
    if (!theirs) {
      return {
        ...base,
        status: 'pass',
        detail: 'No — nothing under this order’s reference on your PowerBody account, so sending again cannot double up.',
      }
    }
    return {
      ...base,
      status: 'warn',
      detail:
        `Yes — PowerBody hold it as ${theirs.supplierOrderId} (status: ${theirs.status}), so an earlier send did get through. ` +
        'Press Retry: their duplicate answer is now read as the success it is, and the order is linked rather than sent twice.',
    }
  } catch (err) {
    return {
      ...base,
      status: 'skip',
      detail: `Could not ask: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── The two fields we send empty ────────────────────────────────────────────

function weightCheck(weightKg: number | null): SendCheck {
  const base = { id: 'weight', title: 'Parcel weight' }
  if (weightKg != null) return { ...base, status: 'pass', detail: `Sent as ${weightKg} kg.` }
  return {
    ...base,
    status: 'warn',
    detail:
      'Sent empty. PowerBody publish no weights, so unless one was typed in at import review we have none, and they weigh the parcel themselves. If their reason mentions weight, this is it: add a weight to each product under Products → Review and send again.',
  }
}

async function deliveryServiceCheck(supplier: SupplierProvider): Promise<SendCheck> {
  const base = { id: 'delivery-service', title: 'Delivery service' }
  if (typeof supplier.shippingMethods !== 'function') {
    return { ...base, status: 'skip', detail: 'This supplier does not offer a list of delivery services.' }
  }
  try {
    const methods = await supplier.shippingMethods()
    if (methods.length === 0) {
      return {
        ...base,
        status: 'pass',
        detail: 'Sent empty, so PowerBody choose — and the account lists no services to choose between.',
      }
    }
    return {
      ...base,
      status: 'warn',
      detail:
        'Sent empty (transport_code), so PowerBody choose. Their account lists the services below. If their reason mentions transport or shipping, this is it — the code needs wiring into the order.',
      evidence: methods.map((m) => `${m.name} (${m.code})`).join(' · '),
    }
  } catch (err) {
    return {
      ...base,
      status: 'skip',
      detail: `Could not ask which services the account has: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── The headline ────────────────────────────────────────────────────────────

/**
 * One sentence that says what to do.
 *
 * Their own reason leads when there is one: it beats anything inferred. Then a
 * problem we can see. Then the conclusion that is left when everything we can
 * check is fine and they still said no without a reason — which is what a
 * PowerBody account still in DEMO mode does with every order.
 */
function headlineOf(
  checks: SendCheck[],
  attempt: SupplierAttempt | null,
  fromTimeline: boolean,
): SendDiagnosis['headline'] {
  const failed = checks.filter((c) => c.status === 'fail' && c.id !== 'last-answer')

  if (attempt && !attempt.ok && attempt.reason && (attempt.outcome === 'rejected' || attempt.outcome === 'fault')) {
    return {
      status: 'fail',
      sentence:
        `PowerBody said: “${attempt.reason}”.` +
        (failed.length > 0 ? ` The checks below found something that fits: ${failed[0].title} — ${failed[0].detail}` : ''),
    }
  }
  if (failed.length > 0) {
    return { status: 'fail', sentence: `${failed[0].title}: ${failed[0].detail}` }
  }
  if (attempt && !attempt.ok) {
    if (attempt.outcome === 'unreadable') {
      return { status: 'fail', sentence: checks.find((c) => c.id === 'last-answer')!.detail }
    }
    if (attempt.outcome === 'unreachable' || attempt.code === 'TOO_MANY_REQUESTS') {
      return { status: 'warn', sentence: 'PowerBody did not get as far as deciding. Nothing below is wrong — send it again.' }
    }
    if (attempt.outcome === 'rejected') {
      return {
        status: 'fail',
        sentence: fromTimeline
          ? 'Everything we can check is fine, and the last refusal came without a reason the hub kept. Press Retry once — their full answer is recorded now. If it is FAIL with no reason again, the account is almost certainly still in PowerBody’s DEMO mode, where every order fails until they switch live ordering on: ask your PowerBody account manager.'
          : 'Everything we can check is fine — the items are in stock and the address is complete — and PowerBody still refused it without saying why. That is how an account still in their DEMO mode answers every order. Ask your PowerBody account manager to switch on live ordering for the API account.',
      }
    }
  }
  const warned = checks.filter((c) => c.status === 'warn')
  if (warned.length > 0) {
    return { status: 'warn', sentence: `Nothing blocks it. ${warned.length === 1 ? 'One thing is' : `${warned.length} things are`} worth reading below.` }
  }
  return { status: 'pass', sentence: 'Nothing wrong found — it can be sent.' }
}

// ─── The run ─────────────────────────────────────────────────────────────────

export async function diagnoseSupplierSend(
  id: string,
  deps: { supplier?: SupplierProvider } = {},
): Promise<SendDiagnosis | null> {
  const order = await getOrder(id)
  if (!order) return null

  const { attempt, fromTimeline } = lastAttemptOf(order)
  const checks: SendCheck[] = [lastAnswerCheck(attempt, fromTimeline)]

  // ── Where a send goes ──
  const ordering = getOrderingSource()
  checks.push(
    ordering === 'live'
      ? { id: 'ordering', title: 'Where a send goes', status: 'pass', detail: 'To PowerBody, for real.' }
      : {
          id: 'ordering',
          title: 'Where a send goes',
          status: 'warn',
          detail:
            'Nowhere — order sending is set to simulate, so a send walks the steps and nothing reaches PowerBody. Settings → Supplier → Order sending switches it.',
        },
  )

  // ── Our own gate ──
  const blocked = sendBlocker(order, { assumeApproved: true })
  checks.push(
    blocked
      ? { id: 'gate', title: 'Our own checks before sending', status: 'fail', detail: blocked }
      : {
          id: 'gate',
          title: 'Our own checks before sending',
          status: 'pass',
          detail: `Paid, has PowerBody codes on every item, and has an address they deliver to. Review: ${reviewStateOf(order)} — pressing send here approves it.`,
        },
  )

  // ── The payload, and the address inside it ──
  const fulfilable = order.lines.filter((l) => l.sku)
  let payload: ReturnType<typeof toCreateOrderPayload> | null = null
  let weightKg: number | null = null
  if (order.shippingAddress && fulfilable.length > 0) {
    const input = await supplierOrderInputFor(order, fulfilable)
    weightKg = input.weightKg ?? null
    payload = toCreateOrderPayload(input)
    checks.push(addressCheck(payload.address))
    checks.push(weightCheck(weightKg))
  }

  // ── Live reads ──
  if (getSupplierSource() !== 'powerbody') {
    checks.push({
      id: 'items',
      title: 'The items at PowerBody',
      status: 'skip',
      detail: 'The supplier is set to the sample feed, so there is no PowerBody account to check the items against.',
    })
  } else {
    let supplier: SupplierProvider | null = deps.supplier ?? null
    let unreachable: string | null = null
    try {
      supplier ??= await getSupplier()
    } catch (err) {
      unreachable = err instanceof Error ? err.message : String(err)
    }

    if (!supplier) {
      checks.push({ id: 'items', title: 'The items at PowerBody', status: 'fail', detail: `Could not reach PowerBody at all: ${unreachable}` })
    } else {
      let catalogue: CatalogueProduct[] = []
      try {
        const { getResolvedCatalogue } = await import('@/lib/catalogue/resolve')
        catalogue = (await getResolvedCatalogue()).products
      } catch {
        // Costs the id shortcut, not the check: the SKU search still runs.
      }
      const { found, error } = await lookUpItems(supplier, order, catalogue)
      checks.push(...itemChecks(order, found, error))
      checks.push(await alreadyThereCheck(supplier, order))
      checks.push(await deliveryServiceCheck(supplier))
    }
  }

  return {
    orderId: order.id,
    ranAt: new Date().toISOString(),
    headline: headlineOf(checks, attempt, fromTimeline),
    checks,
    lastAttempt: attempt,
    lastAttemptFromTimeline: fromTimeline,
    payload,
  }
}
