import { render, screen } from '@testing-library/react'
import { Icon, ICON_NAMES, iconName } from '../Icon'

describe('Icon', () => {
  it('draws every glyph in the set', () => {
    // A glyph that renders nothing is worse than a missing one — it leaves a
    // hole where a member expected a cue, and nothing fails.
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />)
      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg!.children.length).toBeGreaterThan(0)
      unmount()
    }
  })

  it('holds every glyph to the same construction rules', () => {
    // The single stroke weight is what makes a set of 60 drawings look like one
    // set. Colour comes from the parent, so a glyph works in muted text, in an
    // accent badge and on a tinted card without a second copy.
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />)
      const svg = container.querySelector('svg')!
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
      expect(svg.getAttribute('fill')).toBe('none')
      expect(svg.getAttribute('stroke')).toBe('currentColor')
      expect(svg.getAttribute('stroke-width')).toBe('1.6')
      unmount()
    }
  })

  it('hides itself from screen readers unless it is given a name', () => {
    const { container, rerender } = render(<Icon name="check" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

    rerender(<Icon name="check" label="Done" />)
    expect(screen.getByRole('img', { name: 'Done' })).toBeInTheDocument()
  })

  it('scales from a badge to a product tile', () => {
    const { container } = render(<Icon name="bolt" size={40} />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('width', '40')
    expect(svg).toHaveAttribute('height', '40')
  })

  describe('iconName', () => {
    it('passes through a name the set knows', () => {
      expect(iconName('droplet')).toBe('droplet')
    })

    it('falls back to a designed placeholder rather than rendering nothing', () => {
      // Slot visuals, quiz options and catalogue rows all arrive as plain
      // strings from data we do not control at the type level.
      expect(iconName('not-a-glyph')).toBe('hexagon')
      expect(iconName(null)).toBe('hexagon')
      expect(iconName(undefined)).toBe('hexagon')
      expect(iconName('', 'sparkle')).toBe('sparkle')
    })
  })

  it('carries the interface glyphs that replace typed characters', () => {
    // ✕ ▲ ▼ + − ← → were being printed as text in the hub. Each needs a drawn
    // equivalent before Phase 1 can delete them.
    for (const name of ['x', 'chevron-down', 'plus', 'dash', 'arrow-left', 'arrow-right', 'check'] as const) {
      expect(ICON_NAMES).toContain(name)
    }
  })
})
