import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { TickRow } from '../TickRow'

/**
 * `TickRow`: one thing, done or not, as a row you tap anywhere to tick. The
 * member hub's Today is built from these, so what a screen reader hears and
 * when the tick celebrates are held here.
 */
function Row({ start = false }: { start?: boolean }) {
  const [done, setDone] = useState(start)
  return <TickRow label="Whey Protein" sub="1 serving" done={done} name={done ? 'Mark Whey Protein as not taken' : 'Mark Whey Protein as taken'} onClick={() => setDone((d) => !d)} />
}

describe('TickRow', () => {
  it('is one toggle button, named for what pressing does', async () => {
    render(<Row />)
    const row = screen.getByRole('button', { name: 'Mark Whey Protein as taken' })
    expect(row).toHaveAttribute('type', 'button')
    expect(row).toHaveAttribute('aria-pressed', 'false')
    // The words on screen are the product and the amount, in the same control.
    expect(row).toHaveTextContent('Whey Protein')
    expect(row).toHaveTextContent('1 serving')

    await userEvent.click(row)
    expect(screen.getByRole('button', { name: 'Mark Whey Protein as not taken' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('falls back to its visible words when no name is given', () => {
    render(<TickRow label="Stretch" done={false} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Stretch' })).toBeInTheDocument()
  })

  it('celebrates a tick just made, not one that was already there', async () => {
    const { container } = render(<Row start />)
    const mark = () => container.querySelector('.system-tick')!
    // Already done on arrival: filled, but no pop.
    expect(mark()).toHaveAttribute('data-done', 'true')
    expect(mark()).toHaveAttribute('data-fresh', 'false')

    await userEvent.click(screen.getByRole('button'))
    expect(mark()).toHaveAttribute('data-done', 'false')
    await userEvent.click(screen.getByRole('button'))
    expect(mark()).toHaveAttribute('data-done', 'true')
    expect(mark()).toHaveAttribute('data-fresh', 'true')
  })

  it('keeps the mark out of the accessible name', () => {
    const { container } = render(<Row />)
    expect(container.querySelector('.system-tick')).toHaveAttribute('aria-hidden', 'true')
  })
})
