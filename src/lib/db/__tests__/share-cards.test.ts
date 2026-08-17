import {
  createShareCard,
  getShareCard,
  recordShareCardView,
  revokeShareCard,
  listShareCardsForPartner,
  sweepExpiredShareCards,
} from '../share-cards'
import { getEngine } from '../engine'
import { createUser } from '../users'
import { sharePersonas } from '@/lib/share-card/personas'

/**
 * Share card storage.
 *
 * The card is the one thing this app stores that is *published*: a public URL
 * somebody has pasted into a story, which may outlive their subscription. So the
 * assertions here are mostly about time and consent — what survives a year, what
 * a revoke actually does, and what a sweep is allowed to touch.
 */

const [complete, essentials] = sharePersonas()

describe('createShareCard', () => {
  it('round-trips the payload exactly', async () => {
    const card = await createShareCard({ payload: complete.payload })
    const found = await getShareCard(card.token)
    // Byte-for-byte: the whole point of a snapshot is that nobody rewrites it.
    expect(found?.payload).toEqual(complete.payload)
  })

  it('mints a readable token', async () => {
    const card = await createShareCard({ payload: complete.payload })
    expect(card.token).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/)
  })

  it('records who it belongs to and what it attributes to', async () => {
    const card = await createShareCard({
      payload: complete.payload,
      userId: null,
      partnerCode: 'SARAH20',
    })
    expect(await getShareCard(card.token)).toMatchObject({ partnerCode: 'SARAH20', userId: null })
  })
})

describe('getShareCard', () => {
  it('forgives the way someone types a code off their own screenshot', async () => {
    const card = await createShareCard({ payload: complete.payload })
    expect(await getShareCard(card.token.toLowerCase())).toMatchObject({ token: card.token })
    expect(await getShareCard(` ${card.token} `)).toMatchObject({ token: card.token })
  })

  it('is null for anything that is not a token', async () => {
    expect(await getShareCard('nope')).toBeNull()
    expect(await getShareCard('')).toBeNull()
  })

  it('does not return a revoked card', async () => {
    // Taking a link down has to actually take it down.
    const card = await createShareCard({ payload: complete.payload })
    await revokeShareCard(card.token)
    expect(await getShareCard(card.token)).toBeNull()
  })

  it('survives a row whose payload will not parse', async () => {
    // One corrupt card must not 500 the route that serves every other one.
    const card = await createShareCard({ payload: complete.payload })
    const db = await getEngine()
    await db.run('UPDATE share_cards SET payload = ? WHERE token = ?', ['{not json', card.token])
    expect(await getShareCard(card.token)).toBeNull()
  })
})

describe('recordShareCardView', () => {
  it('counts', async () => {
    const card = await createShareCard({ payload: complete.payload })
    await recordShareCardView(card.token)
    await recordShareCardView(card.token)
    expect((await getShareCard(card.token))?.viewCount).toBe(2)
  })

  it('does not resurrect a revoked card', async () => {
    const card = await createShareCard({ payload: complete.payload })
    await revokeShareCard(card.token)
    await recordShareCardView(card.token)
    expect(await getShareCard(card.token)).toBeNull()
  })
})

describe('revokeShareCard', () => {
  it('is idempotent and keeps the history', async () => {
    const card = await createShareCard({ payload: complete.payload })
    await recordShareCardView(card.token)
    await revokeShareCard(card.token)
    await revokeShareCard(card.token)

    const db = await getEngine()
    const row = await db.get<{ view_count: number; revoked_at: string }>(
      'SELECT view_count, revoked_at FROM share_cards WHERE token = ?', [card.token],
    )
    expect(Number(row?.view_count)).toBe(1)
    expect(row?.revoked_at).toBeTruthy()
  })
})

describe('listShareCardsForPartner', () => {
  it('finds a partner’s cards however the code was cased', async () => {
    await createShareCard({ payload: complete.payload, partnerCode: 'JAMIE10' })
    await createShareCard({ payload: essentials.payload, partnerCode: 'JAMIE10' })
    await createShareCard({ payload: essentials.payload, partnerCode: 'SOMEONE5' })

    expect(await listShareCardsForPartner('jamie10')).toHaveLength(2)
  })
})

describe('sweepExpiredShareCards', () => {
  const YEAR = 365 * 24 * 60 * 60 * 1000

  it('removes anonymous cards past their window', async () => {
    const old = await createShareCard({ payload: complete.payload })
    const db = await getEngine()
    await db.run('UPDATE share_cards SET created_at = ? WHERE token = ?', [
      new Date(Date.now() - YEAR - 1000).toISOString(), old.token,
    ])

    expect(await sweepExpiredShareCards()).toBeGreaterThanOrEqual(1)
    expect(await getShareCard(old.token)).toBeNull()
  })

  it('never touches a card somebody owns', async () => {
    // A card attached to an account is that person's. Deleting it because a
    // year passed is deleting something of theirs on a schedule they did not
    // agree to.
    const owner = await createUser({ email: 'owner@example.com' })
    const card = await createShareCard({ payload: complete.payload, userId: owner.id })

    const db = await getEngine()
    await db.run('UPDATE share_cards SET created_at = ? WHERE token = ?', [
      new Date(Date.now() - YEAR - 1000).toISOString(), card.token,
    ])

    await sweepExpiredShareCards()
    expect(await getShareCard(card.token)).toMatchObject({ userId: owner.id })
  })

  it('leaves fresh cards alone', async () => {
    const fresh = await createShareCard({ payload: complete.payload })
    await sweepExpiredShareCards()
    expect(await getShareCard(fresh.token)).not.toBeNull()
  })
})
