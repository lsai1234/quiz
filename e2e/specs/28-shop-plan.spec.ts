import { test, expect } from '@playwright/test'
import { addProductToBasket, openBasket, openProductSheet, openShop } from '../support/shop'
import { newCustomer, signUpViaApi } from '../support/accounts'

/**
 * A shop basket bought every month (`lib/checkout/shop-plan`): the same price
 * as buying it once, the quiz plan's checkout (account, terms, then Stripe),
 * and the member hub with it. The suite runs on mock payments, so a finished
 * checkout sets the plan up on the spot.
 */

const basketDrawer = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Your basket' })

test.describe('the shop, every month', () => {
  test('a basket goes monthly through the account gate, and the hub opens with it', async ({ page }) => {
    await openShop(page)
    await addProductToBasket(page, 'Whey Protein')
    await openBasket(page)
    const drawer = basketDrawer(page)

    await drawer.getByRole('button', { name: 'Every month' }).click()
    await expect(drawer.getByRole('button', { name: 'Every month' })).toHaveAttribute('aria-pressed', 'true')
    await expect(drawer.getByText(/a month, the same as buying it once/)).toBeVisible()
    await expect(drawer.getByText(/member hub comes with it/i)).toBeVisible()
    await drawer.getByRole('button', { name: /Start monthly plan/ }).click()

    // Signed out: the quiz plan's own account gate, terms and all.
    const gate = page.getByRole('dialog', { name: 'Create your account to subscribe' })
    await expect(gate).toBeVisible({ timeout: 15_000 })
    const who = newCustomer('monthly')
    await gate.getByLabel('Email address').fill(who.email)
    await gate.getByLabel('Password').fill(who.password)
    await gate.getByRole('checkbox').check()
    await gate.getByRole('button', { name: 'Continue to payment' }).click()

    await expect(drawer.getByText('Your monthly plan is set up.')).toBeVisible({ timeout: 30_000 })
    await drawer.getByRole('link', { name: 'Go to your hub' }).click()
    await page.waitForURL(/\/myhub/)
    await expect(page.getByText('YOUR SUBSCRIPTION')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Whey Protein/).first()).toBeVisible()
  })

  test('signed in already, it asks for the terms and then sets up', async ({ page }) => {
    await signUpViaApi(page, newCustomer('monthly-in'))
    await openShop(page)
    await addProductToBasket(page, 'Whey Protein')
    await openBasket(page)
    const drawer = basketDrawer(page)
    await drawer.getByRole('button', { name: 'Every month' }).click()
    await drawer.getByRole('button', { name: /Start monthly plan/ }).click()

    const terms = page.getByRole('dialog', { name: 'Confirm the subscription terms' })
    await expect(terms).toBeVisible({ timeout: 15_000 })
    await terms.getByRole('checkbox').check()
    await terms.getByRole('button', { name: 'Continue to payment' }).click()
    await expect(drawer.getByText('Your monthly plan is set up.')).toBeVisible({ timeout: 30_000 })
  })

  test('“Get it every month” on a product page sets the basket to monthly', async ({ page }) => {
    await openShop(page)
    await openProductSheet(page, 'Whey Protein')
    await page.getByRole('button', { name: /Get it every month/ }).click()
    await page.waitForURL(/\/shop/)
    const drawer = basketDrawer(page)
    await expect(drawer).toBeVisible({ timeout: 20_000 })
    await expect(drawer.getByRole('button', { name: 'Every month' })).toHaveAttribute('aria-pressed', 'true')
    await expect(drawer.getByText(/Whey Protein/).first()).toBeVisible()
  })
})
