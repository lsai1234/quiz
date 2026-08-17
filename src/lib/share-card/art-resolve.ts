import { readArtUpload } from '@/lib/db/share-card-art'
import { cardArt } from './art-file'
import type { ArtKey } from './art'

/**
 * The picture for a card, in the brief's resolution order:
 * uploaded → bundled → nothing, where nothing means the gradient field.
 *
 * ── Why the bytes are inlined ───────────────────────────────────────────────
 * Satori fetches an `<img src>` over the network unless it is already a data
 * URI, and a card render that makes a network call is a card render that fails
 * intermittently under load and cannot be rasterised in a test with no network
 * at all. So the image is read from the row and handed over as bytes, which is
 * the same thing the bundled path has always done.
 *
 * ── Why this is not inside `cardArt` ────────────────────────────────────────
 * `cardArt` is synchronous and reads only from disk; this reaches the database.
 * Keeping them apart means `/styleguide/share` and the renderer's own tests
 * still work with no database at all, and the routes that do have one opt in.
 *
 * Server-only.
 */
export async function resolveCardArt(
  key: ArtKey | undefined,
  heroImage?: string | null,
): Promise<string | null> {
  if (heroImage) return heroImage

  try {
    const upload = await readArtUpload(key ?? 'wellbeing')
    if (upload) return `data:${upload.mime};base64,${upload.data}`
  } catch {
    // A card with the stand-in art beats a card that 500s because the settings
    // table is unreachable. The founder sees the placeholder and knows.
  }

  return cardArt(key, null)
}
