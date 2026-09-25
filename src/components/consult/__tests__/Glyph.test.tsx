import { render } from '@testing-library/react'
import { Glyph, GLYPH_NAMES } from '../Glyph'

describe('the consult glyph set', () => {
  it.each(GLYPH_NAMES)('draws %s on the 24-unit grid', (name) => {
    const { container } = render(<Glyph name={name} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.children.length).toBeGreaterThan(0)
  })

  it.each([16, 24, 48])('renders at %ipx', (size) => {
    const { container } = render(<Glyph name="bolt" size={size} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe(String(size))
    expect(svg.getAttribute('height')).toBe(String(size))
  })

  it('keeps circles and rects a stroke-width inside the grid, so nothing clips', () => {
    // A 2-unit stroke centred on the outline needs one unit of room on each side.
    for (const name of GLYPH_NAMES) {
      const { container, unmount } = render(<Glyph name={name} />)
      for (const c of container.querySelectorAll('circle')) {
        const [cx, cy, r] = ['cx', 'cy', 'r'].map((a) => Number(c.getAttribute(a)))
        expect(Math.min(cx - r, cy - r)).toBeGreaterThanOrEqual(1)
        expect(Math.max(cx + r, cy + r)).toBeLessThanOrEqual(23)
      }
      for (const b of container.querySelectorAll('rect')) {
        const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => Number(b.getAttribute(a)))
        expect(Math.min(x, y)).toBeGreaterThanOrEqual(1)
        expect(Math.max(x + w, y + h)).toBeLessThanOrEqual(23)
      }
      unmount()
    }
  })

  it('is decorative unless given a name', () => {
    const { container, rerender, getByRole } = render(<Glyph name="sun" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    rerender(<Glyph name="sun" title="Daylight" />)
    expect(getByRole('img', { name: 'Daylight' })).toBeInTheDocument()
  })

  it('paints in the colour of whatever holds it', () => {
    const { container } = render(<Glyph name="gym" />)
    expect(container.querySelector('svg')).toHaveAttribute('stroke', 'currentColor')
  })
})
