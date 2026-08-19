import { render, screen, waitFor } from '@testing-library/react'
import { CardBuilding } from '../CardBuilding'

/**
 * The wait, as something to watch.
 *
 * The meter is the only part of this that could lie, so that is what is pinned:
 * it is an activity indicator paced from measured render times, not a report
 * from the server, and the one promise it has to keep is that it never reaches
 * the end before the image has.
 */
const meter = () => document.querySelector('.card-build-meter') as HTMLElement | null

describe('the card skeleton', () => {
  it('never fills while the render is still going', async () => {
    render(<CardBuilding />)

    expect(screen.getByRole('status')).toHaveTextContent(/building your card/i)
    expect(parseFloat(meter()!.style.width)).toBeGreaterThan(0)

    // Past the point where a fast render would have landed, and still short of
    // the end — the ceiling is what makes it an activity indicator rather than
    // a promise.
    await waitFor(() => expect(parseFloat(meter()!.style.width)).toBeGreaterThan(20), { timeout: 2000 })
    expect(parseFloat(meter()!.style.width)).toBeLessThan(100)
  })

  it('finishes only once the card has landed', () => {
    render(<CardBuilding complete />)

    expect(meter()!.style.width).toBe('100%')
    expect(screen.getByRole('status')).toHaveTextContent(/^ready$/i)
  })

  it('moves through the stages of the render as it goes', async () => {
    render(<CardBuilding />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/building your card/i)
    await waitFor(() => expect(status).toHaveTextContent(/setting the type/i), { timeout: 2000 })
  })

  it('says what is happening to a reader, and keeps the bars out of it', () => {
    render(<CardBuilding />)

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    expect(document.querySelector('.card-build-sheen')?.closest('[aria-hidden="true"]')).toBeInTheDocument()
  })
})
