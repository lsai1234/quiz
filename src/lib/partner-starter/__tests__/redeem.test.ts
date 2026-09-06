/**
 * Issuing, signing for, claiming and spending a starter — against the real
 * (in-memory) database, so the two locks are exercised rather than assumed.
 *
 * There are two, and both stand between one starter and any number of free
 * boxes: the claim token (single use) and the agreement (nothing at all until
 * somebody has promised something for it). Neither can be tested without going
 * through the engine.
 */
import { createPartner, updatePartner } from '@/lib/partners/repo'
import {
  claimStarter,
  createStarter,
  getStarter,
  listStartersForPartner,
  markStarterUsed,
  releaseStarter,
  revokeStarter,
  signStarter,
} from '../repo'
import { claimStarterForCheckout, starterForSession } from '../redeem'
import { agreementFor, hashAgreement, signAgreement, signatureProblem } from '../sign'
import { PARTNER_AGREEMENT_VERSION, PARTNER_DELIVERABLES, partnerAgreementText } from '../agreement'
import { starterState } from '../rules'
import type { Partner } from '@/lib/partners/types'

const gbp = (n: number) => `£${n.toFixed(2)}`

async function partnerWithStarter(tier: 'essentials' | 'performance' = 'performance') {
  const partner = await createPartner({ email: `p${Math.random()}@example.com`, name: 'Alex Morgan' })
  const starter = await createStarter({ partnerId: partner.id, tier, note: 'launch cohort' })
  return { partner, starter }
}

async function sign(partner: Partner, code: string) {
  const starter = (await getStarter(code))!
  const { text, version } = await agreementFor(partner, starter)
  return signStarter({
    starter,
    version,
    docHash: hashAgreement(text),
    signedName: 'Alex Morgan',
    deliverables: PARTNER_DELIVERABLES,
  })
}

describe('issuing', () => {
  it('records the depth, the cap, the note and when it dies', async () => {
    const { starter } = await partnerWithStarter()
    expect(starter.tier).toBe('performance')
    expect(starter.goodsCap).toBe(100)
    expect(starter.note).toBe('launch cohort')
    expect(new Date(starter.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('is born unsigned — issuing gives nothing away on its own', async () => {
    const { starter } = await partnerWithStarter()
    expect(starter.agreementId).toBeNull()
    expect(starterState(starter)).toBe('unsigned')
  })

  it('reads back exactly what was written, however the code is cased', async () => {
    const { starter } = await partnerWithStarter()
    expect(await getStarter(starter.code.toLowerCase())).toEqual(starter)
  })
})

describe('the agreement gate', () => {
  it('cannot be claimed before it is signed for, even by a caller that skipped the checks', async () => {
    const { starter } = await partnerWithStarter()
    // Straight at the repository, past `checkStarter` entirely. The gate is in
    // the UPDATE itself, which is the point: it holds for callers that forget.
    expect(await claimStarter(starter.code)).toBeNull()
  })

  it('can be claimed once it has been', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    expect(await claimStarter(starter.code)).toEqual(expect.any(String))
  })

  it('stores what was signed, not what was submitted', async () => {
    const { partner, starter } = await partnerWithStarter()
    const agreement = await sign(partner, starter.code)
    const served = partnerAgreementText({
      partnerName: partner.name,
      partnerCode: '(to be issued)',
      tier: starter.tier,
      goodsCap: gbp(starter.goodsCap),
      expiresAt: starter.expiresAt,
    })
    expect(agreement.docHash).toBe(hashAgreement(served))
    expect(agreement.version).toBe(PARTNER_AGREEMENT_VERSION)
    expect(agreement.deliverables).toEqual(PARTNER_DELIVERABLES)
  })

  it('attaches the FIRST signature and not a second one', async () => {
    const { partner, starter } = await partnerWithStarter()
    const first = await sign(partner, starter.code)
    await sign(partner, starter.code)
    expect((await getStarter(starter.code))!.agreementId).toBe(first.id)
  })
})

describe('signing through the front door', () => {
  it('refuses a blank signature', async () => {
    expect(signatureProblem('  ')).toMatch(/full name/i)
    expect(signatureProblem('Jo')).toMatch(/full name/i)
    expect(signatureProblem('Jo Li')).toBeNull()
  })

  it('refuses a stale version rather than quietly signing the new one', async () => {
    const { partner, starter } = await partnerWithStarter()
    const out = await signAgreement({
      partner,
      starter,
      signedName: 'Alex Morgan',
      version: '1999-01-1',
    })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.staleVersion).toBe(true)
  })

  it('refuses to sign somebody else’s starter', async () => {
    const { starter } = await partnerWithStarter()
    const other = await createPartner({ email: 'other@example.com', name: 'Sam Reed' })
    const out = await signAgreement({
      partner: other,
      starter,
      signedName: 'Sam Reed',
      version: PARTNER_AGREEMENT_VERSION,
    })
    expect(out.ok).toBe(false)
  })

  it('refuses to sign for a cancelled starter — a promise with nothing behind it', async () => {
    const { partner, starter } = await partnerWithStarter()
    await revokeStarter(starter.code)
    const out = await signAgreement({
      partner,
      starter: (await getStarter(starter.code))!,
      signedName: 'Alex Morgan',
      version: PARTNER_AGREEMENT_VERSION,
    })
    expect(out.ok).toBe(false)
  })
})

describe('the single-use lock', () => {
  it('gives the starter to exactly one of two callers racing for it', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    const [a, b] = await Promise.all([claimStarter(starter.code), claimStarter(starter.code)])
    expect([a, b].filter(Boolean)).toHaveLength(1)
  })

  it('hands it back when the order it was claimed for never happened', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    const token = (await claimStarter(starter.code))!
    await releaseStarter(starter.code, token)
    expect(await claimStarter(starter.code)).toEqual(expect.any(String))
  })

  it('will not let one claim spend another’s starter', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    await claimStarter(starter.code)
    await markStarterUsed(starter.code, 'not-the-token', 'ord_1')
    expect((await getStarter(starter.code))!.usedAt).toBeNull()
  })

  it('is spent for good once an order carries it', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    const token = (await claimStarter(starter.code))!
    await markStarterUsed(starter.code, token, 'ord_1')
    const spent = (await getStarter(starter.code))!
    expect(spent.orderId).toBe('ord_1')
    expect(starterState(spent)).toBe('used')
  })
})

