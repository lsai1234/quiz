import { readFounderImage } from '@/lib/db/founder-images'

/**
 * An uploaded photograph, as bytes.
 *
 * Public and unguarded on purpose, exactly like the share card's art route:
 * these are pictures printed on pages anybody can see, and putting the portal
 * guard on them would mean a bundle's photo only loaded while a founder session
 * cookie happened to be valid.
 *
 * Addressed by content — the `?v=` in the URL is the row's version — so a
 * request carrying the right version can be cached forever and a replacement is
 * picked up the moment its URL changes.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const image = await readFounderImage(decodeURIComponent(id))
  if (!image) return new Response('Not found', { status: 404 })

  const bytes = Buffer.from(image.data, 'base64')
  const versioned = new URL(req.url).searchParams.get('v') === image.version

  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': image.mime,
      'content-length': String(bytes.length),
      etag: `"${image.version}"`,
      'cache-control': versioned
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate',
    },
  })
}
