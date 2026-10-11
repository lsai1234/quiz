/**
 * The Add products page's lookup, as data.
 *
 * Kept apart from the components because it is the part with rules in it —
 * how a pasted blob becomes codes, how a streamed answer is read, how each
 * outcome from the server becomes a card with a next step — and those rules are
 * easier to read (and to test) without a render tree around them.
 *
 * Types only from the server modules: `resolve-code` and `row` pull in the
 * database and the supplier transport, none of which belongs in a browser
 * bundle. `import type` is erased at build, so nothing of theirs ships.
 */
import type { SupplierRow } from '@/lib/supplier/row'
import type { NextStep, RefusalKind } from '@/lib/supplier/resolve-code'

export type { NextStep, RefusalKind }

/** A product in OUR catalogue that already sells a code's SKU. */
export interface StoredRef {
  id: string
  title: string
  state: 'live' | 'pending' | 'removed'
  skus: string[]
}

/** One code's answer from the quick pass (`POST /api/portal/supplier/resolve {codes}`). */
export interface QuickPassResult {
  code: string
  kind: 'sku' | 'id'
  status: 'found' | 'unresolved' | 'not-on-account'
  productId?: string
  via?: string
  message: string
  card: SupplierRow | null
  stored: StoredRef | null
}

export interface QuickPassResponse {
  /** Which supplier answered: `mock` (the sample catalogue) or `powerbody`. */
  supplier: string
  source: 'mock' | 'powerbody'
  refusal: { kind: RefusalKind; message: string; next: NextStep[] } | null
  index: { products: number; complete: boolean; updatedAt: string | null } | null
  results: QuickPassResult[]
}

/** The last line of a streamed search (`{code, stream: true}`). */
export interface SearchResult {
  type: 'result'
  code: string
  kind?: 'sku' | 'id'
  status: 'found' | 'not-yet' | 'not-on-account' | 'refused' | 'wrong-product' | 'unusable'
  refusal?: RefusalKind
  message: string
  next?: NextStep[]
  alsoMeant?: { code: string; productId: string }
  productId?: string
  via?: string
  supplierName?: string
  card: SupplierRow | null
  stored: StoredRef | null
}

/**
 * Where a card stands.
 *
 * `checking` is the quick pass, `queued` is waiting for its turn at a search,
 * `searching` is the search running, `held` is a code our catalogue already
 * sells (so it is not searched for at all), and `stopped` is a code the batch
 * never reached because PowerBody refused an earlier one. Everything else is
 * the server's own answer.
 */
export type CardStatus =
  | 'checking'
  | 'queued'
  | 'searching'
  | 'held'
  | 'stopped'
  | SearchResult['status']

/** What a search asks for. Kept on the card so "Search again" repeats it exactly. */
export interface Ask {
  code: string
  searchAnyway?: boolean
  expectSku?: string | null
}

/** A remark on a card from something done to it on this page (a restore, an add). */
export interface CardNote {
  tone: 'positive' | 'attention' | 'critical'
  text: string
  href?: string
  hrefLabel?: string
}

export interface CodeCard {
  key: string
  /** What was typed or ticked. The card's name until a product is found. */
  code: string
  /** The SKU this card is about, once known — what a pasted id must match. */
  sku: string | null
  status: CardStatus
  message: string
  refusal?: RefusalKind
  next: NextStep[]
  alsoMeant?: { code: string; productId: string }
  row: SupplierRow | null
  stored: StoredRef | null
  /** Live progress lines from the search, in order. */
  steps: string[]
  ticked: boolean
  /**
   * Set once it has been added from this page, so it cannot be added twice.
   * `joined` when it became a flavour of an existing product; `live` when that
   * product is on sale, which means this flavour is on sale now too.
   */
  placed?: { id: string; title: string; joined?: boolean; live?: boolean }
  note?: CardNote
  lastAsk?: Ask
}

/**
 * A set of cards looked up together, and added together.
 *
 * Codes from the box are one group. Codes ticked in PowerBody's spreadsheet
 * come one group per product, so the flavours of one tub stay side by side —
 * and "Add as one product with flavours" can be the obvious choice for them
 * without being the default for a pasted list of unrelated things.
 */
export interface LookupGroup {
  key: string
  /** The product name, for a group from the spreadsheet. Null for the box. */
  title: string | null
  brand?: string
  source: 'box' | 'csv' | 'roster'
  cards: CodeCard[]
}

/** How many codes one lookup takes — the quick pass's own ceiling. */
export const MAX_CODES = 200

/**
 * A code as PowerBody write it: no spaces, upper case.
 *
 * The same rule as the server's `normaliseCode` — repeated rather than imported
 * because that module brings the supplier transport with it.
 */
