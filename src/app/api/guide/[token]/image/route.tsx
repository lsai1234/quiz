import { ImageResponse } from 'next/og'
import { GuideImage, GUIDE_W, guideImageHeight } from '@/components/guide/GuideImage'
import { getGuide } from '@/lib/guide/store'
import { loadShareCardFonts } from '@/lib/share-card/fonts'

/**
 * The stack guide as a PNG: in the guide email and behind "Save the image".
 * The token is the only key. Private caching only: it is one person's guide,
 * and an email client's image proxy may keep its own copy, but no shared cache
 * should.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const guide = await getGuide(token)
  if (!guide) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  return new ImageResponse(<GuideImage guide={guide} />, {
    width: GUIDE_W,
    height: guideImageHeight(guide),
    fonts: await loadShareCardFonts(),
    headers: { 'Cache-Control': 'private, max-age=86400', 'X-Robots-Tag': 'noindex, nofollow' },
  })
}
