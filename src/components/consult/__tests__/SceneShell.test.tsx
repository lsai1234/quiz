import { fireEvent, render, screen } from '@testing-library/react'
import { SceneShell } from '../SceneShell'
import { ConsultRoot } from '../ConsultRoot'
import { NextButton } from '../controls'

const meter = [
  { id: 'you', label: 'You', fill: 1 },
  { id: 'move', label: 'Move', fill: 0.5 },
]

function renderShell(extra: Partial<Parameters<typeof SceneShell>[0]> = {}) {
  return render(
    <ConsultRoot>
      <SceneShell
        index={4}
        total={12}
        sectionLabel="Training"
        meter={meter}
        currentSectionId="move"
        question="Map your training week"
        hint="Tap a day to cycle."
        reaction="Four a week, solid."
        action={<NextButton />}
        {...extra}
      >
        <p>the interaction</p>
      </SceneShell>
    </ConsultRoot>,
  )
}

describe('SceneShell', () => {
  it('puts the question in one heading, with the hint and reaction around it', () => {
    renderShell()
    expect(screen.getByRole('heading', { level: 1, name: 'Map your training week' })).toBeInTheDocument()
    expect(screen.getByText('Tap a day to cycle.')).toBeInTheDocument()
    expect(screen.getByText('Four a week, solid.')).toBeInTheDocument()
    expect(screen.getByText('the interaction')).toBeInTheDocument()
  })

  it('shows where you are in the data line', () => {
    renderShell()
    expect(screen.getByText(/4\/12 · Training/)).toBeInTheDocument()
  })

  it('offers Back only when there is somewhere to go', () => {
    const onBack = jest.fn()
    const { unmount } = renderShell({ onBack })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
    unmount()
    renderShell()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('carries the action at the foot', () => {
    renderShell()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })

  it('lets the heading take focus for a scene change', () => {
    renderShell({ headingId: 'q' })
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveAttribute('tabindex', '-1')
    heading.focus()
    expect(document.activeElement).toBe(heading)
  })
})

describe('ConsultRoot', () => {
  it('scopes the token set and reports its modes', () => {
    const { container } = render(
      <ConsultRoot mode="calm" comfort>
        <p>x</p>
      </ConsultRoot>,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveClass('amp-consult')
    expect(root).toHaveAttribute('data-mode', 'calm')
    expect(root).toHaveAttribute('data-comfort', 'true')
    expect(root.style.getPropertyValue('--amp-duration-scene')).toMatch(/ms$/)
  })
})
