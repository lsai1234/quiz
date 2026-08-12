/**
 * The exit statement reads as evidence, not as an assertion.
 *
 * The screen this replaced showed three correct numbers and no working. These
 * tests are about what a member can actually check: that every box and every
 * payment is on the page, and that the two policies which reduce the bill say
 * so rather than quietly shrinking the total.
 */
import { render, screen } from '@testing-library/react'
import { ExitStatementView } from '../ExitStatement'
import type { ExitStatement } from '@/lib/recharge/exit-ledger'

function statement(over: Partial<ExitStatement> = {}): ExitStatement {
  return {
    shipments: [
      {
        orderId: 'o1',
        reference: 'CHRGD-1',
        at: '2026-01-10T00:00:00.000Z',
        items: [
          { title: 'Protein', quantity: 1, value: 36.54 },
          { title: 'Creatine', quantity: 1, value: 16.99 },
        ],
        value: 53.53,
      },
    ],
    payments: [{ orderId: 'o1', at: '2026-01-10T00:00:00.000Z', amount: 42.2 }],
    shippedTotal: 53.53,
    paidTotal: 42.2,
    rawGap: 11.33,
    cappedBy: 0,
    waived: 0,
    settlement: 11.33,
    overpayment: 0,
    ...over,
  }
}

describe('the exit statement', () => {
  it('lists every box, with what was in it', () => {
    render(<ExitStatementView statement={statement()} />)
    expect(screen.getByText(/Protein, Creatine/)).toBeInTheDocument()
    expect(screen.getAllByText('£53.53').length).toBeGreaterThan(0)
  })

  it('lists every payment', () => {
    render(<ExitStatementView statement={statement()} />)
    expect(screen.getAllByText('−£42.20').length).toBeGreaterThan(0)
  })

  it('shows the balance to settle', () => {
    render(<ExitStatementView statement={statement()} />)
    expect(screen.getByText('To settle')).toBeInTheDocument()
    expect(screen.getByText('£11.33')).toBeInTheDocument()
  })

  it('says when the cap reduced the bill, rather than just showing a smaller one', () => {
    render(<ExitStatementView statement={statement({ cappedBy: 10, settlement: 70, rawGap: 80 })} />)
    expect(screen.getByText(/Capped at what you have paid/)).toBeInTheDocument()
    expect(screen.getByText('−£10.00')).toBeInTheDocument()
  })

  it('says when the balance was waived for being small', () => {
    render(<ExitStatementView statement={statement({ waived: 2.06, settlement: 0, rawGap: 2.06 })} />)
    expect(screen.getByText(/Too small to bother with/)).toBeInTheDocument()
  })

  it('does not clutter the page with policies that did not apply', () => {
    render(<ExitStatementView statement={statement()} />)
    expect(screen.queryByText(/Capped at what you have paid/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Too small to bother with/)).not.toBeInTheDocument()
  })

  it('turns the total around when the member is in credit', () => {
    render(<ExitStatementView statement={statement({ settlement: 0, overpayment: 15.5, rawGap: -15.5 })} />)
    expect(screen.getByText('We owe you')).toBeInTheDocument()
    expect(screen.getByText('£15.50')).toBeInTheDocument()
  })
})
