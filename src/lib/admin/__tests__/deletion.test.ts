/**
 * Deleting things for good, against the real (in-memory) database.
 *
 * Every assertion here is about a button that cannot be un-pressed. The ones
 * that matter most are the REFUSALS: an order already with the supplier and an
 * order that was actually paid for are facts about the world outside this
 * database, and deleting our row changes none of it — it only means nobody here
 * can see what happened.
 */
import { insertCommission, listCommissions, getPartner } from '@/lib/partners/repo'
// The FULL creation — account, code, opening terms and starter — which is what a
// founder pressing "Add partner" actually runs. `repo.createPartner` makes the
// row alone, and testing against that would miss the thing that broke.
import { createPartner as createPartnerRecord } from '@/lib/partners'
import { listStartersForPartner } from '@/lib/partner-starter/repo'
import { starterState } from '@/lib/partner-starter/rules'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { getOrder } from '@/lib/orders/repo'
import { getEngine } from '@/lib/db/engine'
import {
  checkOrderDeletion,
  checkPartnerDeletion,
  deleteOrder,
  deletePartner,
  recentDeletions,
} from '../deletion'

let n = 0
const email = () => `p${n++}-${Math.random().toString(36).slice(2)}@example.invalid`

/** The account itself, out of the record the full creation returns. */
const createPartner = async (input: { email: string; name: string }) =>
  (await createPartnerRecord(input)).partner

const line = { sku: 'X', productId: 'p', title: 'Creatine', variantTitle: null, quantity: 1, unitPrice: 20, supplierCost: 9 }

async function anOrder(patch: Record<string, unknown> = {}) {
  return createOrderFromCheckout({ channel: 'quiz', lines: [line], status: 'paid', ...patch })
}

/**
 * An order's truth lives in its `data` blob — the columns beside it are
 * denormalised copies for indexing, and `getOrder` parses the blob. A test that
 * set the column alone would be testing nothing, which is exactly what the
 * first version of this file did: the supplier guard "failed" because the
 * fixture never actually put the order with the supplier.
 */
async function patchOrderJson(id: string, patch: Record<string, unknown>) {
  const db = await getEngine()
  const row = await db.get<{ data: string }>('SELECT data FROM orders WHERE id = ?', [id])
  const data = { ...JSON.parse(row!.data), ...patch }
  await db.run('UPDATE orders SET data = ? WHERE id = ?', [JSON.stringify(data), id])
}

describe('deleting a partner', () => {
  it('frees the email, which is the whole point', async () => {
    const address = email()
    const partner = await createPartner({ email: address, name: 'Test One' })

    expect((await deletePartner(partner.id)).ok).toBe(true)
    expect(await getPartner(partner.id)).toBeNull()

    // The unique index no longer holds it, so the address is usable again.
    const reused = await createPartner({ email: address, name: 'Test Two' })
    expect(reused.email).toBe(address)
  })

  it('takes their code, terms, sessions and starters with them', async () => {
    const partner = await createPartner({ email: email(), name: 'Test' })
    const db = await getEngine()
    await db.run(
      `INSERT INTO partner_starters (code, partner_id, tier, goods_cap, note, created_by, created_at, expires_at,
         agreement_id, claim_token, claimed_at, used_at, order_id, revoked_at)
       VALUES ('PS-DELTEST1', ?, 'performance', 100, NULL, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL)`,
      [partner.id, new Date().toISOString(), new Date(Date.now() + 86_400_000).toISOString()],
    )

    await deletePartner(partner.id)

    for (const table of ['partner_codes', 'partner_terms', 'partner_starters', 'partner_agreements']) {
      const left = await db.all(`SELECT 1 FROM ${table} WHERE partner_id = ?`, [partner.id])
      expect(left).toHaveLength(0)
    }
  })

  /*
    The line is money. Our own agreement tells a partner we keep their accounts
    for six years — deleting a paid one is not a tidy-up, it is destroying the
    record of what we owed and settled.
  */
  it.each(['paid', 'invoiced'] as const)('refuses one with %s commission, and says to suspend instead', async (state) => {
    const partner = await createPartner({ email: email(), name: 'Earner' })
    const order = await anOrder()
    await insertCommission({
      partnerId: partner.id,
      orderId: order.id,
      kind: 'first',
      amount: 12.5,
      rate: 0.15,
      netBasis: 83.33,
      state,
      confirmAfter: new Date().toISOString(),
      payoutId: null,
    })

    const check = await checkPartnerDeletion(partner.id)
    expect(check.ok).toBe(false)
    expect(check.reason).toMatch(/suspend/i)
    expect(check.reason).toContain('£12.50')

    // And the refusal is real, not advisory — the delete itself declines too.
    expect((await deletePartner(partner.id)).ok).toBe(false)
    expect(await getPartner(partner.id)).not.toBeNull()
  })

  it('allows one whose only commission was reversed', async () => {
    const partner = await createPartner({ email: email(), name: 'Refunded' })
    const order = await anOrder()
    await insertCommission({
      partnerId: partner.id,
      orderId: order.id,
      kind: 'first',
      amount: 12.5,
      rate: 0.15,
      netBasis: 83.33,
      state: 'reversed',
      confirmAfter: new Date().toISOString(),
      payoutId: null,
    })
    expect((await checkPartnerDeletion(partner.id)).ok).toBe(true)
    expect((await deletePartner(partner.id)).ok).toBe(true)
    expect(await listCommissions(partner.id)).toHaveLength(0)
  })
})

