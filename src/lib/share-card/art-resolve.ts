import { readArtUpload } from '@/lib/db/share-card-art'
import { cardArt } from './art-file'
import type { ArtKey } from './art'

/**
 * The picture for a card, in the brief's resolution order:
 * uploaded → bundled → the product render → nothing, where nothing means the
 * gradient field.
 *
 * ── The product render goes LAST, not first ─────────────────────────────────
 * It used to go first: `if (heroImage) return heroImage`, before the database
 * was ever consulted. And `heroImage` is set by `payload.ts` from the first
 * product in the stack — so every real stack had one, and an uploaded
 * photograph could only ever appear on a card whose lineup was empty. A founder
 * could upload all six images, see them stored, and never see one on a card.
 *
 * The brief is unambiguous about which way round these go: the product render
 * from `public/hero/` is the *placeholder* the art set exists to replace —
 * "the card is about a stack, not a product, so a single bottle under a headline
 * about six supplements is the wrong picture". A picture somebody chose beats
 * the stand-in that was there because nobody had.
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
  try {
    const upload = await readArtUpload(key ?? 'wellbeing')
    if (upload) return `data:${upload.mime};base64,${upload.data}`
  } catch {
    // A card with the stand-in art beats a card that 500s because the settings
    // table is unreachable. The founder sees the placeholder and knows.
  }

  // Bundled art next. `null` for the hero here on purpose — `cardArt` returns
  // whatever it is handed before it looks at its own set, and the product render
  // is the rung below the art set rather than above it.
  const bundled = cardArt(key, null)
  if (bundled) return bundled

  return heroImage ?? null
}
