import {
  orderItemUpdate,
  priceChangeNotice,
  productRemoved,
  productSubstituted,
  termsUpdated,
  exitReceipt,
  exitChargeFailed,
  exitScheduled,
  type RemovedContext,
  type SubstitutedContext,
} from '@/lib/notify/templates'
import { ALLERGEN_CHECK_SENTENCE } from '@/lib/legal/content'
import type { RenderedEmail } from '@/lib/notify/types'

/** Both renderings, so an assertion can't pass in HTML and fail in plain text. */
const bodies = (email: RenderedEmail) => [email.text, email.html]

function substituted(over: Partial<SubstitutedContext> = {}): RenderedEmail {
  return productSubstituted({
    productTitle: 'Gold Standard Whey',
    replacementTitle: 'Impact Whey Isolate',
    discontinued: false,
    monthlyBefore: 60.05,
    monthlyAfter: 60.05,
    effectiveFrom: '2026-08-15T00:00:00.000Z',
    changeUrl: 'https://chrgd.dev/myhub?change=line-1',
    ...over,
  })
}

function removed(over: Partial<RemovedContext> = {}): RenderedEmail {
  return productRemoved({
    productTitle: 'Gold Standard Whey',
    reason: 'member-choice',
    discontinued: false,
    monthlyBefore: 60.05,
    monthlyAfter: 30.31,
    effectiveFrom: '2026-08-15T00:00:00.000Z',
    addUrl: 'https://chrgd.dev/myhub?add=protein-whey',
    ...over,
  })
}

