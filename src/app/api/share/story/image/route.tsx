import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { StoryShareCard, STORY_H, STORY_W } from '@/components/share-card/StoryShareCard'
import { decodeStoryShare } from '@/lib/share-card/story'
import { loadShareCardFonts } from '@/lib/share-card/fonts'

/**
 * A card from the read's story, as a 1080×1920 PNG (plan Phase 8).
 *
 * Stateless, like `/api/share/image`: the card is in the query string, checked
 * field by field (`decodeStoryShare`), and anything off its shape, any pattern
 * that may not be shared and any text that isn't a plain product name is a
 * 400. So a crafted link can't put words of its own on our card.
 *
 * Node runtime for the fonts on disk, and cached hard: the same payload always
 * draws the same card.
 */
export const runtime = 'nodejs'

const CACHE = 'public, max-age=31536000, immutable'

export async function GET(req: NextRequest) {
  const share = decodeStoryShare(req.nextUrl.searchParams.get('d') ?? '')
  if (!share) {
    return new Response(JSON.stringify({ error: 'missing or invalid card' }), { status: 400, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  }
  return new ImageResponse(<StoryShareCard share={share} />, {
    width: STORY_W,
    height: STORY_H,
    fonts: await loadShareCardFonts(),
    headers: { 'Cache-Control': CACHE },
  })
}
