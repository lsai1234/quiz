import { track } from './events'
import type { ShareFormat } from '@/lib/share-card/format'

/**
 * Typed wrappers for the share funnel, alongside `funnel` for the quiz.
 *
 * Thin, named helpers over `track()` so the event contract lives in one
 * unit-testable place and components never construct event names by hand.
 *
 * The rung matters more than the total. There is no API for posting to
 * Instagram Stories from mobile web, so the card reaches a story through the OS
 * share sheet — and when that path is unavailable it falls to a download, and
 * then to press-and-hold. Each of those is a worse experience than the one above
 * it, and a failure part-way down looks identical to someone changing their mind
 * unless `share_method` says which rung actually carried the share.
 */

/** How a share actually completed — the rungs of the ladder in §3.6. */
export type ShareMethod = 'native-file' | 'native-link' | 'download' | 'long-press' | 'copy-link'

/** Where the ladder gave up, when it did. */
export type ShareFailure = 'render' | 'share-unavailable' | 'share-failed' | 'download-blocked' | 'clipboard'

export const share = {
  /** The sheet was opened from the results screen. Top of this funnel. */
  open(p: { format: ShareFormat; hasCode: boolean }) {
    track('share_open', { format: p.format, hasCode: p.hasCode })
  },

  /** The card image came back. `ms` is what the customer actually waited. */
  render(p: { format: ShareFormat; ms: number; bytes?: number }) {
    track('share_render', { format: p.format, ms: Math.round(p.ms), bytes: p.bytes })
  },

  /** Someone switched size before sharing. */
  format(p: { from: ShareFormat; to: ShareFormat }) {
    track('share_format', { from: p.from, to: p.to })
  },

  /**
   * A share completed, and on which rung.
   *
   * Note `native-*` fires when the OS sheet was *handed* the card, not when the
   * customer posted it: the Web Share API resolves on dismissal too and does not
   * say where anything went. Treat it as "reached the sheet", never as a post.
   */
  method(p: { method: ShareMethod; format: ShareFormat }) {
    track('share_method', { method: p.method, format: p.format })
  },

  /** A rung failed. The ladder continues; this records what was skipped. */
  error(p: { at: ShareFailure; format: ShareFormat; message?: string }) {
    track('share_error', { at: p.at, format: p.format, message: p.message?.slice(0, 120) })
  },

  /** Closed without sharing. `share_open` minus this minus `share_method` is
   *  the population still sitting on the sheet, which should be ~0. */
  dismiss(p: { format: ShareFormat; shared: boolean }) {
    track('share_dismiss', { format: p.format, shared: p.shared })
  },
}
