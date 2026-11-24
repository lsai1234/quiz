import { test, expect, type Page } from '@playwright/test'
import { addProductToBasket, openBasket, openProductSheet, openShop } from '../support/shop'
import { newCustomer, signUpViaApi } from '../support/accounts'

/**
 * Every way into the hub, with no demo plan to hide behind.
 *
 * In mock payments a hub sign-in with no plan is normally handed a demo one,
 * which makes every account look like a subscriber. Accounts at
 * `real.e2e.test` are left as they are (`HUB_DEMO_SKIP_DOMAIN`), so these see
 * what a customer who came in that way sees: what they have, said plainly, and
 * how to manage it or add to it.
 */

test.setTimeout(180_000)

const real = (tag: string) => {
  const who = newCustomer(tag)
  return { ...who, email: who.email.replace('@e2e.test', '@real.e2e.test') }
}
const basketDrawer = (page: Page) => page.getByRole('dialog', { name: 'Your basket' })

/** A shop basket of one product, bought every month, signed in already. */
async function startMonthlyBasket(page: Page, product: string) {
  await openShop(page)
  await addProductToBasket(page, product)
  await openBasket(page)
  const drawer = basketDrawer(page)
  await drawer.getByRole('button', { name: 'Every month' }).click()
  // What happens, before anyone commits: today, then each month, then where it's run from.
  await expect(drawer.getByText(/Your first box today, then £[\d.]+ on the \d+(st|nd|rd|th)/)).toBeVisible()
  await expect(drawer.getByText(/It’s run from your hub: add, swap or remove products, skip a month, pause or cancel any time/)).toBeVisible()
  await drawer.getByRole('button', { name: /Start monthly plan/ }).click()
  const terms = page.getByRole('dialog', { name: 'Confirm the subscription terms' })
  await expect(terms).toBeVisible({ timeout: 15_000 })
  await terms.getByRole('checkbox').check()
  await terms.getByRole('button', { name: 'Continue to payment' }).click()
  await expect(drawer.getByText('Your monthly plan is set up.')).toBeVisible({ timeout: 30_000 })
  await drawer.getByRole('link', { name: 'Go to your hub' }).click()
  await page.waitForURL(/\/myhub/)
}

test('signed up, nothing bought: no plan, the ways in, and no plan for free', async ({ page }) => {
  await signUpViaApi(page, real('none'))
  await page.goto('/myhub')
  await expect(page.getByText(/no plan on this account yet/i)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: /Build your stack/ })).toHaveAttribute('href', '/quiz')
  await expect(page.getByRole('link', { name: /get your basket every month/ })).toHaveAttribute('href', '/shop')
  await expect(page.getByRole('link', { name: 'Tell us what you think' })).toBeVisible()
  await expect(page.locator('[data-what-you-have]')).toHaveCount(0)

  // The hole the audit found stays shut: a plan can't be saved into an empty account.
  const res = await page.request.put('/api/hub/subscription', { data: { subscription: { id: 'free', status: 'active', lines: [], flatMonthly: 0 } } })
  expect(res.status()).toBe(409)
})

test('bought once: the order in the hub, with buy again and every month', async ({ page }) => {
  await signUpViaApi(page, real('once'))
  await openShop(page)
  await addProductToBasket(page, 'Whey Protein')
  await openBasket(page)
  await basketDrawer(page).getByRole('button', { name: /Checkout/ }).click()
  await page.waitForURL(/\/order\/confirmation/, { timeout: 30_000 })
  // The receipt offers the same, every month.
  await expect(page.getByRole('button', { name: 'Get these every month' })).toBeVisible({ timeout: 20_000 })

  await page.locator('[data-hub-ready]').click()
  await page.waitForURL(/\/myhub/)
  await expect(page.getByText(/Your order is on its way/)).toBeVisible({ timeout: 20_000 })
  const have = page.locator('[data-what-you-have]')
  await expect(have.getByText('Bought once')).toBeVisible()
  await expect(have.locator('[data-have-order]').first()).toContainText('Whey Protein')
  await expect(have.locator('[data-have-plan]')).toHaveCount(0)

  await have.getByRole('button', { name: 'Buy again' }).first().click()
  await page.waitForURL(/\/shop/)
  await expect(basketDrawer(page)).toBeVisible({ timeout: 20_000 })
  await expect(basketDrawer(page).getByText(/Whey Protein/).first()).toBeVisible()
})

