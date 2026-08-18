import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../Button'
import { IconButton } from '../IconButton'
import { Card } from '../Card'
import { Chip } from '../Chip'
import { Note } from '../Note'
import { Eyebrow } from '../Eyebrow'
import { GREEN } from '@/lib/ui/tokens'

describe('Button', () => {
  it('is a button, not a submit, unless asked', () => {
    // Forty hand-rolled buttons in the hub, several of them inside forms.
    render(<Button>Skip next</Button>)
    expect(screen.getByRole('button', { name: 'Skip next' })).toHaveAttribute('type', 'button')
  })

  it('reports a press', async () => {
    const onClick = jest.fn()
    const user = userEvent.setup()
    render(<Button onClick={onClick}>Confirm change</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })

  it('ignores presses while disabled', async () => {
    const onClick = jest.fn()
    const user = userEvent.setup()
    render(<Button disabled onClick={onClick}>Review change</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('takes a focus ring — which none of the buttons it replaces had', () => {
    render(<Button>Manage</Button>)
    expect(screen.getByRole('button').className).toContain('focus-visible:ring-2')
  })

  it('clears a 44px tap target at the sizes that carry real actions', () => {
    const { rerender } = render(<Button size="md">Add to plan</Button>)
    expect(screen.getByRole('button').className).toContain('min-h-11')
    rerender(<Button size="lg">Add to plan</Button>)
    expect(screen.getByRole('button').className).toContain('min-h-13')
  })

  it('keeps its label readable when it carries a glyph', () => {
    // The icon is decorative; the accessible name must still be the words.
    render(<Button icon="plus" iconRight="arrow-right">Add product</Button>)
    expect(screen.getByRole('button', { name: 'Add product' })).toBeInTheDocument()
  })
})

describe('IconButton', () => {
  it('always has an accessible name', async () => {
    const onClick = jest.fn()
    const user = userEvent.setup()
    render(<IconButton icon="x" label="Close" onClick={onClick} />)

    const button = screen.getByRole('button', { name: 'Close' })
    await user.click(button)
    expect(onClick).toHaveBeenCalled()
  })

  it('extends a small control to a 44px target without redrawing it', () => {
    render(<IconButton icon="dash" label="Remove one" size="sm" />)
    const button = screen.getByRole('button', { name: 'Remove one' })
    expect(button.className).toContain('w-9')
    expect(button.className).toContain('hit-target')
  })
})

describe('Card', () => {
  it('renders its content', () => {
    render(<Card>Next charge</Card>)
    expect(screen.getByText('Next charge')).toBeInTheDocument()
  })

  it('recedes by default rather than painting another grey box', () => {
    const { container } = render(<Card>Anything</Card>)
    // Alpha over the page background, not an opaque surface — the difference
    // between a stack of planes and a wall of identical boxes.
    expect((container.firstChild as HTMLElement).style.background).toContain('rgba(255, 255, 255, 0.015)')
  })

  it('tints itself when it carries a consequence', () => {
    const { container } = render(<Card variant="tone" tone={GREEN}>We owe you £4.20</Card>)
    // jsdom normalises the hex to rgb() on the way into the style attribute.
    const style = (container.firstChild as HTMLElement).style
    expect(style.background).toContain('rgb(52, 211, 153)')
    expect(style.border).toContain('rgb(52, 211, 153)')
  })

  it('can label itself', () => {
    render(<Card eyebrow="How you're billed">£69.55</Card>)
    expect(screen.getByText("How you're billed")).toBeInTheDocument()
  })

  it('is a section when it is one', () => {
    render(<Card as="section" eyebrow="Why this stack">Because you said so</Card>)
    expect(screen.getByText('Because you said so').closest('section')).not.toBeNull()
  })
})

describe('Chip', () => {
  it('renders a status with a drawn glyph, never a character', () => {
    const { container } = render(<Chip icon="alert-triangle" color={GREEN}>Felt &amp; working</Chip>)
    expect(screen.getByText(/felt & working/i)).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })
})

describe('Note', () => {
  it('reads as an aside, not an alert, by default', () => {
    render(<Note>No payment was taken.</Note>)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('No payment was taken.')).toBeInTheDocument()
  })

  it('announces itself only when it answers something the member just did', () => {
    render(<Note live>That sign-in didn’t complete.</Note>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('Eyebrow', () => {
  it('renders a caps label', () => {
    render(<Eyebrow>Your stack</Eyebrow>)
    expect(screen.getByText('Your stack').className).toContain('uppercase')
  })
})
