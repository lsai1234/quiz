/**
 * The printed receipt, rendered for an email client.
 *
 * The assertions that matter here are about email clients rather than about
 * wording: an email that renders beautifully in a browser and collapses in
 * Outlook is a receipt most of the customers who receive it cannot read.
 */
import { receiptEmailHtml, receiptText } from '@/lib/notify/receipt-email'
import type { ReceiptData } from '@/lib/receipt/types'

function receipt(over: Partial<ReceiptData> = {}): ReceiptData {
  return {
    merchant: { name: 'getCHRGD', strapline: 'Performance supplement stacks', site: 'getchrgd.co.uk' },
    docTitle: 'Order receipt',
    meta: [
      { label: 'Order', value: 'CHRGD-7K4M2XQP' },
      { label: 'Date', value: '14 Aug 2026' },
    ],
    shipTo: ['Lewis Siara', '12 Example Street', 'Manchester M1 1AA'],
    items: [
      { name: 'Gold Standard Whey', qty: 1, amount: '£48.00' },
      { name: 'Creatine Monohydrate', qty: 2, amount: '£24.00' },
    ],
    adjustments: [
      { label: 'Subtotal', value: '£72.00' },
      { label: 'Delivery', value: 'FREE', tone: 'saving' },
    ],
    total: { label: 'Total paid', value: '£72.00' },
    charge: [],
    stamp: 'Payment approved',
    notes: ['Expected 17 Aug 2026 – 19 Aug 2026.'],
    reference: 'CHRGD-7K4M2XQP',
    footer: 'Thank you — stay charged',
    ...over,
  }
}

describe('the HTML rendering', () => {
  it('lays out in tables, because Outlook renders through Word', () => {
    const html = receiptEmailHtml(receipt())
    expect(html).toContain('<table')
    // Flex and grid are silently dropped by the Word engine, which would leave
    // every label and value stacked in one column.
    expect(html).not.toMatch(/display\s*:\s*(flex|grid)/)
  })

  it('carries its styling inline, because Gmail strips style blocks', () => {
    const html = receiptEmailHtml(receipt())
    expect(html).not.toContain('<style')
    expect(html).not.toContain('class=')
  })

  it('loads nothing from anywhere — most clients block remote images by default', () => {
    const html = receiptEmailHtml(receipt())
    expect(html).not.toContain('<img')
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('prints every figure the paper receipt prints', () => {
    const html = receiptEmailHtml(receipt())
    for (const expected of ['CHRGD-7K4M2XQP', 'Gold Standard Whey', '£48.00', 'Total paid', '£72.00', 'Payment approved']) {
      expect(html).toContain(expected)
    }
  })

  it('escapes product names — they are supplier data, not markup', () => {
    const html = receiptEmailHtml(receipt({ items: [{ name: '<script>alert(1)</script>', qty: 1, amount: '£1.00' }] }))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('drops the amount column when a plan prices flatly', () => {
    // A monthly plan's lines are a delivery schedule. An "Amount" heading over
    // nothing invites the reader to add up a column that does not exist.
    const html = receiptEmailHtml(
      receipt({ items: [{ name: 'Creatine', qty: 1, amount: null, note: 'every 2 months' }] }),
    )
    expect(html).not.toContain('Amount')
    expect(html).toContain('every 2 months')
  })

  it('omits blocks a receipt does not have rather than printing empty headings', () => {
    const html = receiptEmailHtml(receipt({ shipTo: [], stamp: null, reference: null, notes: [] }))
    expect(html).not.toContain('Deliver to')
    expect(html).not.toContain('Payment approved')
  })
})

describe('the plain-text rendering', () => {
  it('exists in full, because some clients show nothing else', () => {
    const text = receiptText(receipt())
    for (const expected of ['getCHRGD', 'ORDER RECEIPT', 'CHRGD-7K4M2XQP', 'Gold Standard Whey', '£48.00', '£72.00']) {
      expect(text).toContain(expected)
    }
  })

  it('lays the figures out in a column that can be scanned', () => {
    // A receipt is the email people forward to an accountant. Dot leaders and a
    // fixed width are what make that readable in a monospaced client.
    const text = receiptText(receipt())
    const totalLine = text.split('\n').find((l) => l.includes('TOTAL PAID')) ?? ''
    expect(totalLine).toMatch(/TOTAL PAID \.+ £72\.00/)
    expect(text).toContain('='.repeat(40))
  })

  it('keeps the stamp, so a text-only reader still sees the payment was approved', () => {
    expect(receiptText(receipt())).toContain('* PAYMENT APPROVED *')
  })

  it('never claims an approval the builder did not give it', () => {
    const text = receiptText(receipt({ stamp: null }))
    expect(text).not.toMatch(/approved/i)
  })
})
