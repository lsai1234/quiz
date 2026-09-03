import { encodeSharePayload, decodeSharePayload } from '../codec'
import { sharePersonas } from '../personas'
import { SHARE_PAYLOAD_VERSION } from '../types'

/**
 * The codec is a trust boundary in one direction only.
 *
 * It exists so the card works with no database — the payload rides in the URL —
 * which also means anyone can craft one and hand it to the renderer. That is
 * acceptable for a vanity graphic, and it is only acceptable while two things
 * hold: a malformed payload is rejected before the renderer sees it, and nothing
 * downstream ever treats a decoded payload as evidence. A competition entry is
 * verified against a stored row, never against a link somebody sent us.
 */

const [persona] = sharePersonas()

describe('round trip', () => {
  it('survives every persona unchanged', () => {
    for (const p of sharePersonas()) {
      expect(decodeSharePayload(encodeSharePayload(p.payload))).toEqual(p.payload)
    }
  })

  it('is URL-safe', () => {
    // base64url, so it can sit in a query string without escaping — a `+` or `/`
    // that survives one hop and not the next is the kind of bug that only shows
    // up on the platform you did not test.
    expect(encodeSharePayload(persona.payload)).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('rejects', () => {
  const reject = (input: string) => expect(decodeSharePayload(input)).toBeNull()

  it('nothing at all', () => {
    reject('')
  })

  it('anything that is not base64url JSON', () => {
    reject('not-base64!!')
    reject(Buffer.from('{"nope"', 'utf8').toString('base64url'))
    reject(Buffer.from('"a string"', 'utf8').toString('base64url'))
    reject(Buffer.from('null', 'utf8').toString('base64url'))
  })

  it('a payload from a version this renderer does not know', () => {
    // A future card format drawn by an older deploy is a wrong image, not an
    // error — and a wrong image is the failure with no symptom.
    const future = { ...persona.payload, v: SHARE_PAYLOAD_VERSION + 1 }
    reject(Buffer.from(JSON.stringify(future), 'utf8').toString('base64url'))
  })

  it('a payload missing the parts the card is made of', () => {
    for (const key of ['stackName', 'lineup', 'coverage', 'focusAreas', 'level']) {
      const broken: Record<string, unknown> = { ...persona.payload }
      delete broken[key]
      reject(Buffer.from(JSON.stringify(broken), 'utf8').toString('base64url'))
    }
  })

  it('a payload whose arrays hold the wrong shape', () => {
    const cases = [
      { ...persona.payload, lineup: [{ slot: 'Protein' }] },
      { ...persona.payload, coverage: [{ label: 'Muscle', score: '100', targeted: true }] },
      { ...persona.payload, coverage: [{ label: 'Muscle', score: 100 }] },
      { ...persona.payload, focusAreas: ['Performance Output'] },
      { ...persona.payload, fitScore: 'high' },
      { ...persona.payload, stackName: '   ' },
    ]
    for (const c of cases) reject(Buffer.from(JSON.stringify(c), 'utf8').toString('base64url'))
  })

  it('something far too big to be a card', () => {
    // The image route is not free object storage, and a very long query string
    // is a cheap way to make a server do a lot of work.
    reject('A'.repeat(9_000))
  })
})
