/**
 * Build the tab icons from the brand mark.
 *
 *   npm run build:favicon
 *
 * Writes `src/app/favicon.ico` (16/32/48), `src/app/icon.svg` and
 * `src/app/apple-icon.png` — the three files Next's app-router icon convention
 * picks up on its own, with no link tags to maintain.
 *
 * ── Why this is a script and not three checked-in images ────────────────────
 * The geometry below is the same set of paths as `CHRGDMark` in
 * `src/components/brand/CHRGDLogo.tsx`. Exported images would drift from it the
 * first time the mark is touched, and nobody would notice for a year — a tab
 * icon is the one piece of brand art you never look at directly. Re-run this
 * after any change to the mark.
 *
 * Colours are fixed rather than theme tokens: a favicon has no page to inherit
 * from. White ground, near-black cell, cyan bolt.
 */
import sharp from 'sharp'
import { writeFileSync } from 'fs'

const TONE = '#0A0B0D'
const ACCENT = '#29C5F6'
const GROUND = '#FFFFFF'

/* The mark is 100x115; it is fitted into a square canvas per size below. */
const S = 1024

/*
  Two drawings of one mark.

  The full one is the logo as authored. At 16px it stops working: the cell
  stroke lands on half a pixel and goes grey, and the two charge bars sit close
  enough to the bolt that all three merge into a smudge. So the small size
  drops the bars, thickens the stroke and loses the bolt's keyline — the cell
  and the bolt alone, which is what actually survives at that size and is still
  unmistakably the mark.
*/
function markSvg({ detailed }) {
  const margin = detailed ? 0.80 : 0.92
  const k = (S * margin) / 115
  const w = 100 * k
  const h = 115 * k
  const x = (S - w) / 2
  const y = (S - h) / 2
  const bars = detailed
    ? `<rect x="19" y="29" width="62" height="12" rx="4" fill="${TONE}"/>
       <rect x="19" y="49" width="62" height="12" rx="4" fill="${TONE}"/>`
    : ''
  const bolt = detailed
    ? `<path d="M58 22L32 62H51L40 97L76 52H57L58 22Z" fill="${ACCENT}" stroke="${GROUND}" stroke-width="4" stroke-linejoin="round"/>`
    : `<path d="M58 22L32 62H51L40 97L76 52H57L58 22Z" fill="${ACCENT}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" fill="${GROUND}"/>
  <g transform="translate(${x} ${y}) scale(${k})">
    <rect x="37" y="0" width="26" height="12" rx="6" fill="${TONE}"/>
    <rect x="7" y="11" width="86" height="101" rx="30" fill="none" stroke="${TONE}" stroke-width="${detailed ? 8 : 11}"/>
    ${bars}
    ${bolt}
  </g>
</svg>`
}

const svg = markSvg({ detailed: true })
writeFileSync('src/app/icon.svg', svg)

/* Below 24px nothing survives but the cell and the bolt. */
const png = (size) =>
  sharp(Buffer.from(markSvg({ detailed: size >= 24 })))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer()

/* A .ico is a tiny container: a header, one 16-byte directory entry per size,
   then the payloads. PNG payloads are legal in ICO and every browser we care
   about reads them, which avoids hand-rolling a BMP with an AND mask. */
function ico(images) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0)            // reserved
  head.writeUInt16LE(1, 2)            // type: icon
  head.writeUInt16LE(images.length, 4)

  const entries = []
  let offset = 6 + images.length * 16
  for (const { size, data } of images) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2)                // palette
    e.writeUInt8(0, 3)                // reserved
    e.writeUInt16LE(1, 4)             // colour planes
    e.writeUInt16LE(32, 6)            // bits per pixel
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(e)
  }
  return Buffer.concat([head, ...entries, ...images.map((i) => i.data)])
}

const sizes = [16, 32, 48]
const images = []
for (const size of sizes) images.push({ size, data: await png(size) })
writeFileSync('src/app/favicon.ico', ico(images))

writeFileSync('src/app/apple-icon.png', await png(180))
console.log('favicon.ico', sizes.join('/'), '| apple-icon.png 180 | icon.svg')
