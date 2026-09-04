import { keyBackground, shouldKey, featherMask, MAX_REMOVED } from '../key-white'

/**
 * Every test here is a real product photograph in miniature. The one that
 * matters most is "a white label inside the product", because that is the case
 * a naive brightness threshold gets wrong and it is most of the catalogue:
 * Scitec's tub has a white panel, NOW Foods' bottle is white all over.
 */

/** Build an RGB frame from a picture drawn in characters. `.` = white ground. */
function frame(rows: string[], palette: Record<string, [number, number, number]>) {
  const height = rows.length
  const width = rows[0].length
  const data = new Uint8Array(width * height * 3)
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = palette[row[x]] ?? [255, 255, 255]
      const p = (y * width + x) * 3
      data[p] = r; data[p + 1] = g; data[p + 2] = b
    }
  })
  return { data, width, height }
}

const P = {
  '.': [255, 255, 255] as [number, number, number],  // the shot's white ground
  '#': [30, 30, 30] as [number, number, number],     // a dark tub
  'W': [255, 255, 255] as [number, number, number],  // a WHITE label on the tub
  'o': [246, 246, 248] as [number, number, number],  // a slightly-off white ground
}

const key = (rows: string[]) => {
  const f = frame(rows, P)
  return { ...keyBackground(f.data, f.width, f.height, 3), width: f.width, height: f.height }
}

describe('keyBackground', () => {
  it('removes the ground and keeps the product', () => {
    const r = key([
      '........',
      '..####..',
      '..####..',
      '..####..',
      '..####..',
      '........',
    ])
    expect(r.alpha[0]).toBe(0)                 // corner: ground
    expect(r.alpha[2 * 8 + 3]).toBe(255)       // middle of the tub: kept
    expect(r.removed).toBeGreaterThan(0.4)
    expect(r.touchesCentre).toBe(false)
  })

  /** The whole reason this is a flood fill and not a threshold. */
  it('keeps a WHITE label inside the product, because it is not connected to the edge', () => {
    const r = key([
      '........',
      '..####..',
      '..#WW#..',
      '..#WW#..',
      '..####..',
      '........',
    ])
    expect(r.alpha[2 * 8 + 3]).toBe(255)       // the white label survives
    expect(r.alpha[3 * 8 + 4]).toBe(255)
    expect(r.alpha[0]).toBe(0)                 // the ground still goes
  })

  it('tolerates a ground that is not quite white', () => {
    const r = key([
      'oooooooo',
      'oo####oo',
      'oo####oo',
      'oooooooo',
    ])
    expect(r.alpha[0]).toBe(0)
    expect(r.removed).toBeGreaterThan(0.4)
  })

  it('treats existing transparency as ground', () => {
    const width = 4, height = 4
    const data = new Uint8Array(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      const p = i * 4
      data[p] = 20; data[p + 1] = 20; data[p + 2] = 20
      // A transparent border round an opaque centre.
      const x = i % width, y = (i - (i % width)) / width
      data[p + 3] = x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 0 : 255
    }
    const r = keyBackground(data, width, height, 4)
    expect(r.alpha[0]).toBe(0)
    expect(r.alpha[1 * width + 1]).toBe(255)
  })

  it('reports reaching the centre, which is how an escaped fill is caught', () => {
    // A white tub on white: nothing separates product from ground.
    const r = key([
      '........',
      '........',
      '........',
      '........',
    ])
    expect(r.touchesCentre).toBe(true)
  })
})

describe('shouldKey', () => {
  const at = (removed: number, touchesCentre = false) =>
    shouldKey({ alpha: new Uint8Array(0), removed, touchesCentre })

  it('accepts an ordinary cut-out', () => {
    // A tall bottle centred in a square frame really is this much background.
    // An earlier 0.55 ceiling rejected every real photo; see MAX_REMOVED.
    expect(at(0.45)).toBe(true)
    expect(at(0.63)).toBe(true)
    expect(at(0.8)).toBe(true)
  })

  it('refuses when the fill reached the middle of the frame', () => {
    // A damaged photograph is worse than a white plate, always.
    expect(at(0.2, true)).toBe(false)
  })

  it('refuses when there is essentially nothing left — a blank frame', () => {
    expect(at(MAX_REMOVED + 0.01)).toBe(false)
  })

  it('refuses when there was no white ground to remove', () => {
    // A lifestyle shot, or a photo already on a dark ground.
    expect(at(0.001)).toBe(false)
  })
})

describe('featherMask', () => {
  it('puts a ramp on the cut edge instead of a step', () => {
    const w = 5, h = 1
    const alpha = new Uint8Array([0, 0, 255, 255, 255])
    const out = featherMask(alpha, w, h)
    // The boundary pixel is now partial rather than fully on or off.
    expect(out[1]).toBeGreaterThan(0)
    expect(out[1]).toBeLessThan(255)
  })

  it('leaves the interior alone', () => {
    const alpha = new Uint8Array([255, 255, 255, 255, 255])
    expect(Array.from(featherMask(alpha, 5, 1))).toEqual([255, 255, 255, 255, 255])
  })
})
