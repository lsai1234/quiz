/**
 * The vocabulary of the error log.
 *
 * Kept in its own file with no imports so both the server sink and the client
 * reporter can share it without either dragging the other's dependencies into
 * a bundle.
 */

/**
 * Which part of the product broke.
 *
 * These are the customer-facing journeys plus the places a failure is invisible
 * to the customer but fatal to the business. The split matters because the
 * response differs: a broken `quiz` costs you a signup, a broken `webhook`
 * costs you an order you already took money for and don't know about.
 */
export const SURFACES = [
  'quiz',
  'shop',
  'myhub',
  'checkout',
  'webhook',
  'cron',
  'hub',
  'api',
  'unknown',
] as const
export type Surface = (typeof SURFACES)[number]

/**
 * How much it matters.
 *
 * `critical` is reserved for "money or an order is at risk right now" — a failed
 * webhook, a checkout that threw, a cron that died. It is the only severity that
 * raises the banner on the hub dashboard, and it stays meaningful only if
 * nothing else is allowed to use it.
 */
export const SEVERITIES = ['critical', 'error', 'warning'] as const
export type Severity = (typeof SEVERITIES)[number]

/** Where it was raised — a browser or the server. */
export const KINDS = ['client', 'server'] as const
export type ErrorKind = (typeof KINDS)[number]

/** What a human has decided about a group of identical errors. */
export const GROUP_STATES = ['open', 'resolved', 'muted'] as const
export type GroupState = (typeof GROUP_STATES)[number]

/** Free-form structured detail attached to an occurrence. Never PII. */
export type ErrorContext = Record<string, string | number | boolean | null>

/** One recorded occurrence. */
export interface ErrorOccurrence {
  id: string
  fingerprint: string
  surface: Surface
  severity: Severity
  kind: ErrorKind
  message: string
  stack: string | null
  path: string | null
  sessionId: string | null
  userId: string | null
  context: ErrorContext
  createdAt: string
}

/**
 * A distinct fault: every occurrence sharing a fingerprint, collapsed.
 *
 * This is the unit the hub shows. `count` is how many times it happened in the
 * window being viewed, `lastSeen` is what tells you whether it is still
 * happening, and `sample` is the most recent occurrence — the one carrying the
 * stack you would actually read.
 */
export interface ErrorGroup {
  fingerprint: string
  surface: Surface
  severity: Severity
  kind: ErrorKind
  message: string
  count: number
  sessions: number
  firstSeen: string
  lastSeen: string
  state: GroupState
  note: string | null
  sample: ErrorOccurrence | null
}

/** Longest we keep any one field. Bounds a hostile or runaway client. */
export const LIMITS = {
  message: 500,
  stack: 4000,
  path: 300,
  sessionId: 100,
  contextKeys: 20,
  contextValue: 200,
} as const

export function isSurface(v: unknown): v is Surface {
  return typeof v === 'string' && (SURFACES as readonly string[]).includes(v)
}

export function isSeverity(v: unknown): v is Severity {
  return typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v)
}

export function isGroupState(v: unknown): v is GroupState {
  return typeof v === 'string' && (GROUP_STATES as readonly string[]).includes(v)
}

/**
 * The surface a URL path belongs to.
 *
 * Shared by the client reporter (which knows only `location.pathname`) and the
 * server sink (which re-derives it rather than trusting what was posted).
 */
export function surfaceForPath(path: string | null | undefined): Surface {
  if (!path) return 'unknown'
  if (path.startsWith('/founderhub')) return 'hub'
  if (path.startsWith('/myhub')) return 'myhub'
  if (path.startsWith('/shop')) return 'shop'
  if (path.startsWith('/order')) return 'checkout'
  if (path.startsWith('/api/webhooks')) return 'webhook'
  if (path.startsWith('/api/cron')) return 'cron'
  if (path.startsWith('/api/checkout')) return 'checkout'
  if (path.startsWith('/api')) return 'api'
  // The quiz is the root scroll experience plus the bundle and share routes it
  // hands off to; everything customer-facing that isn't the shop or the hub.
  if (path === '/' || path.startsWith('/bundles') || path.startsWith('/s/')) return 'quiz'
  return 'unknown'
}
