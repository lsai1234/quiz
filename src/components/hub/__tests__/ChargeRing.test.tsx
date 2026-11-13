import { act, render, screen } from '@testing-library/react'
import { ChargeRing } from '../ChargeRing'

/**
 * The charge ring: the hub's picture of "this many done out of that many".
 * Decoration round the words inside it, so what it says to a screen reader,
 * and when it celebrates, are what is held here.
 */
describe('ChargeRing', () => {
  it('is one image named by its label, with the words inside it', () => {
    render(
      <ChargeRing done={1} total={3} size={156} stroke={12} label="1 of 3">
        <span>1</span>
      </ChargeRing>,
    )
    const ring = screen.getByRole('img', { name: '1 of 3' })
    expect(ring).toHaveTextContent('1')
    expect(ring).toHaveAttribute('data-full', 'false')
    // Nothing in the drawing is read out twice.
    expect(ring.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('draws a segment for each thing, up to eight, then one ring', () => {
    const three = render(<ChargeRing done={0} total={3} size={156} stroke={12} label="0 of 3" />)
    expect(three.container.querySelectorAll('.hub-charge-track')).toHaveLength(3)
    three.unmount()
    const twelve = render(<ChargeRing done={4} total={12} size={156} stroke={12} label="4 of 12" />)
    expect(twelve.container.querySelectorAll('.hub-charge-track')).toHaveLength(1)
  })

  it('lets the sparks go for a ring filled while they watched, not one that arrived full', () => {
    const full = render(<ChargeRing done={3} total={3} size={156} stroke={12} label="3 of 3" />)
    expect(screen.getByRole('img')).toHaveAttribute('data-full', 'true')
    expect(full.container.querySelector('.hub-burst')).not.toBeInTheDocument()
    full.unmount()

    const { container, rerender } = render(<ChargeRing done={2} total={3} size={156} stroke={12} label="2 of 3" />)
    expect(container.querySelector('.hub-burst')).not.toBeInTheDocument()
    act(() => rerender(<ChargeRing done={3} total={3} size={156} stroke={12} label="3 of 3" />))
    expect(screen.getByRole('img', { name: '3 of 3' })).toHaveAttribute('data-full', 'true')
    expect(container.querySelector('.hub-burst')).toBeInTheDocument()
    expect(container.querySelector('.hub-burst')).toHaveAttribute('aria-hidden', 'true')
  })

  it('copes with nothing to do', () => {
    render(<ChargeRing done={0} total={0} size={100} stroke={8} label="Nothing today" />)
    expect(screen.getByRole('img', { name: 'Nothing today' })).toBeInTheDocument()
  })
})
