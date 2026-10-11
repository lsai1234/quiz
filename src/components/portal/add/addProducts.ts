/**
 * Adding looked-up products, in requests small enough to finish.
 *
 * ── Why four at a time ────────────────────────────────────────────────────
 * Every product added is a detail call to PowerBody and, for a new product, a
 * classification pass (the AI fills stack slots, goals and card copy). Twenty
 * of those in one request is how "Add all" used to run past the platform's
 * time limit and come back with nothing — not even which ones had landed. Four
 * at a time always finishes, says "8 of 20 added" as it goes, and a failure
 * part-way loses one small batch rather than the lot.
 *
 * "One product with flavours" is chunked the same way: the first request makes
 * the product from up to four flavours, and the rest join it with `into`, four
 * at a time. The server checks every join against the product as it stands, so
 * a flavour of a different size is refused with the reason rather than merged.
 */
import type { CodeCard, StoredRef } from './lookup'

export const ADD_BATCH = 4

export type AddMode = 'separate' | 'combine' | 'into'

/** One product's fate, as `POST /api/portal/supplier` reports it. */
export interface AddOutcome {
  status: 'added' | 'already' | 'removed' | 'refreshed'
  id: string
  title: string
  state?: 'live' | 'pending'
  skus?: string[]
  newSkus?: string[]
}

/** Where a card went. `live` when it joined a product already on sale — it is on sale now too. */
export interface Placement {
  id: string
  title: string
  joined?: boolean
  live?: boolean
}

export interface AddTarget {
  id: string
  title: string
  state?: 'live' | 'pending'
}

export interface AddReport {
  mode: AddMode
  /** Cards sent, and how many requests' worth have been answered. */
  total: number
  done: number
  outcomes: AddOutcome[]
  /** Card key → the product this add put it in. */
  placed: Map<string, Placement>
  /** Card key → the product that already sold it, so nothing was added. */
  held: Map<string, StoredRef>
  /** The product flavours went into (combine and into). */
  target: AddTarget | null
  /** Codes PowerBody did not return when asked to add them. */
  notFound: string[]
  /** Why it stopped, when it stopped early. Nothing after this was sent. */
  refused: { message: string; holder?: string; sizes?: boolean } | null
}

/** What the server needs to fetch a card: its product id when known, otherwise its SKU. */
function idsFor(cards: CodeCard[]): { productIds: string[]; skus: string[] } {
  const productIds: string[] = []
  const skus: string[] = []
  for (const c of cards) {
    if (c.row?.productId) productIds.push(c.row.productId)
    else if (c.row?.sku ?? c.sku) skus.push((c.row?.sku ?? c.sku) as string)
  }
  return { productIds, skus }
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Does this refusal read as the sizes-differ rule? Then the fix is "add them separately". */
function looksLikeSizes(message: string): boolean {
  return /size|servings|weigh|different/i.test(message)
}

/**
 * Match a batch's outcomes back to the cards that were sent.
 *
 * "already" and "removed" carry the SKUs they matched on, so those are exact.
 * "added" carries only an id and a title, so it is matched on the product name
 * PowerBody gave the card — and when one card and one outcome are left over,
 * they are each other's.
 */
function placeBatch(
  cards: CodeCard[],
  outcomes: AddOutcome[],
  into: Map<string, Placement>,
  held: Map<string, StoredRef>,
) {
  const left = new Set(cards.map((c) => c.key))
  const unmatched: AddOutcome[] = []
  for (const o of outcomes) {
    if (o.status === 'added') {
      unmatched.push(o)
      continue
    }
    const skus = new Set((o.skus ?? []).map((s) => s.toUpperCase()))
    for (const c of cards) {
      const sku = (c.row?.sku ?? c.sku ?? '').toUpperCase()
      if (left.has(c.key) && sku && skus.has(sku)) {
        if (o.status === 'refreshed') into.set(c.key, { id: o.id, title: o.title })
        else held.set(c.key, { id: o.id, title: o.title, state: o.status === 'removed' ? 'removed' : (o.state ?? 'live'), skus: o.skus ?? [] })
        left.delete(c.key)
      }
    }
  }
  for (const o of unmatched) {
    const hit = cards.find((c) => left.has(c.key) && c.row?.name === o.title)
    if (hit) {
      into.set(hit.key, { id: o.id, title: o.title })
      left.delete(hit.key)
    }
  }
  const stillAdded = unmatched.filter((o) => ![...into.values()].some((p) => p.id === o.id))
  if (left.size === 1 && stillAdded.length === 1) {
    into.set([...left][0], { id: stillAdded[0].id, title: stillAdded[0].title })
  }
}

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch('/api/portal/supplier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'the server could not be reached — check you are online' } }
  }
}

