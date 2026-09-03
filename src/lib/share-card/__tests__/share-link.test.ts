import { cardImageUrl, cardShareUrl, cardFileName, cardShareText } from '../share-link'
import { decodeSharePayload } from '../codec'
import { sharePersonas } from '../personas'

/**
 * The URLs the share sheet hands out.
 *
 * These leave the product — into a clipboard, an OS share sheet, a camera roll —
 * so the failures are the ones you only see on someone else's phone: a relative
 * URL pasted into WhatsApp, a file called `download.png`, a payload that a
 * server round-trip mangled.
 */

const [complete, essentials] = sharePersonas()

describe('cardImageUrl', () => {
  it('round-trips the payload through the query string', () => {
    const url = cardImageUrl(complete.payload, 'story')
    const encoded = new URL(url, 'https://getchrgd.co.uk').searchParams.get('d')!
    expect(decodeSharePayload(encoded)).toEqual(complete.payload)
  })

  it('names the format the route expects', () => {
    expect(cardImageUrl(complete.payload, 'square')).toContain('format=square')
  })

  it('is URL-safe without escaping', () => {
    // base64url, so `+` and `/` never appear — a payload that survives one hop
    // and not the next is the bug you find on one platform only.
    const encoded = new URL(cardImageUrl(complete.payload, 'story'), 'https://x').searchParams.get('d')!
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('cardShareUrl', () => {
  it('is absolute', () => {
    // A relative URL pasted into a chat is not a link.
    expect(cardShareUrl(complete.payload)).toMatch(/^https?:\/\//)
  })

  it('carries the partner code so a click attributes', () => {
    // `middleware.ts` banks `?ref=` into the referral cookie, which is what makes
    // attribution independent of which screen someone buys from.
    expect(new URL(cardShareUrl(complete.payload)).searchParams.get('ref')).toBe('SARAH20')
    expect(new URL(cardShareUrl(essentials.payload)).searchParams.get('ref')).toBeNull()
  })

  it('carries the card itself', () => {
    const d = new URL(cardShareUrl(complete.payload)).searchParams.get('d')!
    expect(decodeSharePayload(d)).toEqual(complete.payload)
  })
})

describe('cardFileName', () => {
  it('says what it is, in the camera roll', () => {
    expect(cardFileName(complete.payload, 'story')).toBe('chrgd-iron-foundations-story.png')
  })

  it('survives a name with nothing sluggable in it', () => {
    expect(cardFileName({ ...complete.payload, stackName: '⚡⚡' }, 'square'))
      .toBe('chrgd-stack-square.png')
  })
})

describe('cardShareText', () => {
  it('is a caption, not a claim', () => {
    // The card is the most public surface we own; the text beside it is held to
    // the same line. See §6.1 — no verbs about what a supplement does.
    const text = cardShareText(complete.payload)
    expect(text).toBe('My CHRGD stack: Iron Foundations.')
    expect(text).not.toMatch(/boost|improve|increase|cure|treat|burn/i)
  })
})
