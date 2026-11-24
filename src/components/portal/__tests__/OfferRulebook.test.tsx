import { render, screen, within } from '@testing-library/react'
import { OfferRulebook } from '../OfferRulebook'
import { BUY_CHANNELS, CHANNEL_LABEL, OFFER_RULES } from '@/lib/offer/rulebook'

/** Settings → Offer's table: every offer against every way to buy, said in words, not only ticks. */
it('lists every offer against every way to buy, with its switch and its note', () => {
  render(<OfferRulebook />)
  const table = screen.getByRole('table')
  for (const c of BUY_CHANNELS) expect(within(table).getByRole('columnheader', { name: CHANNEL_LABEL[c] })).toBeInTheDocument()
  for (const rule of OFFER_RULES) {
    const row = within(table).getByRole('rowheader', { name: new RegExp(rule.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).closest('tr')!
    const cells = within(row as HTMLElement).getAllByRole('cell')
    expect(cells.map((c) => c.textContent?.trim())).toEqual(BUY_CHANNELS.map((c) => (rule.channels[c] ? 'Yes' : 'No')))
  }
  // A switch is named where an offer needs one.
  expect(screen.getByText(/Needs Settings → Offer → free bonus/)).toBeInTheDocument()
})
