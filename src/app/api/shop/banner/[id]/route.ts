import { readBanner } from '@/lib/db/shop-banners'

/**
 * A hero banner's artwork, as bytes.
 *
 * Public and unguarded on purpose: this is the picture at the top of the shop,
 * which anyone can see. Putting the portal guard on it would mean the banner
 * only rendered while a founder's session cookie happened to be valid.
 *
 * Addressed by content — `bannerImageSrc` puts the version in the query string
 * — so a matching request can be cached forever and replacing the artwork mints
 * a different URL that is picked up at once. A request without the version, or
 * with a stale one, still serves the current image but is not cached, so a
 * hand-typed URL can never pin an old picture.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const banner = await readBanner(id)
  if (!banner) return new Response('Not found', { status: 404 })

  const bytes = Buffer.from(banner.data, 'base64')
  const versioned = new URL(req.url).searchParams.get('v') === banner.version

  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': banner.mime,
      'content-length': String(bytes.length),
      etag: `"${banner.version}"`,
      'cache-control': versioned
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate',
    },
  })
}
