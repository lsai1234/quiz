import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { ShareCard } from '@/components/share-card/ShareCard'
import { buildShareCardView, isShareFormat, FORMATS, type ShareFormat } from '@/lib/share-card/format'
import { decodeSharePayload } from '@/lib/share-card/codec'
import { loadShareCardFonts } from '@/lib/share-card/fonts'

/**
 * The card, as a PNG.
 *
 * Phase 1 serves cards straight from an encoded payload in the query string —
 * the stateless half of §3.5. Phase 3 adds `/api/share/[token]/image`, which
 * looks the payload up in `share_cards` and calls exactly this renderer; this
 * route stays as the no-database path and as what `/styleguide/share` draws.
 *
 * Node runtime, not edge: the fonts are read from disk (see fonts.ts), and the
 * three faces put the bundle over the edge limit anyway.
 */
export const runtime = 'nodejs'

/**
 * A card is immutable — the payload it draws is a frozen snapshot — so it can be
 * cached hard. That matters more than it looks: a story posted by someone with
 * reach is a lot of requests for one image, and each uncached one is a full
 * rasterise.
 */
const CACHE = 'public, max-age=31536000, immutable'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams

  const requested = params.get('format') ?? 'story'
  if (!isShareFormat(requested)) {
    return json(400, { error: `unknown format "${requested}"`, formats: Object.keys(FORMATS) })
  }
  const format: ShareFormat = requested

  const payload = decodeSharePayload(params.get('d') ?? '')
  if (!payload) {
    // Deliberately not "here is what was wrong with your payload" — this route
    // takes user-controlled input and a validator that narrates itself is a
    // validator that helps someone probe it.
    return json(400, { error: 'missing or invalid payload' })
  }

  const view = buildShareCardView(payload, format)
  const spec = FORMATS[format]

  return new ImageResponse(<ShareCard view={view} />, {
    width: spec.width,
    height: spec.height,
    fonts: await loadShareCardFonts(),
    headers: { 'Cache-Control': CACHE },
  })
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