export function normaliseCode(code: string): string {
  return code.trim().replace(/\s+/g, '').toUpperCase()
}

/**
 * Split a pasted blob into codes, whatever separated them.
 *
 * Codes come out of spreadsheets (new lines, tabs), emails (commas), and other
 * people's notes (semicolons, pipes, bullets), so anything that cannot be part
 * of a code separates them. A slash is NOT a separator: some brands' codes carry
 * one. Duplicates are dropped after normalising, so "p1234" and "P1234" are one
 * lookup, not two.
 */
export function splitCodes(raw: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of raw.split(/[\s,;|•·]+/)) {
    const code = normaliseCode(part.replace(/^[-*]+|[-*.]+$/g, ''))
    if (!code || seen.has(code)) continue
    seen.add(code)
    out.push(code)
  }
  return out
}

/** All digits: a PowerBody product id rather than a SKU. */
export function isProductId(code: string): boolean {
  return /^\d{1,9}$/.test(code)
}

/**
 * Read a newline-delimited JSON response, one line at a time, as it arrives.
 *
 * Streamed so a search that takes two minutes shows what it is doing for those
 * two minutes. Falls back to reading the whole body when the response cannot be
 * streamed (an old browser, a proxy that buffered it) — the lines still arrive,
 * just all at once at the end.
 */
export async function readNdjson(res: Response, onLine: (line: Record<string, unknown>) => void): Promise<void> {
  const emit = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    try {
      onLine(JSON.parse(trimmed))
    } catch {
      // A torn or garbled line is skipped. The result line is the one that
      // matters, and a missing one is handled by the caller as "no answer".
    }
  }

  const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null
  if (!reader) {
    for (const line of (await res.text()).split('\n')) emit(line)
    return
  }
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl = buffer.indexOf('\n')
    while (nl >= 0) {
      emit(buffer.slice(0, nl))
      buffer = buffer.slice(nl + 1)
      nl = buffer.indexOf('\n')
    }
  }
  emit(buffer + decoder.decode())
}

/**
 * The buttons a not-on-account answer offers when it came from the quick pass,
 * which says what it found but not what to do about it.
 *
 * On the sample catalogue there is no list to refresh and no id to search, so
 * the only real next steps are checking the code and switching to Live.
 */
export function notOnAccountNext(source: 'mock' | 'powerbody' | null): NextStep[] {
  return source === 'mock'
    ? ['check-code', 'open-settings']
    : ['check-code', 'refresh-index', 'search-anyway', 'paste-id']
}

/** A new card for a code, before anything is known about it. */
export function freshCard(key: string, code: string): CodeCard {
  return {
    key,
    code,
    sku: isProductId(code) ? null : code,
    status: 'checking',
    message: 'Checking…',
    next: [],
    row: null,
    stored: null,
    steps: [],
    ticked: false,
  }
}

/**
 * A card with a server answer applied — the quick pass's or a search's.
 *
 * A found product is ticked unless we already sell it: ticking is "add this",
 * and something already in the catalogue is a link to it, not a candidate.
 */
export function withAnswer(card: CodeCard, answer: SearchResult): CodeCard {
  const row = answer.card ?? null
  const stored = answer.stored ?? card.stored
  if (answer.status === 'found') {
    return {
      ...card,
      status: 'found',
      sku: row?.sku ?? card.sku,
      row,
      stored,
      message: answer.message,
      next: answer.next ?? [],
      refusal: undefined,
      alsoMeant: answer.alsoMeant,
      ticked: Boolean(row) && !stored,
      note: undefined,
    }
  }
  return {
    ...card,
    status: answer.status,
    row: null,
    stored,
    message: answer.message,
    refusal: answer.status === 'refused' ? (answer.refusal ?? 'supplier-error') : undefined,
    next: answer.next ?? [],
    alsoMeant: answer.alsoMeant,
    ticked: false,
  }
}

/** A found card that can still be added: it has a product and nothing sells it yet. */
export function isAddable(card: CodeCard): boolean {
  return card.status === 'found' && Boolean(card.row) && !card.stored && !card.placed
}

export const money = (n: number) => `£${n.toFixed(2)}`

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "12 Oct" — a date a founder reads, not an ISO stamp. */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null
  const at = Date.parse(iso)
  return Number.isFinite(at) ? Math.floor((now - at) / 86_400_000) : null
}

/** How long to wait after the nth rate limit in a row: 45s, then doubling, five minutes at most. */
export function rateLimitWait(attempt: number): number {
  return Math.min(300_000, 45_000 * 2 ** Math.max(0, attempt - 1))
}

/** After this many rate limits in a row the batch stops and says so. */
export const MAX_RATE_LIMIT_PAUSES = 5