test('a monthly shop basket: what’s on it, how to manage it, and adding to the next box from the shop', async ({ page }) => {
  await signUpViaApi(page, real('monthly'))
  await startMonthlyBasket(page, 'Whey Protein')

  // Arrived: said in the words of how they came in.
  await expect(page.getByText(/Your monthly basket is set up\. It comes on the \d+/)).toBeVisible({ timeout: 20_000 })
  const plan = page.locator('[data-have-plan]')
  await expect(plan.getByText('Your shop basket, every month')).toBeVisible()
  await expect(plan.getByText('Active')).toBeVisible()
  await expect(plan.locator('[data-plan-lines]')).toContainText('Whey Protein')
  await expect(plan.locator('[data-plan-lines]')).toContainText('every month')
  await expect(plan.locator('[data-next-box]')).toContainText('Next box')

  // Add a product: the plan's own sheet opens.
  await plan.getByRole('button', { name: 'Add a product' }).click()
  await expect(page.getByRole('dialog', { name: 'What would you like to add?' })).toBeVisible({ timeout: 15_000 })
  await page.keyboard.press('Escape')

  // In the shop: what's on the plan says so, and anything else can go in the next box.
  await openShop(page)
  await openProductSheet(page, 'Whey Protein')
  await expect(page.getByText('On your plan', { exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: /Get it every month/ })).toHaveCount(0)
  await openShop(page)
  await openProductSheet(page, 'Creatine Monohydrate')
  const add = page.getByRole('button', { name: /Add to your next box/ })
  await expect(add).toBeVisible({ timeout: 20_000 })
  await add.click()
  await expect(page.getByText(/Added to your box on/)).toBeVisible({ timeout: 20_000 })

  // The basket offers the next box too, never a second plan.
  await page.getByRole('button', { name: 'Add to basket' }).click()
  // On a product page the basket opens from its own "View basket".
  await page.getByText('View basket', { exact: true }).click()
  const drawer = basketDrawer(page)
  await expect(drawer).toBeVisible({ timeout: 15_000 })
  await expect(drawer.getByRole('heading', { name: 'How do you want these?' })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Every month' })).toHaveCount(0)
  await drawer.getByRole('button', { name: 'In my next box' }).click()
  await expect(drawer.getByText(/No delivery charge: it ships with your box/)).toBeVisible()
  await drawer.getByRole('button', { name: 'Add to my next box' }).click()
  await expect(drawer.getByText('In your next box')).toBeVisible({ timeout: 20_000 })

  // Back in the hub, the next box carries both extras.
  await page.goto('/myhub')
  await expect(page.locator('[data-have-plan] [data-next-box]')).toContainText(/2 of them extras you added/, { timeout: 20_000 })
})

test('setting your day re-times the guide', async ({ page }) => {
  await signUpViaApi(page, real('day'))
  await startMonthlyBasket(page, 'Creatine Monohydrate')
  const setDay = page.getByRole('button', { name: /Set your day|Change your day/ })
  await expect(setDay).toBeVisible({ timeout: 20_000 })
  await setDay.click()
  const sheet = page.getByRole('dialog', { name: 'Your day' })
  await expect(sheet).toBeVisible()
  await sheet.getByLabel('You get up at').selectOption({ label: '5:30am' })
  await sheet.getByRole('button', { name: 'Tuesday' }).click()
  await sheet.getByRole('button', { name: 'Save my day' }).click()
  await expect(sheet).toBeHidden({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Change your day' })).toBeVisible({ timeout: 15_000 })
})
