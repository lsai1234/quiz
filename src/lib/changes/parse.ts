/**
 * Parsing a founder's action from a request body into a resolution.
 *
 * Lives here rather than in a route file because Next only permits handler
 * exports from `route.ts`, and both the single and bulk endpoints need it.
 */
import type { ChangeResolution } from './types'

export interface ResolutionInput {
  action?: string
  replacementProductId?: string
  /** For a price pass-on: 0 = absorb it all, 1 = pass all of it on. */
  passOnPct?: number
}

/** Null when the action isn't one we recognise, or is missing what it needs. */
export function toResolution(body: ResolutionInput): ChangeResolution | null {
  switch (body.action) {
    case 'substitute':
      return body.replacementProductId
        ? { type: 'substitute', replacementProductId: body.replacementProductId }
        : null
    case 'remove':
      return { type: 'remove' }
    case 'hold':
      return { type: 'hold' }
    case 'dismiss':
      return { type: 'dismiss' }
    default:
      return null
  }
}
