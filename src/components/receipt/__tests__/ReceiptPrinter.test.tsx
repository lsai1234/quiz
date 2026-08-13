/**
 * The printer is a flourish wrapped around a document, and the document is the
 * part that matters: whatever the animation is doing, every line of the receipt
 * is in the DOM from the first render, so a screen reader — and a customer on
 * `prefers-reduced-motion` — gets the whole thing at once.
 */
import { render, screen } from '@testing-library/react'
import { ReceiptPrinter } from '../ReceiptPrinter'
import type { ReceiptData } from '@/lib/receipt/types'

function receipt(over: Partial<ReceiptData> = {}): ReceiptData {
  return {
    merchant: { name: 'getCHRGD', strapline: 'Performance supplement stacks', site: 'getchrgd.com' },
    docTitle: 'Order receipt',
    meta: [{ label: 'Order', value: 'CHRGD-4F21' }],
    shipTo: ['Sam Reed', '14 Bridge St', 'Manchester M1 1AA'],
    items: [
      { name: 'Creatine Monohydrate', qty: 1, amount: '£24.00' },
      { name: 'Whey Protein', qty: 2, amount: '£48.00', note: 'every 2 months' },
    ],
    adjustments: [{ label: 'Delivery', value: 'FREE', tone: 'saving' }],
    total: { label: 'Total paid', value: '£64.80' },
    charge: [{ label: 'Next payment', value: '13 Sep 2026' }],
    stamp: 'Payment approved',
    notes: ['Cancel any time before your next payment.'],
    reference: 'CHRGD-4F21',
    footer: 'Thank you — stay charged',
    ...over,
  }
}

describe('the receipt printer', () => {
  it('prints every line of the receipt it is given', () => {
    render(<ReceiptPrinter receipt={receipt()} />)

    expect(screen.getByText('Order receipt')).toBeInTheDocument()
    expect(screen.getByText('Creatine Monohydrate')).toBeInTheDocument()
    expect(screen.getByText('£48.00')).toBeInTheDocument()
    expect(screen.getByText('every 2 months')).toBeInTheDocument()
    expect(screen.getByText('Total paid')).toBeInTheDocument()
    expect(screen.getByText('£64.80')).toBeInTheDocument()
    expect(screen.getByText('Next payment')).toBeInTheDocument()
    expect(screen.getByText('Cancel any time before your next payment.')).toBeInTheDocument()
    expect(screen.getByText('Thank you — stay charged')).toBeInTheDocument()
  })

  it('prints the delivery address as an address, not as loose lines', () => {
    const { container } = render(<ReceiptPrinter receipt={receipt()} />)
    const address = container.querySelector('address')
    expect(address).not.toBeNull()
    expect(address).toHaveTextContent('Manchester M1 1AA')
  })

  it('prints the stamp it is given and never invents one', () => {
    render(<ReceiptPrinter receipt={receipt({ stamp: 'Demo — not charged' })} />)
    expect(screen.getByText(/Demo — not charged/)).toBeInTheDocument()
    expect(screen.queryByText(/Payment approved/)).not.toBeInTheDocument()
  })

  it('omits a section entirely rather than printing an empty one', () => {
    render(
      <ReceiptPrinter
        receipt={receipt({ stamp: null, total: null, items: [], shipTo: [], charge: [], notes: [], reference: null })}
      />,
    )
    expect(screen.queryByText(/Total paid/)).not.toBeInTheDocument()
    expect(screen.queryByText('Qty · Item')).not.toBeInTheDocument()
    expect(screen.queryByText('Deliver to')).not.toBeInTheDocument()
    // The masthead and the footer survive: an empty receipt is still a receipt.
    expect(screen.getByText('getCHRGD')).toBeInTheDocument()
  })

  it('prints the reference under its barcode, so it can be read as well as scanned', () => {
    render(<ReceiptPrinter receipt={receipt()} />)
    // Twice: once in the meta block, once under the barcode.
    expect(screen.getAllByText('CHRGD-4F21').length).toBe(2)
  })
})
