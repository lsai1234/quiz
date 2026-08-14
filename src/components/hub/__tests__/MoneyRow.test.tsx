import { render, screen } from '@testing-library/react'
import { MoneyRow } from '../MoneyRow'
import { GREEN } from '@/lib/ui/tokens'

describe('MoneyRow', () => {
  it('pairs a label with its figure', () => {
    render(<MoneyRow label="Monthly plan" value="£59.89" />)
    expect(screen.getByText('Monthly plan')).toBeInTheDocument()
    expect(screen.getByText('£59.89')).toBeInTheDocument()
  })

  it('sets figures in tabular numerals, so the column actually lines up', () => {
    // Without this, £9.99 and £11.11 are different widths and a right-aligned
    // column only looks aligned.
    render(<MoneyRow label="Total paid" value="£1,204.10" />)
    expect(screen.getByText('£1,204.10')).toHaveStyle({ fontVariantNumeric: 'tabular-nums' })
  })

  it('tones a figure that carries meaning', () => {
    render(<MoneyRow label="Credit to next payment" value="−£12.75" color={GREEN} />)
    expect(screen.getByText('−£12.75')).toHaveStyle({ color: GREEN })
  })

  it('marks the line that totals the ones above it', () => {
    render(<MoneyRow label="To settle" value="£18.40" strong />)
    expect(screen.getByText('To settle').className).toContain('font-bold')
    expect(screen.getByText('£18.40').className).toContain('font-black')
  })

  it('carries a detail line without it competing with the figure', () => {
    render(<MoneyRow label="12 Mar 2026" value="£69.55" sub="CHRGD Daily Fizz, CHRGD Omega-3" />)
    expect(screen.getByText('CHRGD Daily Fizz, CHRGD Omega-3')).toBeInTheDocument()
  })

  it('hides the leader from screen readers', () => {
    // A dotted rule is a typographic device, not content.
    const { container } = render(<MoneyRow label="Monthly" value="£59.89" />)
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})
