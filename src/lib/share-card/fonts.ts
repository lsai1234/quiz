import { readFile } from 'fs/promises'
import { join } from 'path'

/**
 * The card's typefaces, as bytes.
 *
 * ── The pairing ─────────────────────────────────────────────────────────────
 * Big Shoulders Display for the display roles and IBM Plex Mono for everything
 * utilitarian — the labels, the quantities, the footer. A condensed grotesque
 * against a mono is what gives the card its 172↔17 scale contrast; the previous
 * pairing (Space Grotesk + Inter) reads as a product UI, which is what the card
 * was being mistaken for.
 *
 * ── Why they are vendored, and why not woff2 ────────────────────────────────
 * `next/font/google` does not expose font binaries to `ImageResponse`, and
 * fetching from `fonts.gstatic.com` at render time puts an uncacheable
 * third-party round trip in front of every card. So the faces are committed
 * here, subsetted to Latin, at ~140KB for all six.
 *
 * The design brief asks for self-hosted **woff2**. Satori does not read woff2 —
 * ttf, otf and woff only — so these are subsetted TTF. Same bytes on the wire
 * as far as the renderer is concerned; nothing fetches them over a network.
 *
 * Regenerate with:
 *
 *   python3 -m fontTools.subset <src>.ttf \
 *     --unicodes="U+0000-00FF,U+2010-2027,U+20A0-20BF,U+2122,U+2190-2193,U+2212,U+FEFF,U+FFFD" \
 *     --layout-features="kern,liga,calt,tnum" --no-hinting --output-file=<dest>.ttf
 *
 * The 900 weight is deliberately absent: the only thing that used it is the
 * score numeral, and that is drawn as outlines now (see digits.ts).
 *
 * Node runtime only — this reads from disk.
 */

const FONT_DIR = join(process.cwd(), 'src/lib/share-card/fonts')

export interface LoadedFont {
  name: string
  data: ArrayBuffer
  weight: 400 | 500 | 600 | 800
  style: 'normal'
}

const FACES: Array<{ file: string; name: string; weight: LoadedFont['weight'] }> = [
  { file: 'BigShouldersDisplay-400.ttf', name: 'Big Shoulders Display', weight: 400 },
  { file: 'BigShouldersDisplay-600.ttf', name: 'Big Shoulders Display', weight: 600 },
  { file: 'BigShouldersDisplay-800.ttf', name: 'Big Shoulders Display', weight: 800 },
  { file: 'IBMPlexMono-400.ttf', name: 'IBM Plex Mono', weight: 400 },
  { file: 'IBMPlexMono-500.ttf', name: 'IBM Plex Mono', weight: 500 },
  { file: 'IBMPlexMono-600.ttf', name: 'IBM Plex Mono', weight: 600 },
]

/** Read every face once per process, sharing one set of reads across
 *  concurrent first requests rather than racing to do the same six. */
let cache: Promise<LoadedFont[]> | null = null

export function loadShareCardFonts(): Promise<LoadedFont[]> {
  cache ??= Promise.all(
    FACES.map(async ({ file, name, weight }) => {
      const buf = await readFile(join(FONT_DIR, file))
      return {
        name,
        // A Buffer is a view into a pooled ArrayBuffer that may be larger than
        // the file, so the slice is load-bearing: hand Satori the whole pool and
        // it parses whatever else Node happened to allocate beside it.
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        weight,
        style: 'normal' as const,
      }
    }),
  )
  return cache
}

export const FONT_DISPLAY = 'Big Shoulders Display'
export const FONT_MONO = 'IBM Plex Mono'

/** Every face, so a test can assert the set without duplicating the list. */
export const SHARE_CARD_FACES = FACES.map(({ file, name, weight }) => ({ file, name, weight }))
