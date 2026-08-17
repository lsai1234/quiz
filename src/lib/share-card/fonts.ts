import { readFile } from 'fs/promises'
import { join } from 'path'

/**
 * The card's typefaces, as bytes.
 *
 * ── Why they are vendored rather than imported ──────────────────────────────
 * The app loads Space Grotesk and Inter through `next/font/google`, which is the
 * right thing for the browser: it self-hosts them, subsets them and hands the
 * page a class name. What it does not hand anyone is the font *binary*, and
 * Satori needs exactly that — an ArrayBuffer per face, passed to `ImageResponse`.
 *
 * The alternative is fetching from `fonts.gstatic.com` at render time, which
 * puts an uncacheable third-party round trip in front of every card and makes
 * image generation fail whenever Google is slow. So the faces are committed
 * here, subsetted, at 127KB for all three.
 *
 * ── The subset ──────────────────────────────────────────────────────────────
 * Latin-1 plus general punctuation, currency (the card carries no price, but £
 * appears in competition copy), the arrows and the replacement character. The
 * full Inter TTF is 325KB per weight because it carries Cyrillic, Greek and
 * Vietnamese; subsetting takes each weight to 50KB. Regenerate with:
 *
 *   python3 -m fontTools.subset <src>.ttf \
 *     --unicodes="U+0000-00FF,U+2010-2027,U+20A0-20BF,U+2122,U+2190-2193,U+2212,U+FEFF,U+FFFD" \
 *     --layout-features="kern,liga,calt,tnum" --no-hinting --output-file=<dest>.ttf
 *
 * A glyph outside the subset renders as a blank box rather than failing, so a
 * card is the wrong place to discover the subset was too tight — anything the
 * copy can contain belongs in that range.
 *
 * ── Weights ─────────────────────────────────────────────────────────────────
 * Three faces, not six. Satori does not synthesise weights, so every weight the
 * card uses has to be a real file, and each one is 26–50KB of function bundle.
 * Display 700 / body 400 / strong 600 covers the card's hierarchy; anything
 * beyond that should be earned by a design that needs it.
 *
 * `--weight-display` is 900 in the token set. Space Grotesk has no weight above
 * 700, and in the browser that difference is invisible because the token is
 * clamped to the face's range. The card states 700 explicitly instead of asking
 * for a weight that does not exist. See `TOKEN_EXCEPTIONS` in palette.ts.
 *
 * Node runtime only — this reads from disk. `next/og` on the edge runtime would
 * need these inlined, and 127KB of base64 is 170KB of source, which is the wrong
 * trade for a route that is not latency-critical.
 */

const FONT_DIR = join(process.cwd(), 'src/lib/share-card/fonts')

/** The shape `ImageResponse` wants for each face. */
export interface LoadedFont {
  name: string
  data: ArrayBuffer
  weight: 400 | 600 | 700
  style: 'normal'
}

const FACES: Array<{ file: string; name: string; weight: LoadedFont['weight'] }> = [
  { file: 'SpaceGrotesk-Bold.ttf', name: 'Space Grotesk', weight: 700 },
  { file: 'Inter-Regular.ttf', name: 'Inter', weight: 400 },
  { file: 'Inter-SemiBold.ttf', name: 'Inter', weight: 600 },
]

/**
 * Read every face once per process.
 *
 * Cached as the promise rather than the result so concurrent first requests
 * share one set of reads instead of racing to do the same three.
 */
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

/** The font-family names, for the card's CSS. */
export const FONT_DISPLAY = 'Space Grotesk'
export const FONT_BODY = 'Inter'
