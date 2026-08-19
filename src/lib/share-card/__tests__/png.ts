import { deflateSync, inflateSync } from 'zlib'

/**
 * Just enough PNG to look at the card's pixels.
 *
 * The brief's acceptance list has two items no assertion about the React tree
 * can reach — "no text outside y ∈ [250, 1620]" and "grain and the scrim are
 * visibly present in the exported PNG, not just in the browser". Both are about
 * the raster, and both are exactly the kind of thing that regressed silently
 * before: the previous card's footer was under Instagram's reply bar for its
 * whole life on master, and nothing in the code said so.
 *
 * So the tests decode the output. This handles what `next/og` emits and nothing
 * else — 8-bit truecolour, with or without alpha, non-interlaced — and throws
 * rather than guessing if it is handed anything different. `sharp` is in
 * `node_modules` and would do the same job, but it arrives transitively through
 * Next and a test that fails when a transitive dependency moves is a test that
 * gets deleted.
 */

export interface Decoded {
  width: number
  height: number
  /** RGBA, four bytes per pixel, row-major. */
  data: Uint8Array
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

export function decodePng(png: Buffer): Decoded {
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (png[i] !== SIGNATURE[i]) throw new Error('not a PNG')
  }

  let width = 0
  let height = 0
  let channels = 0
  const idat: Buffer[] = []

  let at = 8
  while (at < png.length) {
    const length = png.readUInt32BE(at)
    const type = png.toString('ascii', at + 4, at + 8)
    const body = png.subarray(at + 8, at + 8 + length)

    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const depth = body[8]
      const colourType = body[9]
      if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`)
      if (body[12] !== 0) throw new Error('interlaced PNGs are not supported')
      if (colourType === 2) channels = 3
      else if (colourType === 6) channels = 4
      else throw new Error(`unsupported colour type ${colourType}`)
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(body))
    } else if (type === 'IEND') {
      break
    }

    at += 12 + length
  }

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = new Uint8Array(width * height * 4)
  const line = new Uint8Array(stride)
  const prev = new Uint8Array(stride)

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const start = y * (stride + 1) + 1

    for (let x = 0; x < stride; x += 1) {
      const value = raw[start + x]
      const left = x >= channels ? line[x - channels] : 0
      const up = prev[x]
      const upLeft = x >= channels ? prev[x - channels] : 0

      let restored: number
      switch (filter) {
        case 0: restored = value; break
        case 1: restored = value + left; break
        case 2: restored = value + up; break
        case 3: restored = value + ((left + up) >> 1); break
        case 4: restored = value + paeth(left, up, upLeft); break
        default: throw new Error(`unknown filter ${filter} on row ${y}`)
      }
      line[x] = restored & 0xff
    }

    for (let x = 0; x < width; x += 1) {
      const from = x * channels
      const to = (y * width + x) * 4
      out[to] = line[from]
      out[to + 1] = line[from + 1]
      out[to + 2] = line[from + 2]
      out[to + 3] = channels === 4 ? line[from + 3] : 255
    }

    prev.set(line)
  }

  return { width, height, data: out }
}

/** Perceptual-ish luminance, 0–255. */
export function luminance(data: Uint8Array, index: number): number {
  return 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
}

/** How many pixels in a horizontal band are at least this bright. */
export function brightPixels(
  image: Decoded,
  fromY: number,
  toY: number,
  threshold: number,
): number {
  let count = 0
  for (let y = Math.max(0, fromY); y < Math.min(image.height, toY); y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (luminance(image.data, (y * image.width + x) * 4) >= threshold) count += 1
    }
  }
  return count
}

/** Standard deviation of luminance over a patch — how textured it is. */
export function patchDeviation(
  image: Decoded,
  x0: number,
  y0: number,
  size: number,
): number {
  const values: number[] = []
  for (let y = y0; y < y0 + size; y += 1) {
    for (let x = x0; x < x0 + size; x += 1) {
      values.push(luminance(image.data, (y * image.width + x) * 4))
    }
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/** Mean luminance over a patch. */
export function patchMean(image: Decoded, x0: number, y0: number, w: number, h: number): number {
  let total = 0
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      total += luminance(image.data, (y * image.width + x) * 4)
    }
  }
  return total / (w * h)
}

/**
 * The worst ground any type on the card is sitting on.
 *
 * Walks the rows between two y bounds, keeps the ones that have type in them —
 * a row whose brightest pixel reaches `typeAt`, which near-white ink does and a
 * scrimmed photograph does not — and returns the highest row median among them.
 * The median is the ground rather than the type: type covers a minority of any
 * row it is on, so the middle of the row is what is behind it.
 *
 * It finds the type rather than being told where they are, which is the whole
 * point: the block is bottom-anchored and its height is its contents, so a test
 * that named y positions would be a test that passed a card whose type had
 * moved.
 *
 * Meaningful only over a *flat* stand-in photograph. Over a frame with its own
 * highlights the picture trips `typeAt` on its own and the answer is the
 * picture's brightness, not the card's.
 */
export function worstTypeGround(
  image: Decoded,
  fromY: number,
  toY: number,
  typeAt = 224,
): { y: number; ground: number } {
  let worst = { y: -1, ground: -1 }
  for (let y = Math.max(0, fromY); y < Math.min(image.height, toY); y += 1) {
    const values: number[] = []
    let max = 0
    for (let x = 0; x < image.width; x += 1) {
      const v = luminance(image.data, (y * image.width + x) * 4)
      values.push(v)
      if (v > max) max = v
    }
    if (max < typeAt) continue
    values.sort((a, b) => a - b)
    const ground = values[Math.floor(values.length / 2)]
    if (ground > worst.ground) worst = { y, ground }
  }
  return worst
}

/**
 * A solid-colour PNG, as a data URI.
 *
 * Stands in for an uploaded photograph. Written by hand rather than fetched or
 * committed as a fixture because the point is to be able to say what is in it:
 * a known colour, so a test can assert the card actually drew the upload rather
 * than the gradient field it falls back to.
 */
export function solidPngDataUri(width: number, height: number, rgb: [number, number, number]): string {
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1)
    raw[row] = 0 // filter: none
    for (let x = 0; x < width; x += 1) {
      raw[row + 1 + x * 3] = rgb[0]
      raw[row + 2 + x * 3] = rgb[1]
      raw[row + 3 + x * 3] = rgb[2]
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  const png = Buffer.concat([
    Buffer.from(SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length, 0)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed), 0)
  return Buffer.concat([length, typed, crc])
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