/**
 * Deleting a partner puts everything back to before they existed.
 *
 * Not just the email — the whole ability to start again. A founder deleting a
 * test partner and re-adding them must get a clean slate: a new account, a new
 * starter, unsigned, claimable. Anything of the old partner's that survived
 * would be a stack somebody could not claim, or one they could claim twice.
 */
describe('deleting a partner resets their stack', () => {
  /*
    The founder's actual steps, in order, and the state that broke.

    Delete a partner, re-add them with the same email and code, send them their
    link — and the partner could not claim, because a re-added account came back
    with no starter on it and the claim page told them the link had expired. The
    link was fine. There was nothing on it, and nothing said so.

    Creating a partner now issues the starter with the account, which is what
    makes "add a partner" mean "they can claim a stack".
  */
  it('re-adding the same email gives them a claimable stack straight away', async () => {
    const address = email()
    const first = await createPartner({ email: address, name: 'Round One' })
    expect((await deletePartner(first.id)).ok).toBe(true)

    const second = await createPartner({ email: address, name: 'Round One' })
    const starters = await listStartersForPartner(second.id)

    expect(starters).toHaveLength(1)
    expect(starterState(starters[0])).toBe('unsigned')
    expect(starters[0].goodsCap).toBe(100)
    // Their own, not the deleted account's.
    expect(starters[0].partnerId).toBe(second.id)
  })

  it('lets the same email be re-added and claim all over again', async () => {
    const address = email()
    const first = await createPartner({ email: address, name: 'Round One' })
    const db = await getEngine()
    const at = new Date().toISOString()
    const expires = new Date(Date.now() + 86_400_000).toISOString()
    // Signed AND spent — the furthest-gone state a starter can be in.
    await db.run(
      `INSERT INTO partner_starters (code, partner_id, tier, goods_cap, note, created_by, created_at, expires_at,
         agreement_id, claim_token, claimed_at, used_at, order_id, revoked_at)
       VALUES ('PS-ROUNDONE', ?, 'performance', 100, NULL, NULL, ?, ?, 'ag_r1', 'tok', ?, ?, 'ord_r1', NULL)`,
      [first.id, at, expires, at, at],
    )
    await db.run(
      `INSERT INTO partner_agreements (id, partner_id, code, version, doc_hash, signed_name, handle,
         deliverables, ip, user_agent, signed_at)
       VALUES ('ag_r1', ?, 'PS-ROUNDONE', 'v1', 'h', 'Round One', NULL, '[]', NULL, NULL, ?)`,
      [first.id, at],
    )

    expect((await deletePartner(first.id)).ok).toBe(true)

    // Nothing of theirs is left to get in the way.
    for (const table of ['partner_starters', 'partner_agreements']) {
      expect(await db.all(`SELECT 1 FROM ${table} WHERE partner_id = ?`, [first.id])).toHaveLength(0)
    }

    /*
      And the same person can be set up from scratch — with a stack waiting.

      This asserted ZERO starters when it was written, which was the bug rather
      than the requirement: a re-added partner came back with nothing to claim
      and a link that told them it had expired.
    */
    const second = await createPartner({ email: address, name: 'Round Two' })
    expect(second.id).not.toBe(first.id)
    const fresh = await db.all('SELECT 1 FROM partner_starters WHERE partner_id = ?', [second.id])
    expect(fresh).toHaveLength(1)
  })
})

