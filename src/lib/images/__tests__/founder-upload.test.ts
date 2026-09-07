import {
  validateUpload,
  derivativeSize,
  UPLOAD_MAX_BYTES,
  DERIVATIVE_MAX_EDGE,
  SOURCE_MIN_EDGE,
} from '../founder-upload'

const ok = { width: 1600, height: 1200, type: 'image/jpeg', size: 900_000 }

describe('validateUpload', () => {
  it('accepts a real photograph', () => {
    expect(validateUpload(ok)).toBeNull()
    expect(validateUpload({ ...ok, type: 'image/png' })).toBeNull()
    expect(validateUpload({ ...ok, type: 'image/webp' })).toBeNull()
  })

  it('names the type it was handed rather than saying "invalid"', () => {
    expect(validateUpload({ ...ok, type: 'application/pdf' })).toContain('application/pdf')
    expect(validateUpload({ ...ok, type: '' })).toContain('unrecognised')
  })

  it('names the size, in the units the founder sees on their file', () => {
    const message = validateUpload({ ...ok, size: UPLOAD_MAX_BYTES + 1 })
    expect(message).toContain('8.0MB')
  })

  it('refuses a picture too small to draw the hero from', () => {
    const message = validateUpload({ ...ok, width: 640, height: 480 })
    expect(message).toContain('640 × 480')
    expect(message).toContain(String(SOURCE_MIN_EDGE))
  })

  /*
    Deliberately NOT a ratio rule. A bundle photo is drawn into a 128px card
    block and a 16:9 hero, both `object-fit: cover`, so any large landscape,
    portrait or square works — refusing one over a ratio nothing depends on
    would be a rule for its own sake. The share card, which composes type over a
    fixed 3:4 canvas, is the one that gets to be strict.
  */
  it('takes any shape', () => {
    expect(validateUpload({ ...ok, width: 1200, height: 1200 })).toBeNull()
    expect(validateUpload({ ...ok, width: 900, height: 1600 })).toBeNull()
  })
})

describe('derivativeSize', () => {
  it('leaves a picture that is already small enough alone', () => {
    expect(derivativeSize(1200, 900)).toEqual({ width: 1200, height: 900 })
  })

  it('caps the long edge and keeps the shape', () => {
    expect(derivativeSize(4000, 3000)).toEqual({ width: DERIVATIVE_MAX_EDGE, height: 1200 })
    expect(derivativeSize(3000, 4000)).toEqual({ width: 1200, height: DERIVATIVE_MAX_EDGE })
  })
})
