import { listShareCardsForPartner } from '@/lib/db/share-cards'
import { encodeSharePayload } from '@/lib/share-card/codec'
import { sharePersonas } from '@/lib/share-card/personas'
import type { ShareCardPayload } from '@/lib/share-card/types'
import type { PartnerCode } from './types'

/**
 * A partner's share assets.
 *
 * ── The problem this solves ─────────────────────────────────────────────────
 * A partner has no stack of their own, so they have no card — and the thing they
 * most need in order to post is a card with their code on it. Without this they
 * email us for one, which is exactly the loop `/partner` exists to close.
 *
 * So each of their codes gets a **sample card**: a real stack, built by the real
 * engine, with their code in the band. It is labelled as a sample everywhere it
 * appears — it is not a customer's card and must never read as one.
 *
 * ── And the numbers that make it worth posting ──────────────────────────────
 * Cards their followers actually made with the code, and how many times those
 * were opened. Orders and revenue already live on the money tab; this is the top
 * of that funnel, which is the part a partner can do something about.
 *
 * Server-only.
 */

export interface PartnerShareAsset {
  code: string
  discountPct: number
  /** The encoded sample card, for the image routes. */
  encoded: string
  /** The link a partner puts in a bio or a story. */
  link: string
  /** Cards their followers created carrying this code. */
  cardsCreated: number
  /** Times those cards were opened. Bots are not counted — see the repo. */
  cardViews: number
}

/**
 * The sample stack.
 *
 * The engine-built `complete` persona, with the partner's code swapped in and
 * anything personal taken out. Reusing the persona rather than inventing a
 * fixture means a partner's asset can never show a stack the engine would not
 * actually produce.
 */
function sampleFor(code: string): ShareCardPayload {
  const [complete] = sharePersonas()
  const { firstName: _drop, ...rest } = complete.payload
  return { ...rest, code }
}

export async function shareAssetsFor(
  codes: PartnerCode[],
  origin = 'https://getchrgd.co.uk',
): Promise<PartnerShareAsset[]> {
  return Promise.all(
    codes.map(async (code) => {
      // Never allowed to fail the dashboard: a partner who cannot see a view
      // count still needs their assets.
      const cards = await listShareCardsForPartner(code.code).catch(() => [])
      return {
        code: code.code,
        discountPct: Number(code.discountPct) || 0,
        encoded: encodeSharePayload(sampleFor(code.code)),
        link: `${origin}/?ref=${encodeURIComponent(code.code)}`,
        cardsCreated: cards.length,
        cardViews: cards.reduce((n, c) => n + c.viewCount, 0),
      }
    }),
  )
}
