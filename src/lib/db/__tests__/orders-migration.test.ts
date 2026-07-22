import { getEngine } from '@/lib/db/engine'

// Phase 0 scaffolding: confirms the v3 migration applies cleanly and creates the
// orders + stock_exceptions tables (no repository yet — just the schema).
describe('v3 commerce migration', () => {
  it('creates the orders and stock_exceptions tables', async () => {
    const db = await getEngine()
    // A successful insert/select proves the table + columns exist on the engine.
    await db.run(
      `INSERT INTO orders (id, email, channel, status, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['ord_test', 'a@b.com', 'shop', 'pending_payment', '{}', '2026-01-01', '2026-01-01'],
    )
    const order = await db.get<{ id: string; status: string }>('SELECT id, status FROM orders WHERE id = ?', ['ord_test'])
    expect(order).toEqual({ id: 'ord_test', status: 'pending_payment' })

    await db.run(
      `INSERT INTO stock_exceptions (id, product_id, status, data, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      ['exc_test', 'whey-protein', 'open', '{}', '2026-01-01'],
    )
    const exc = await db.get<{ id: string; product_id: string }>('SELECT id, product_id FROM stock_exceptions WHERE id = ?', ['exc_test'])
    expect(exc).toEqual({ id: 'exc_test', product_id: 'whey-protein' })
  })
})
