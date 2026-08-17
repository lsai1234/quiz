import { readArtUpload } from '@/lib/db/share-card-art'

/**
 * An uploaded category photograph, as bytes.
 *
 * The renderer does not use this — it inlines the image from the row, because a
 * card render must not make a network call (see `art-resolve.ts`). This exists
 * for the settings screen's preview, which is a browser and wants a URL.
 *
 * Public and unguarded on purpose: these are the pictures printed on a card
 * anyone can see, and putting the portal guard on them would mean the preview
 * only worked while a session cookie happened to be valid.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  const upload = await readArtUpload(key)
  if (!upload) return new Response('Not found', { status: 404 })

  const bytes = Buffer.from(upload.data, 'base64')

  // Addressed by content: the version in the query string changes when the image
  // does, so this can be held forever and a replacement is picked up at once.
  const versioned = new URL(req.url).searchParams.get('v') === upload.version

  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': upload.mime,
      'content-length': String(bytes.length),
      etag: `"${upload.version}"`,
      'cache-control': versioned
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate',
    },
  })
}
