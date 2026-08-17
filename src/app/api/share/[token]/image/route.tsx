import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { ShareCard } from '@/components/share-card/ShareCard'
import { buildShareCardView, isShareFormat, FORMATS, type ShareFormat } from '@/lib/share-card/format'
import { loadShareCardFonts } from '@/lib/share-card/fonts'
import { competitionBand } from '@/lib/competition/band'
import { getShareCard } from '@/lib/db/share-cards'

/**
 * A stored card, as a PNG.
 *
 * The same renderer as `/api/share/image`, fed from `share_cards` instead of
 * from the query string. That route stays as the no-database path and as what
 * the styleguide draws; this one is what a short link resolves to.
 *
 * Views are deliberately NOT counted here. Every unfurl bot that touches a
 * pasted link fetches this image, and counting those would make a card nobody
 * opened look like a card that travelled. The landing page counts.
 */
export const runtime = 'nodejs'

/** A card is immutable, so it caches hard — one story from someone with reach is
 *  a lot of requests for one image, and each uncached one is a full rasterise. */
const CACHE = 'public, max-age=31536000, immutable'

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params

  const requested = req.nextUrl.searchParams.get('format') ?? 'og'
  if (!isShareFormat(requested)) {
    return json(400, { error: `unknown format "${requested}"` })
  }
  const format: ShareFormat = requested

  const card = await getShareCard(token)
  if (!card) return json(404, { error: 'not found' })

  const spec = FORMATS[format]
  const band = format === 'entry' ? await competitionBand() : null
  return new ImageResponse(<ShareCard view={buildShareCardView(card.payload, format, band)} />, {
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
