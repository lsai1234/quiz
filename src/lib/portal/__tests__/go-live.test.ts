/**
 * @jest-environment node
 */
import { getEngine } from '@/lib/db/engine'
import { createUser } from '@/lib/db/users'
import { RESET_GROUPS, lastReset, liveHoldings, resetPreview, runReset } from '../go-live'

/**
 * The reset's one hard promise: it never deletes a row marked `live`.
 *
 * Everything else here is in service of that. The dangerous case is not "wipe an
 * empty test database" — it is running this by accident a month after go-live,
 * with real orders in the same tables, which is exactly when the founder is
 * least likely to read the confirmation properly.
 */

const ALL = RESET_GROUPS.map((g) => g.id)

/**
 * Wipe directly between tests, not with `runReset`.
 *
 * The engine is one in-memory database for the whole file, and the thing under
 * test is precisely that `runReset` will *not* remove live rows — so using it to
 * clean up would leave every live row seeded by an earlier test in place, and
 * each assertion would be counting the one before it.
 */
beforeEach(async () => {
  const db = await getEngine()
  for (const table of [
    'partner_commissions',
    'partner_payouts',
    'partners',
    'consents',
    'subscription_changes',
    'stock_exceptions',
    'notifications',
    'orders',
    'subscriptions',
    'users',
  ]) {
    await db.run(`DELETE FROM ${table}`)
  }
})

async function seedOrder(id: string, mode: string, userId: string | null = null) {
  const db = await getEngine()
  await db.run(
    `INSERT INTO orders (id, user_id, email, channel, status, data, stripe_session_id,
       stripe_payment_id, supplier_order_id, partner_code, mode, created_at, updated_at)
     VALUES (?, ?, ?, 'shop', 'paid', '{}', NULL, NULL, NULL, NULL, ?, ?, ?)`,
    [id, userId, `${id}@example.com`, mode, new Date().toISOString(), new Date().toISOString()],
  )
}

async function seedSubscription(userId: string, mode: string) {
  const db = await getEngine()
  await db.run(
    'INSERT INTO subscriptions (user_id, data, mode, updated_at) VALUES (?, ?, ?, ?)',
    [userId, '{}', mode, new Date().toISOString()],
  )
}

async function count(table: string): Promise<number> {
  const db = await getEngine()
  const row = await db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)
  return Number(row?.count ?? 0)
}

