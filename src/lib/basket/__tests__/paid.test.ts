import { basketSignature, releasePaidBasket, rememberBasketBeingPaid } from '../paid'
import { useBasket } from '../store'

/** The basket empties after a confirmed purchase, and only when it still holds what was paid for. */

beforeEach(() => {
  sessionStorage.clear()
  useBasket.getState().clear()
})

it('empties the basket that was paid for', () => {
  useBasket.getState().add('whey', 'whey-choc', 2)
  rememberBasketBeingPaid()
  expect(releasePaidBasket()).toBe(true)
  expect(useBasket.getState().lines).toEqual([])
})

it('leaves a basket that changed since, and one nobody paid for', () => {
  useBasket.getState().add('whey', 'whey-choc', 1)
  rememberBasketBeingPaid()
  useBasket.getState().add('creatine', 'creatine-300', 1)
  expect(releasePaidBasket()).toBe(false)
  expect(useBasket.getState().lines).toHaveLength(2)

  // Opened later from an email: nothing remembered, nothing emptied.
  expect(releasePaidBasket()).toBe(false)
  expect(useBasket.getState().lines).toHaveLength(2)
})

it('reads the same basket the same way, whatever the order', () => {
  expect(basketSignature([{ productId: 'a', variantId: 'a1', quantity: 1 }, { productId: 'b', variantId: 'b1', quantity: 2 }])).toBe(
    basketSignature([{ productId: 'b', variantId: 'b1', quantity: 2 }, { productId: 'a', variantId: 'a1', quantity: 1 }]),
  )
})
