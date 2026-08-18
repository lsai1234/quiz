import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChargeScale } from '../ChargeScale'

describe('ChargeScale', () => {
  it('offers five points on a full check-in', () => {
    render(<ChargeScale onChange={jest.fn()} />)
    expect(screen.getAllByRole('radio')).toHaveLength(5)
  })

  it('sends the same 1/3/5 ratings the emoji faces did, on the inline scale', async () => {
    // The stack card's three faces were worth 1, 3 and 5 — not 1, 2, 3. Getting
    // this wrong would silently rescale every rating members have given.
    const onChange = jest.fn()
    const user = userEvent.setup()
    render(<ChargeScale steps={3} onChange={onChange} />)

    const options = screen.getAllByRole('radio')
    expect(options).toHaveLength(3)

    await user.click(options[0])
    expect(onChange).toHaveBeenLastCalledWith(1)
    await user.click(options[1])
    expect(onChange).toHaveBeenLastCalledWith(3)
    await user.click(options[2])
    expect(onChange).toHaveBeenLastCalledWith(5)
  })

  it('reports every point on the five-step scale', async () => {
    const onChange = jest.fn()
    const user = userEvent.setup()
    render(<ChargeScale onChange={onChange} />)

    const options = screen.getAllByRole('radio')
    for (let i = 0; i < options.length; i++) {
      await user.click(options[i])
      expect(onChange).toHaveBeenLastCalledWith(i + 1)
    }
  })

  it('names each point out of five however many are drawn', () => {
    // Three segments still describe a 1–5 scale, because that is what is stored.
    render(<ChargeScale steps={3} onChange={jest.fn()} />)
    expect(screen.getByRole('radio', { name: '1 out of 5' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '3 out of 5' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '5 out of 5' })).toBeInTheDocument()
  })

  it('marks the current rating for assistive tech', () => {
    render(<ChargeScale value={4} onChange={jest.fn()} />)
    expect(screen.getByRole('radio', { name: '4 out of 5' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '3 out of 5' })).toHaveAttribute('aria-checked', 'false')
  })

  it('groups the points and takes a name from what is being rated', () => {
    render(<ChargeScale onChange={jest.fn()} label="How is your sleep?" />)
    expect(screen.getByRole('radiogroup', { name: 'How is your sleep?' })).toBeInTheDocument()
  })

  it('anchors the ends in words, so the meter is not the only cue', () => {
    render(<ChargeScale onChange={jest.fn()} lowLabel="Not landing" highLabel="Loving it" />)
    expect(screen.getByText('Not landing')).toBeInTheDocument()
    expect(screen.getByText('Loving it')).toBeInTheDocument()
  })

  it('contains no emoji — the entire point of it', () => {
    const { container } = render(<ChargeScale onChange={jest.fn()} value={3} />)
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })
})
