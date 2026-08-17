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
 * The image for the card.
 *
 * A real catalogue image wins when the payload carries one — that path exists so
 * the day there is proper photography it is a data change — and otherwise the
 * family's art is used.
 */
export function cardArt(key: ArtKey | undefined, imageUrl?: string | null): string {
  if (imageUrl) return imageUrl
  return dataUri(ART_SET[key ?? 'wellbeing'].file)
}