const errorOf = (r: { status: number; data: Record<string, unknown> }) =>
  typeof r.data.error === 'string' ? r.data.error : `the server answered ${r.status || 'nothing'}`

/**
 * Add the given cards. `onProgress` is called after every request with the
 * report so far, so the screen can count up and show outcomes as they land.
 */
export async function addCards(
  cards: CodeCard[],
  options: { mode: AddMode; title?: string | null; into?: AddTarget | null },
  onProgress: (report: AddReport) => void = () => {},
): Promise<AddReport> {
  const report: AddReport = {
    mode: options.mode,
    total: cards.length,
    done: 0,
    outcomes: [],
    placed: new Map(),
    held: new Map(),
    target: options.mode === 'into' && options.into ? options.into : null,
    notFound: [],
    refused: null,
  }
  const snapshot = (): AddReport => ({
    ...report,
    outcomes: [...report.outcomes],
    placed: new Map(report.placed),
    held: new Map(report.held),
    notFound: [...report.notFound],
  })

  for (const batch of chunks(cards, ADD_BATCH)) {
    const { productIds, skus } = idsFor(batch)
    let body: Record<string, unknown>
    if (options.mode === 'separate') body = { productIds, skus }
    else if (report.target) body = { productIds, skus, into: report.target.id }
    else body = { productIds, skus, combine: true, ...(options.title ? { title: options.title } : {}) }

    const r = await post(body)
    if (!r.ok) {
      const message = errorOf(r)
      report.refused = {
        message,
        holder: typeof r.data.holder === 'string' ? r.data.holder : undefined,
        sizes: r.status === 400 && options.mode !== 'separate' && looksLikeSizes(message),
      }
      onProgress(snapshot())
      return report
    }

    const outcomes = Array.isArray(r.data.outcomes) ? (r.data.outcomes as AddOutcome[]) : []
    report.outcomes.push(...outcomes)
    if (Array.isArray(r.data.notFound)) report.notFound.push(...(r.data.notFound as string[]))

    if (options.mode === 'separate') {
      placeBatch(batch, outcomes, report.placed, report.held)
    } else if (report.target) {
      const target = report.target
      for (const c of batch) {
        report.placed.set(c.key, { id: target.id, title: target.title, joined: true, live: target.state === 'live' })
      }
    } else {
      // The first combine request makes the product (or finds that one already
      // sells these SKUs). Everything after joins whichever it is.
      const made = outcomes[0]
      if (!made) {
        report.refused = { message: 'The server added nothing and did not say why. Try again, or add them separately.' }
        onProgress(snapshot())
        return report
      }
      if (made.status !== 'added') {
        // Not ours to join to automatically: an existing product already sells
        // some of these, and which flavours belong on it is the founder's call.
        placeBatch(batch, outcomes, report.placed, report.held)
        report.done += batch.length
        onProgress(snapshot())
        return report
      }
      report.target = { id: made.id, title: made.title, state: 'pending' }
      for (const c of batch) report.placed.set(c.key, { id: made.id, title: made.title })
    }
    // Codes PowerBody did not return are not in the product, whatever else happened.
    for (const c of batch) {
      const code = c.row?.productId ?? c.row?.sku ?? c.sku
      if (code && report.notFound.includes(code)) report.placed.delete(c.key)
    }
    report.done += batch.length
    onProgress(snapshot())
  }
  return report
}

/** Every product id the add touched, in order, without repeats. */
export function productsTouched(report: AddReport): Array<{ id: string; title: string }> {
  const out = new Map<string, { id: string; title: string }>()
  if (report.target) out.set(report.target.id, { id: report.target.id, title: report.target.title })
  for (const p of report.placed.values()) out.set(p.id, { id: p.id, title: p.title })
  return [...out.values()]
}
