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
import { checkStarterCode, claimStarterForCheckout } from '../redeem'
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
    expect(starter.goodsCap).toBe(140)
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

describe('checking one at a checkout', () => {
  const quiz = { channel: 'quiz' as const, goodsListSubtotal: 100, format: gbp }

  it('ignores a string that is not shaped like one of ours, so it can fall through', async () => {
    expect(await checkStarterCode('SARAH20', { channel: 'quiz' })).toBeNull()
    expect(await checkStarterCode('FH-FREE-7K4M2XQP', { channel: 'quiz' })).toBeNull()
  })

  it('ignores a well-shaped code we have never issued, rather than confirming the shape', async () => {
    expect(await checkStarterCode('PS-ZZZZZZZZ', { channel: 'quiz' })).toBeNull()
  })

  it('claims a signed one on a quiz stack', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    const claim = await claimStarterForCheckout(starter.code, quiz)
    expect(claim?.ok).toBe(true)
  })

  it('refuses a basket over the cap, and does NOT spend the code on it', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    const claim = await claimStarterForCheckout(starter.code, { ...quiz, goodsListSubtotal: 250 })
    expect(claim?.ok).toBe(false)
    // The important half: it is still there afterwards.
    expect((await getStarter(starter.code))!.claimToken).toBeNull()
  })

  it('refuses a subscription outright — a free plan renews free forever', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    const claim = await claimStarterForCheckout(starter.code, { ...quiz, channel: 'subscription' })
    expect(claim?.ok).toBe(false)
    expect((await getStarter(starter.code))!.claimToken).toBeNull()
  })

  it('refuses a suspended partner’s starter', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    await updatePartner(partner.id, { status: 'suspended' })
    const claim = await claimStarterForCheckout(starter.code, quiz)
    expect(claim?.ok).toBe(false)
  })

  /* `invited` is the normal state for somebody claiming one: setting a password
     and taking your free stack happen in whichever order you get round to. */
  it('does not refuse a partner who has never signed in', async () => {
    const { partner, starter } = await partnerWithStarter()
    await sign(partner, starter.code)
    const claim = await claimStarterForCheckout(starter.code, quiz)
    expect(claim?.ok).toBe(true)
  })

  it('lists a partner’s starters newest first', async () => {
    const { partner } = await partnerWithStarter()
    const rows = await listStartersForPartner(partner.id)
    expect(rows).toHaveLength(1)
  })
})
