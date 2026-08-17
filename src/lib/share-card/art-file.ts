import { readFileSync } from 'fs'
import { join } from 'path'
import { ART_SET, type ArtKey } from './art'

/**
 * The art, as bytes. Server only.
 *
 * Split from `art.ts` because that half is imported by `format.ts`, which the
 * share sheet needs in the browser — and a top-level `import 'fs'` anywhere in
 * that chain breaks the client bundle. Same reasoning as `fonts.ts`: read from
 * disk on the node runtime, cached per process, rather than inlined as base64.
 */

const ART_DIR = join(process.cwd(), 'src/lib/share-card/art')

const cache = new Map<string, string>()

function dataUri(file: string): string {
  const hit = cache.get(file)
  if (hit) return hit
  const uri = `data:image/png;base64,${readFileSync(join(ART_DIR, file)).toString('base64')}`
  cache.set(file, uri)
  return uri
}

/**
 * The image for the card, or null when there is none to draw.
 *
 * Resolution order is the one in the brief: uploaded (arrives as `imageUrl`) →
 * bundled → nothing, and nothing means the card draws the family's gradient
 * field instead. Null rather than a stand-in file, because a card that renders a
 * broken image slot is worse than one that renders a designed absence.
 */
export function cardArt(key: ArtKey | undefined, imageUrl?: string | null): string | null {
  if (imageUrl) return imageUrl
  const file = ART_SET[key ?? 'wellbeing'].file
  return file ? dataUri(file) : null
}