describe('the live guard', () => {
  it('deletes sandbox and mock orders but never live ones', async () => {
    await seedOrder('o-sandbox', 'sandbox')
    await seedOrder('o-mock', 'mock')
    await seedOrder('o-live', 'live')

    await runReset(['orders'])

    const db = await getEngine()
    const left = await db.all<{ id: string }>('SELECT id FROM orders')
    expect(left.map((r) => r.id)).toEqual(['o-live'])
  })

  it('treats an untagged row as sandbox, matching the v15 backfill', async () => {
    const db = await getEngine()
    await db.run(
      `INSERT INTO orders (id, user_id, email, channel, status, data, stripe_session_id,
         stripe_payment_id, supplier_order_id, partner_code, mode, created_at, updated_at)
       VALUES ('o-null', NULL, 'x@y.z', 'shop', 'paid', '{}', NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      [new Date().toISOString(), new Date().toISOString()],
    )
    await runReset(['orders'])
    expect(await count('orders')).toBe(0)
  })

  it('reports what it refused to touch', async () => {
    await seedOrder('o-live-2', 'live')
    const user = await createUser({ email: 'live-member@example.com' })
    await seedSubscription(user.id, 'live')

    expect(await liveHoldings()).toEqual({ orders: 1, subscriptions: 1 })

    const result = await runReset(ALL)
    expect(result.live).toEqual({ orders: 1, subscriptions: 1 })
  })
})

describe('the orphan sweeps', () => {
  it('keeps a live member’s consents and changes, and clears a test member’s', async () => {
    const liveUser = await createUser({ email: 'keeps@example.com' })
    const testUser = await createUser({ email: 'goes@example.com' })
    await seedSubscription(liveUser.id, 'live')
    await seedSubscription(testUser.id, 'sandbox')

    const db = await getEngine()
    for (const uid of [liveUser.id, testUser.id]) {
      await db.run(
        'INSERT INTO consents (id, user_id, context, terms_version, data, accepted_at) VALUES (?, ?, ?, ?, ?, ?)',
        [`c-${uid}`, uid, 'checkout', 'v1', '{}', new Date().toISOString()],
      )
      await db.run(
        `INSERT INTO subscription_changes (id, user_id, subscription_id, line_id, product_id,
           sku, kind, status, data, auto_apply_at, created_at, updated_at, resolved_at)
         VALUES (?, ?, NULL, NULL, 'p1', NULL, 'price', 'open', '{}', NULL, ?, ?, NULL)`,
        [`ch-${uid}`, uid, new Date().toISOString(), new Date().toISOString()],
      )
    }

    await runReset(['subscriptions'])

    const consents = await db.all<{ user_id: string }>('SELECT user_id FROM consents')
    expect(consents.map((r) => r.user_id)).toEqual([liveUser.id])
    const changes = await db.all<{ user_id: string }>('SELECT user_id FROM subscription_changes')
    expect(changes.map((r) => r.user_id)).toEqual([liveUser.id])
  })

  it('clears commissions for deleted orders and keeps those for live ones', async () => {
    const db = await getEngine()
    await db.run(
      "INSERT INTO partners (id, email, name, password_hash, status, data, created_at, updated_at) VALUES ('p1','p@x.com','P',NULL,'active','{}',?,?)",
      [new Date().toISOString(), new Date().toISOString()],
    )
    await seedOrder('o-live-3', 'live')
    await seedOrder('o-test-3', 'sandbox')
    for (const [id, orderId] of [
      ['cm-live', 'o-live-3'],
      ['cm-test', 'o-test-3'],
    ]) {
      await db.run(
        `INSERT INTO partner_commissions (id, partner_id, order_id, kind, net_basis, rate, amount,
           state, confirm_after, payout_id, created_at)
         VALUES (?, 'p1', ?, 'first', '10', '0.1', '1', 'pending', ?, NULL, ?)`,
        [id, orderId, new Date().toISOString(), new Date().toISOString()],
      )
    }

    await runReset(['orders', 'partnerEarnings'])

    const left = await db.all<{ id: string }>('SELECT id FROM partner_commissions')
    expect(left.map((r) => r.id)).toEqual(['cm-live'])
    // The partner account itself is never touched by a reset.
    expect(await count('partners')).toBe(1)
  })
})

describe('accounts and settings survive', () => {
  it('keeps users, partners and the kv settings store', async () => {
    await createUser({ email: 'survivor@example.com' })
    await seedOrder('o-x', 'sandbox')

    await runReset(ALL)

    expect(await count('users')).toBeGreaterThan(0)
    // The audit entry itself lives in kv and must outlive the reset that wrote it.
    const log = await lastReset()
    expect(log).toBeDefined()
    expect(log!.groups).toEqual(ALL)
  })
})

describe('preview', () => {
  it('counts only what would go, excluding live rows', async () => {
    await seedOrder('p-live', 'live')
    await seedOrder('p-test-1', 'sandbox')
    await seedOrder('p-test-2', 'sandbox')

    const preview = await resetPreview(['orders'])
    expect(preview.byTable.orders).toBe(2)
    expect(preview.live.orders).toBe(1)
  })

  it('is idempotent — a second reset removes nothing more', async () => {
    await seedOrder('i-1', 'sandbox')
    const first = await runReset(ALL)
    expect(first.total).toBeGreaterThan(0)
    const second = await runReset(ALL)
    expect(second.total).toBe(0)
  })
})
