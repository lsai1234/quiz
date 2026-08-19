import {
  validateSource, leftThirdWarning, describeRatio,
  ART_MAX_BYTES, SOURCE_MIN, DERIVATIVE, LEFT_THIRD_MAX_LUMA,
} from '../art-upload'

/**
 * The rules a category photograph has to pass.
 *
 * These run in two places — the settings screen before it uploads, and the API
 * route on what arrives — so they are worth pinning here rather than in either
 * caller. The messages are tested as closely as the verdicts: the brief asks for
 * a rejection that says what was received, and "invalid image" is the version of
 * that which sends somebody back to Photoshop guessing.
 */

const OK = { width: 1200, height: 1600, type: 'image/jpeg', size: 900_000 }

describe('validateSource', () => {
  it('accepts a 3:4 portrait at the minimum size', () => {
    expect(validateSource(OK)).toBeNull()
  })

  it('accepts the ±2% tolerance either side, and nothing past it', () => {
    // 3:4 is 0.75. A 2% drift is 0.735–0.765. Measured above the minimum so
    // this is testing the ratio rule and not tripping the size one.
    expect(validateSource({ ...OK, width: 1520, height: 2000 })).toBeNull() // 0.760
    expect(validateSource({ ...OK, width: 1475, height: 2000 })).toBeNull() // 0.7375
    expect(validateSource({ ...OK, width: 1600, height: 2000 })).not.toBeNull() // 0.800
  })

  it('rejects a square on its shape, not its size', () => {
    // The brief's own acceptance case, and the reason shape is checked first: a
    // 1000 × 1000 fails both rules, and being told about the size sends somebody
    // off to make a 1600 × 1600 that gets rejected all over again.
    const message = validateSource({ ...OK, width: 1000, height: 1000 })
    expect(message).toContain('1000 × 1000')
    expect(message).toContain('1:1')
    expect(message).toContain('3:4')
  })

  it('reports the too-small case as size, not as ratio', () => {
    // 900 × 1200 is exactly 3:4 — the only thing wrong with it is that it is
    // small, and being told about the ratio instead would be a wild goose chase.
    const message = validateSource({ ...OK, width: 900, height: 1200 })
    expect(message).toContain('900 × 1200')
    expect(message).toContain(`${SOURCE_MIN.width} × ${SOURCE_MIN.height}`)
    expect(message).not.toContain('3:4')
  })

  it('rejects types the renderer cannot open', () => {
    expect(validateSource({ ...OK, type: 'image/heic' })).toContain('image/heic')
    expect(validateSource({ ...OK, type: 'application/pdf' })).toContain('JPG, PNG or WebP')
  })

  it('names the size it was given when the file is too big', () => {
    const message = validateSource({ ...OK, size: ART_MAX_BYTES + 1 })
    expect(message).toContain('8.0MB')
  })

  it('checks the type before anything else', () => {
    // A PDF that happens to be 1000 × 1000 has two problems, and the one worth
    // saying is that it is a PDF.
    expect(validateSource({ width: 10, height: 10, type: 'application/pdf', size: 5 }))
      .toContain('JPG, PNG or WebP')
  })
})

describe('leftThirdWarning', () => {
  it('says nothing about a dark left edge', () => {
    expect(leftThirdWarning(12)).toBeNull()
    expect(leftThirdWarning(LEFT_THIRD_MAX_LUMA)).toBeNull()
  })

  it('warns, with the number, once the score would start to disappear', () => {
    const message = leftThirdWarning(180)
    expect(message).toContain('180')
    expect(message).toContain('charge index')
  })
})

describe('describeRatio', () => {
  it('names the common ones', () => {
    expect(describeRatio(1)).toBe('1:1')
    expect(describeRatio(0.75)).toBe('3:4')
    expect(describeRatio(16 / 9)).toBe('16:9')
  })

  it('falls back to a number rather than the nearest lie', () => {
    expect(describeRatio(3.2)).toBe('3.20:1')
  })
})

describe('the derivative', () => {
  it('is the size the card draws at, and 3:4', () => {
    expect(DERIVATIVE).toEqual({ width: 1080, height: 1440 })
    expect(DERIVATIVE.width / DERIVATIVE.height).toBeCloseTo(0.75, 5)
  })
})

describe('the size floor is the derivative, not a round number above it', () => {
  /**
   * The rule is "storing this must not mean upscaling it". The derivative is
   * 1080 × 1440, so anything at or above that downsamples. The floor used to be
   * 1200 × 1600 — a stricter rule than the one written beside it, which refused
   * photographs that were genuinely big enough.
   */
  it('accepts a source a hair larger than what gets stored', () => {
    // 1086 × 1448 is exactly 3:4 and bigger than the derivative in both axes.
    expect(validateSource({ ...OK, width: 1086, height: 1448 })).toBeNull()
  })

  it('accepts the derivative size exactly', () => {
    expect(validateSource({ ...OK, width: DERIVATIVE.width, height: DERIVATIVE.height })).toBeNull()
  })

  it('still refuses anything that would have to be upscaled', () => {
    expect(validateSource({ ...OK, width: 1079, height: 1439 })).not.toBeNull()
    expect(validateSource({ ...OK, width: 900, height: 1200 })).not.toBeNull()
  })

  it('keeps the floor tied to the derivative, so the two cannot drift', () => {
    expect(SOURCE_MIN).toEqual({ width: DERIVATIVE.width, height: DERIVATIVE.height })
  })
})
