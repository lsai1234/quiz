import { shareAssetsFor } from '../share-assets'
import { createShareCard, recordShareCardView } from '@/lib/db/share-cards'
import { decodeSharePayload } from '@/lib/share-card/codec'
import { sharePersonas } from '@/lib/share-card/personas'
import type { PartnerCode } from '../types'

/**
 * A partner's share assets.
 *
 * The point of this is that a partner never has to email us for a graphic — so
 * what is asserted is that the asset is *postable*: it carries their code, it
 * decodes into something the image route will render, and it does not carry
 * anybody's personal details.
 */

const code = (over: Partial<PartnerCode> = {}): PartnerCode => ({
  code: 'JAMIE10',
  partnerId: 'p1',
  discountPct: 10,
  terms: { minSpend: null, firstOrderOnly: false, expiresAt: null },
  status: 'active',
  createdAt: new Date().toISOString(),
  ...over,
} as PartnerCode)

describe('shareAssetsFor', () => {
  it('builds a card carrying the partner’s code', async () => {
    const [asset] = await shareAssetsFor([code()])
    const payload = decodeSharePayload(asset.encoded)

    expect(asset.code).toBe('JAMIE10')
    expect(payload?.code).toBe('JAMIE10')
    // Renderable: the image route validates the same way this does.
    expect(payload?.lineup.length).toBeGreaterThan(0)
  })

  it('is a real engine-built stack, not an invented fixture', async () => {
    // A sample that shows a stack the engine would never produce is a sample
    // that teaches a partner the wrong thing about the product.
    const [asset] = await shareAssetsFor([code()])
    const payload = decodeSharePayload(asset.encoded)!
    const real = sharePersonas()[0].payload

    expect(payload.stackName).toBe(real.stackName)
    expect(payload.lineup).toEqual(real.lineup)
  })

  it('carries nobody’s name', async () => {
    // The persona it is built from has an opted-in first name available. A
    // marketing asset going out to a partner must not.
    const [asset] = await shareAssetsFor([code()])
    const payload = decodeSharePayload(asset.encoded)!

    expect(payload.firstName).toBeUndefined()
    expect(JSON.stringify(payload)).not.toMatch(/\bSam\b|Whitlock|Alexandria/)
  })

  it('gives a link that attributes', async () => {
    const [asset] = await shareAssetsFor([code()], 'https://getchrgd.co.uk')
    expect(new URL(asset.link).searchParams.get('ref')).toBe('JAMIE10')
  })

  it('counts the cards their followers actually made', async () => {
    const payload = sharePersonas()[1].payload
    const a = await createShareCard({ payload, partnerCode: 'COUNTME1' })
    await createShareCard({ payload, partnerCode: 'COUNTME1' })
    await createShareCard({ payload, partnerCode: 'SOMEONEELSE' })
    await recordShareCardView(a.token)
    await recordShareCardView(a.token)

    const [asset] = await shareAssetsFor([code({ code: 'COUNTME1' })])
    expect(asset.cardsCreated).toBe(2)
    expect(asset.cardViews).toBe(2)
  })

  it('reports zeroes rather than failing for a brand-new code', async () => {
    const [asset] = await shareAssetsFor([code({ code: 'BRANDNEW1' })])
    expect(asset).toMatchObject({ cardsCreated: 0, cardViews: 0 })
    expect(asset.encoded.length).toBeGreaterThan(0)
  })

  it('handles a partner with several codes', async () => {
    const assets = await shareAssetsFor([code({ code: 'ONE1' }), code({ code: 'TWO2' })])
    expect(assets.map((a) => a.code)).toEqual(['ONE1', 'TWO2'])
    expect(decodeSharePayload(assets[1].encoded)?.code).toBe('TWO2')
  })
})
