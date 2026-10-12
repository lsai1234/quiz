import type { SupplierRow } from '@/lib/supplier/row'
import type { QuickPassResult, SearchResult } from '../lookup'

/**
 * Fixtures and a fetch stand-in for the Add page's tests.
 *
 * The page talks to five endpoints, two of them streamed, so the stand-in is a
 * router: each test says what each endpoint answers, and every request is kept
 * so a test can say what was asked, in what order, with what body.
 */

export function row(overrides: Partial<SupplierRow> = {}): SupplierRow {
  return {
    sku: 'P100',
    productId: '100',
    name: 'Whey Protein 1kg',
    brand: 'PowerBody',
    category: 'Protein',
    imageUrl: null,
    wholesalePrice: 10,
    sellPrice: 19.99,
    contribution: 5.85,
    marginPct: 35,
    marginEstimated: false,
    rrp: 24.99,
    currency: 'GBP',
    stock: 12,
    inStock: true,
    detailed: true,
    mappedId: 'whey-protein-1kg',
    stackSlots: ['protein'],
    hasStimulants: false,
    alreadyAdded: false,
    ...overrides,
  }
}

export function quick(code: string, overrides: Partial<QuickPassResult> = {}): QuickPassResult {
  return { code, kind: 'sku', status: 'unresolved', message: 'Needs a search of PowerBody’s ids.', card: null, stored: null, ...overrides }
}

export function result(code: string, overrides: Partial<SearchResult> = {}): SearchResult {
  return { type: 'result', code, kind: 'sku', status: 'found', message: `Found ${code}.`, next: [], card: null, stored: null, ...overrides }
}

/** A plain JSON reply. */
export function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    body: null,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

/**
 * A streamed NDJSON reply. Each entry is one chunk; a chunk given as a promise
 * arrives when the test resolves it, which is how a test sees the progress
 * lines of a search that has not finished yet.
 */
export function ndjson(chunks: Array<unknown[] | Promise<unknown[]>>): Response {
  const encoder = new TextEncoder()
  let i = 0
  const reader = {
    async read(): Promise<{ done: boolean; value?: Uint8Array }> {
      if (i >= chunks.length) return { done: true }
      const lines = await chunks[i++]
      return { done: false, value: encoder.encode(lines.map((l) => `${JSON.stringify(l)}\n`).join('')) }
    },
  }
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/x-ndjson' }),
    body: { getReader: () => reader },
    json: async () => ({}),
    text: async () => '',
  } as unknown as Response
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

export interface Call {
  url: string
  method: string
  body: Record<string, unknown> | null
}

type Handler = (body: Record<string, unknown> | null, call: Call) => Response | Promise<Response>

/**
 * Route requests by method and path. A handler given as a list answers its
 * calls in turn (the last one repeating), for an endpoint asked more than once.
 */
export function router(routes: Record<string, Handler | Handler[]>) {
  const calls: Call[] = []
  const seen = new Map<string, number>()
  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null
    const call = { url, method, body }
    calls.push(call)
    const path = url.split('?')[0]
    const key = `${method} ${path}`
    const handler = routes[key] ?? routes[`${method} ${url}`]
    if (!handler) throw new Error(`No route for ${key}`)
    if (Array.isArray(handler)) {
      const n = seen.get(key) ?? 0
      seen.set(key, n + 1)
      return handler[Math.min(n, handler.length - 1)](body, call)
    }
    return handler(body, call)
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return { calls, fetchMock }
}

/** What the page asks for on its own before anything is typed. */
export const STANDING = {
  'GET /api/portal/supplier-source': () => json({ mode: 'powerbody', effective: 'powerbody', hasCredentials: true }),
  'GET /api/portal/supplier/index': () =>
    json({ products: 5200, pagesRead: 350, complete: true, updatedAt: '2026-10-08T09:00:00.000Z', sweptIds: 0, sweptFound: 0, sweptTo: 0, sweepComplete: false }),
}