describe('deleting an order', () => {
  it('removes it outright', async () => {
    const order = await anOrder({ status: 'pending_payment' })
    expect((await deleteOrder(order.id)).ok).toBe(true)
    expect(await getOrder(order.id)).toBeNull()
  })

  /*
    Deleting our row does not stop PowerBody picking and shipping the parcel.
    It only means nobody here knows they are.
  */
  it('refuses one already with the supplier', async () => {
    const order = await anOrder()
    await patchOrderJson(order.id, { supplierOrderId: 'PB-1' })

    const check = await checkOrderDeletion(order.id)
    expect(check.ok).toBe(false)
    expect(check.reason).toMatch(/powerbody/i)
    expect(await getOrder(order.id)).not.toBeNull()
  })

  /*
    A captured payment is money that moved. Deleting the order does not give it
    back, and an order missing from the books while the statement still shows
    the charge is the worst discrepancy to meet later.
  */
  it('refuses one that was paid for and not refunded', async () => {
    const order = await anOrder()
    await patchOrderJson(order.id, { stripePaymentIntentId: 'pi_1' })

    const check = await checkOrderDeletion(order.id)
    expect(check.ok).toBe(false)
    expect(check.reason).toMatch(/refund it first/i)
  })

  it('allows a refunded one — the money is already back', async () => {
    const order = await anOrder({ status: 'refunded' })
    await patchOrderJson(order.id, { stripePaymentIntentId: 'pi_2' })
    expect((await checkOrderDeletion(order.id)).ok).toBe(true)
  })

  it('takes any commission on it, which would otherwise claim money for nothing', async () => {
    const partner = await createPartner({ email: email(), name: 'Attributed' })
    const order = await anOrder({ status: 'pending_payment' })
    await insertCommission({
      partnerId: partner.id,
      orderId: order.id,
      kind: 'first',
      amount: 9,
      rate: 0.15,
      netBasis: 60,
      state: 'accrued',
      confirmAfter: new Date().toISOString(),
      payoutId: null,
    })

    const check = await checkOrderDeletion(order.id)
    expect(check.effects.join(' ')).toMatch(/commission/i)

    await deleteOrder(order.id)
    expect(await listCommissions(partner.id)).toHaveLength(0)
  })

  /*
    The partner signed an agreement and took their one free stack. Our decision
    to delete the order is not a reason for them to lose it.
  */
  it('gives a partner their starter back', async () => {
    const partner = await createPartner({ email: email(), name: 'Claimant' })
    const order = await anOrder({ status: 'paid' })
    const db = await getEngine()
    await db.run(
      `INSERT INTO partner_starters (code, partner_id, tier, goods_cap, note, created_by, created_at, expires_at,
         agreement_id, claim_token, claimed_at, used_at, order_id, revoked_at)
       VALUES ('PS-GIVEBACK', ?, 'performance', 100, NULL, NULL, ?, ?, 'ag_1', 'tok', ?, ?, ?, NULL)`,
      [
        partner.id,
        new Date().toISOString(),
        new Date(Date.now() + 86_400_000).toISOString(),
        new Date().toISOString(),
        new Date().toISOString(),
        order.id,
      ],
    )

    const check = await checkOrderDeletion(order.id)
    expect(check.effects.join(' ')).toContain('PS-GIVEBACK')

    await deleteOrder(order.id)
    const row = await db.get<{ used_at: string | null; order_id: string | null; claim_token: string | null }>(
      'SELECT used_at, order_id, claim_token FROM partner_starters WHERE code = ?',
      ['PS-GIVEBACK'],
    )
    expect(row?.used_at).toBeNull()
    expect(row?.order_id).toBeNull()
    expect(row?.claim_token).toBeNull()
  })
})

describe('the tombstone', () => {
  it('records what went, who did it and why — without keeping a copy of it', async () => {
    const partner = await createPartner({ email: 'tomb@example.invalid', name: 'Gone Person' })
    await deletePartner(partner.id, { by: 'founder@chrgd.dev', reason: 'duplicate account' })

    const entry = (await recentDeletions()).find((d) => d.subjectId === partner.id)
    expect(entry).toBeDefined()
    expect(entry?.kind).toBe('partner')
    expect(entry?.founder).toBe('founder@chrgd.dev')
    expect(entry?.reason).toBe('duplicate account')
    // A description, not the row: enough to answer "did we delete this, and
    // what was it", and not a second copy of the data we just removed.
    expect(entry?.summary).toContain('Gone Person')
  })

  it('writes nothing for a refusal', async () => {
    const order = await anOrder()
    await patchOrderJson(order.id, { supplierOrderId: 'PB-2' })
    await deleteOrder(order.id, { by: 'founder@chrgd.dev' })
    expect((await recentDeletions()).find((d) => d.subjectId === order.id)).toBeUndefined()
  })
})