describe('product-substituted', () => {
  it('carries the allergen sentence verbatim — a different product needs a different label read', () => {
    for (const body of bodies(substituted())) {
      expect(body).toContain(ALLERGEN_CHECK_SENTENCE)
    }
  })

  it('names both products and why the swap happened', () => {
    expect(substituted().subject).toContain('Gold Standard Whey')
    expect(substituted().text).toContain('Impact Whey Isolate')
    expect(substituted().text).toMatch(/out of stock/i)
    expect(substituted({ discontinued: true }).text).toMatch(/discontinued/i)
  })

  it('says the monthly is unchanged when it is', () => {
    expect(substituted().text).toContain('Your monthly stays exactly the same at £60.05')
  })

  it('states the new figure and date when the swap is cheaper', () => {
    const email = substituted({ monthlyAfter: 55.5 })
    expect(email.text).toContain('drops from £60.05 to £55.50')
    expect(email.text).toContain('15 August 2026')
  })

  it('links into the swap flow for that line, not the hub front door', () => {
    for (const body of bodies(substituted())) {
      expect(body).toContain('https://chrgd.dev/myhub?change=line-1')
    }
  })

  it('makes clear no action is needed', () => {
    expect(substituted().text).toMatch(/don't need to do anything/i)
  })
})

describe('product-removed', () => {
  it('states the new monthly and when it starts', () => {
    expect(removed().text).toContain('drops from £60.05 to £30.31')
    expect(removed().text).toContain('15 August 2026')
  })

  it('gives the real reason rather than a vague one', () => {
    expect(removed({ reason: 'member-choice' }).text).toMatch(/you asked us to take things off/i)
    expect(removed({ reason: 'nothing-available' }).text).toMatch(/nothing else in that category available/i)
  })

  it('is honest when a swap was wanted but nothing was safe', () => {
    // Someone who opted into swaps and didn't get one is owed the actual reason.
    const email = removed({ reason: 'nothing-suitable' })
    expect(email.text).toMatch(/dietary requirements you told us about/i)
    expect(email.text).toMatch(/might not suit you/i)
  })

  it('explains a credit rather than leaving it to show up on a statement', () => {
    const email = removed({ credit: 45 })
    expect(email.text).toContain('£45.00')
    expect(email.text).toMatch(/don't charge for anything we couldn't send/i)
  })

  it('omits the credit paragraph when there is nothing owed', () => {
    expect(removed().text).not.toMatch(/credited against your next payment/i)
  })

  it('links into the add flow for that category, with suggestions when we have them', () => {
    const email = removed({ suggestions: ['Impact Whey', 'Clear Whey', 'Vegan Protein'] })
    expect(email.text).toContain('https://chrgd.dev/myhub?add=protein-whey')
    expect(email.text).toContain('Impact Whey, Clear Whey, Vegan Protein')
  })

  it('still invites them back when we have nothing to suggest', () => {
    expect(removed().text).toMatch(/add something in its place whenever you like/i)
  })
})

describe('price-change-notice', () => {
  it('states old, new, when, and the free way out', () => {
    const email = priceChangeNotice({
      productTitle: 'Creatine',
      monthlyBefore: 60.05,
      monthlyAfter: 63.2,
      effectiveFrom: '2026-09-15T00:00:00.000Z',
      noticeDays: 30,
      hubUrl: 'https://chrgd.dev/myhub',
    })

    expect(email.subject).toContain('£63.20')
    expect(email.text).toContain('from £60.05 to £63.20')
    expect(email.text).toContain('15 September 2026')
    expect(email.text).toContain('30 days ahead')
    expect(email.text).toMatch(/cancel free of charge/i)
    // The clause that makes the notice meaningful rather than decorative.
    expect(email.text).toMatch(/inside a minimum term/i)
  })
})

describe('terms-updated', () => {
  it('says what changed and reassures on price', () => {
    const email = termsUpdated({
      summary: 'We clarified how substitutions work.',
      effectiveFrom: '2026-09-01T00:00:00.000Z',
      termsUrl: 'https://chrgd.dev/legal/terms',
    })
    expect(email.text).toContain('We clarified how substitutions work.')
    expect(email.text).toMatch(/price are unchanged/i)
  })
})

describe('leaving', () => {
  it('leads a receipt with the two totals, because the balance only means anything between them', () => {
    const email = exitReceipt({ settlement: 11.33, shippedTotal: 66.27, paidTotal: 54.94, shopUrl: 'u' })
    expect(email.text).toContain('£66.27')
    expect(email.text).toContain('£54.94')
    expect(email.text).toContain('£11.33')
    expect(email.text).toContain('yours to keep')
  })

  it('gives the member’s own reason when nothing was charged', () => {
    const email = exitReceipt({
      settlement: 0,
      shippedTotal: 66.27,
      paidTotal: 54.94,
      waiverExplanation: 'You are within 14 days of your first delivery.',
      shopUrl: 'u',
    })
    expect(email.text).toContain('within 14 days')
    // Not a bare zero, and not a demand.
    expect(email.subject).not.toMatch(/pay|owe/i)
  })

  it('tells someone in credit that it is coming back', () => {
    const email = exitReceipt({ settlement: 0, shippedTotal: 20, paidTotal: 60, overpayment: 40, shopUrl: 'u' })
    expect(email.text).toContain('£40.00')
    expect(email.text).toContain('back to your card')
  })

  it('opens the failed-charge email by confirming the cancellation went through', () => {
    // The member's actual worry on seeing "payment" and "ended" together is
    // whether they are still subscribed. Answer that first.
    const email = exitChargeFailed({ settlement: 11.33, invoiceUrl: 'u' })
    const firstLine = email.text.split('\n').find((l) => l.trim().length > 20) ?? ''
    expect(firstLine).toMatch(/cancelled|ended/i)
  })

  it('is unambiguous that a scheduled exit changes nothing in the meantime', () => {
    // A member who believes they have stopped and then sees a payment reads it
    // as a mistake, however clearly the screen explained it at the time.
    const email = exitScheduled({ monthsAway: 2, monthly: 54.94, hubUrl: 'u' })
    expect(email.text).toContain('carries on')
    expect(email.text).toContain('£54.94')
    expect(email.text).toContain('nothing to settle')
  })
})

describe('every template', () => {
  const all = [substituted(), removed(), priceChangeNotice({
    productTitle: 'X', monthlyBefore: 1, monthlyAfter: 2, effectiveFrom: '2026-09-15T00:00:00.000Z', noticeDays: 30, hubUrl: 'u',
  }), termsUpdated({ summary: 's', effectiveFrom: '2026-09-01T00:00:00.000Z', termsUrl: 'u' }),
    exitReceipt({ settlement: 5, shippedTotal: 10, paidTotal: 5, shopUrl: 'u' }),
    exitChargeFailed({ settlement: 5, invoiceUrl: 'u' }),
    exitScheduled({ monthsAway: 2, monthly: 20, hubUrl: 'u' })]

  it('renders a subject and both bodies', () => {
    for (const email of all) {
      expect(email.subject.length).toBeGreaterThan(0)
      expect(email.text.length).toBeGreaterThan(0)
      expect(email.html).toContain('<div')
    }
  })

  it('escapes interpolated content — product titles are data, not markup', () => {
    const email = substituted({ replacementTitle: '<script>alert(1)</script>' })
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })
})

describe('orderItemUpdate — an item that sold out after they paid', () => {
  const base = { reference: 'CHRGD-9GPNM1DN', firstName: 'Charlie', productTitle: 'Vitamin D3 + K2', accountUrl: null }

  it('removed: says what came off, what was refunded, and that the rest is coming', () => {
    const email = orderItemUpdate({ ...base, kind: 'removed', refund: 8.27, restOnItsWay: true })
    expect(email.subject).toBe('An update on your order CHRGD-9GPNM1DN')
    expect(email.text).toMatch(/Vitamin D3 \+ K2 sold out at our supplier/)
    expect(email.text).toMatch(/refunded £8\.27/)
    expect(email.text).toMatch(/Everything else in your order is on its way/)
  })

  it('swapped: names both products, carries the allergen check, and offers a refund by reply', () => {
    const email = orderItemUpdate({ ...base, kind: 'swapped', replacementTitle: 'Vegan D3', refund: 0.77, restOnItsWay: true })
    expect(email.text).toMatch(/we've sent Vegan D3 in its place/)
    expect(email.text).toMatch(/It costs a little less, so we've refunded £0\.77/)
    expect(email.text).toContain(ALLERGEN_CHECK_SENTENCE)
    expect(email.text).toMatch(/Reply to this email and we'll refund it/)
  })

  it('back-ordered: the rest now, this later, at no cost — or the whole order waits', () => {
    expect(orderItemUpdate({ ...base, kind: 'backordered', restOnItsWay: true }).text).toMatch(
      /sent the rest of your order now and Vitamin D3 \+ K2 will follow separately/,
    )
    const waits = orderItemUpdate({ ...base, kind: 'backordered', restOnItsWay: false })
    expect(waits.subject).toBe('Vitamin D3 + K2 will follow shortly — CHRGD-9GPNM1DN')
    expect(waits.text).toMatch(/your order will go out as soon as it's back/)
  })
})