/**
 * Claiming at the checkout.
 *
 * There is no code any more: who is claiming comes from the partner session,
 * so these drive `getSessionPartner` rather than passing a string around. That
 * is the security boundary — a browser can say "this is a claim", it cannot say
 * whose.
 */
jest.mock('@/lib/partners/auth', () => ({
  ...jest.requireActual('@/lib/partners/auth'),
  getSessionPartner: jest.fn(),
}))
const { getSessionPartner } = jest.requireMock('@/lib/partners/auth') as {
  getSessionPartner: jest.Mock
}

describe('claiming at a checkout', () => {
  const quiz = { channel: 'quiz' as const, goodsListSubtotal: 80, format: gbp }

  afterEach(() => getSessionPartner.mockReset())

  it('does nothing at all for a visitor who is not a partner', async () => {
    getSessionPartner.mockResolvedValue(null)
    expect(await claimStarterForCheckout(quiz)).toBeNull()
  })

  it('does nothing for a partner with no starter — they are just shopping', async () => {
    const partner = await createPartner({ email: `plain${Math.random()}@example.com`, name: 'Sam Reed' })
    getSessionPartner.mockResolvedValue(partner)
    expect(await claimStarterForCheckout(quiz)).toBeNull()
  })

  it('claims a signed one on a quiz stack', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    getSessionPartner.mockResolvedValue(partner)
    const claim = await claimStarterForCheckout(quiz)
    expect(claim?.ok).toBe(true)
  })

  it('tells an unsigned partner to go and sign, rather than going quiet', async () => {
    const { partner } = await partnerWithStarter()
    getSessionPartner.mockResolvedValue(partner)
    const claim = await claimStarterForCheckout(quiz)
    expect(claim?.ok).toBe(false)
    if (claim && !claim.ok) expect(claim.reason).toMatch(/sign/i)
  })

  it('refuses a basket over the cap, and does NOT spend the starter on it', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    getSessionPartner.mockResolvedValue(partner)
    const claim = await claimStarterForCheckout({ ...quiz, goodsListSubtotal: 250 })
    expect(claim?.ok).toBe(false)
    // The important half: it is still there afterwards.
    expect((await getStarter(starter.code))!.claimToken).toBeNull()
  })

  it('refuses a subscription outright — a free plan renews free forever', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    getSessionPartner.mockResolvedValue(partner)
    const claim = await claimStarterForCheckout({ ...quiz, channel: 'subscription' })
    expect(claim?.ok).toBe(false)
    expect((await getStarter(starter.code))!.claimToken).toBeNull()
  })

  it('refuses the shop shelf — the offer is the stack the quiz builds', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    getSessionPartner.mockResolvedValue(partner)
    expect((await claimStarterForCheckout({ ...quiz, channel: 'shop' }))?.ok).toBe(false)
  })

  /*
    Spent once, and then SILENT — not refused.

    The difference is the whole reason `starterForSession` returns null rather
    than a refusal here. A partner is a customer too: once their free stack is
    taken, their next order has to go through and be charged for like anybody
    else's. A session that kept refusing would block them from buying; one that
    kept claiming would be a standing 100% discount.
  */
  it('is claimable once, and then stops existing rather than starts refusing', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    getSessionPartner.mockResolvedValue(partner)

    const first = await claimStarterForCheckout(quiz)
    expect(first?.ok).toBe(true)
    if (first?.ok) await markStarterUsed(starter.code, first.token, 'ord_1')

    expect(await claimStarterForCheckout(quiz)).toBeNull()
    expect(await starterForSession({ channel: 'quiz' })).toBeNull()
  })

  it('refuses a suspended partner', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    await updatePartner(partner.id, { status: 'suspended' })
    getSessionPartner.mockResolvedValue({ ...partner, status: 'suspended' })
    expect((await claimStarterForCheckout(quiz))?.ok).toBe(false)
  })

  it('lists a partner’s starters newest first', async () => {
    const { partner } = await partnerWithStarter()
    expect(await listStartersForPartner(partner.id)).toHaveLength(1)
  })
})
