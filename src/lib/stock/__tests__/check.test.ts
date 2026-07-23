import { runStockCheck } from '@/lib/stock/check'
import { substituteException, skipException } from '@/lib/stock/service'
import { supplierProductToCatalogue } from '@/lib/supplier/mapping'
import { POWERBODY_FIXTURES } from '@/lib/supplier/powerbody/fixtures'
import { forceOutOfStock, __resetForcedOutOfStock } from '@/lib/supplier/powerbody/mock'
import { addImportedProducts } from '@/lib/portal/store'
import { saveSubscription, getSubscription } from '@/lib/db/hub-data'
import { createUser } from '@/lib/db/users'
import { getException } from '@/lib/stock/repo'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'

const fx = (sku: string) => POWERBODY_FIXTURES.find((p) => p.sku === sku)!

function subWith(line: Partial<MemberSubscriptionLine>, productId: string, email: string): MemberSubscription {
  const l: MemberSubscriptionLine = {
    id: 'line-1',
    productId,
    productTitle: 'X',
    variantTitle: '',
    slotTitle: 'Performance',
    stackSlot: 'performance',
    quantity: 1,
    deliveryIntervalMonths: 1,
    pricePerDelivery: 20,
    swapGroup: 'creatine',
    addedAt: new Date().toISOString(),
    deliveriesMade: 0,
    allowSubstitution: true,
    ...line,
  }
  return {
    id: 'sub_x', status: 'active', customerEmail: email, flatMonthly: 20,
    dispatchDayOfMonth: 15, minMonths: 1, monthsActive: 1, startedAt: new Date().toISOString(),
    paymentMethod: null, lines: [l],
  }
}

describe('daily stock check + resolution', () => {
  beforeEach(() => __resetForcedOutOfStock())
  afterEach(() => __resetForcedOutOfStock())

  it('flags an out-of-stock line and suggests a same-category replacement, then substitutes', async () => {
    const oos = supplierProductToCatalogue(fx('ON-CREA-634'))     // creatine, in stock at add
    const repl = supplierProductToCatalogue(fx('APP-CREA-250'))   // creatine, stays in stock
    await addImportedProducts([oos, repl])

    const user = await createUser({ email: 'sub-a@example.com' })
    await saveSubscription(user.id, subWith({ productId: oos.id, productTitle: oos.title, swapGroup: 'creatine' }, oos.id, 'sub-a@example.com'))

    forceOutOfStock('ON-CREA-634') // the OOS product's supplier SKU

    const result = await runStockCheck()
    const exc = result.exceptions.find((e) => e.userId === user.id)
    expect(exc).toBeDefined()
    expect(exc!.allowSubstitution).toBe(true)
    expect(exc!.suggestedReplacementId).toBeTruthy()

    await substituteException(exc!.id, repl.id)
    const sub = await getSubscription(user.id)
    expect(sub?.lines[0].productId).toBe(repl.id) // line swapped to the in-stock product
    expect((await getException(exc!.id))?.status).toBe('resolved')
  })

  it('for a line that declines substitution, offers no swap and resolves via skip', async () => {
    const oos = supplierProductToCatalogue(fx('APP-CREA-250'))
    await addImportedProducts([oos])
    const user = await createUser({ email: 'sub-b@example.com' })
    await saveSubscription(
      user.id,
      subWith({ productId: oos.id, productTitle: oos.title, swapGroup: 'creatine', allowSubstitution: false }, oos.id, 'sub-b@example.com'),
    )

    forceOutOfStock('APP-CREA-250')
    const result = await runStockCheck()
    const exc = result.exceptions.find((e) => e.userId === user.id)!
    expect(exc.allowSubstitution).toBe(false)
    expect(exc.suggestedReplacementId).toBeNull()

    await skipException(exc.id)
    expect((await getException(exc.id))?.status).toBe('resolved')
    expect((await getException(exc.id))?.resolution).toBe('skipped')
  })

  it('does not flag a line whose product is in stock', async () => {
    const inStock = supplierProductToCatalogue(fx('ON-CREA-634'))
    await addImportedProducts([inStock])
    const user = await createUser({ email: 'sub-c@example.com' })
    await saveSubscription(user.id, subWith({ productId: inStock.id, productTitle: inStock.title }, inStock.id, 'sub-c@example.com'))

    // no force → in stock
    const result = await runStockCheck()
    expect(result.exceptions.find((e) => e.userId === user.id)).toBeUndefined()
  })
})
