import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sheet, SheetBody, SheetFooter, SheetHeader } from '../Sheet'
import { setReducedMotion } from '@/test-utils/matchMedia'

/** The six sheets this replaces are all shaped like this. */
function TestSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <SheetHeader eyebrow="Your subscription" title="Manage CHRGD Daily Fizz" />
      <SheetBody>
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </SheetBody>
      <SheetFooter>
        <button type="button">Confirm</button>
      </SheetFooter>
    </Sheet>
  )
}

describe('Sheet', () => {
  it('announces itself as a modal dialog', () => {
    render(<TestSheet onClose={jest.fn()} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('locks the page behind it, and unlocks on the way out', () => {
    const { unmount } = render(<TestSheet onClose={jest.fn()} />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('restores the previous lock rather than clearing it, so stacked sheets behave', () => {
    // The confirm-your-change summary opens on top of the sheet that raised it.
    // Clearing `overflow` when the upper one closes would unlock the page while
    // a sheet is still open.
    document.body.style.overflow = 'hidden'
    const { unmount } = render(<TestSheet onClose={jest.fn()} />)
    unmount()
    expect(document.body.style.overflow).toBe('hidden')
    document.body.style.overflow = ''
  })

  it('moves focus into the sheet on open', async () => {
    render(<TestSheet onClose={jest.fn()} />)
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus())
  })

  it('gives focus back to whatever opened it', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          {open && <TestSheet onClose={() => setOpen(false)} />}
        </>
      )
    }
    render(<Harness />)

    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Close' }))
    // Without this, dismissing a sheet drops a keyboard user at the top of the
    // document with no idea where they are.
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('keeps Tab inside the sheet', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">Behind the sheet</button>
        <TestSheet onClose={jest.fn()} />
      </>,
    )
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus())

    // Tab off the last control and it wraps to the first, rather than escaping
    // into the page the sheet is covering.
    screen.getByRole('button', { name: 'Confirm' }).focus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()

    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus()
  })

  it('closes on Escape', async () => {
    const onClose = jest.fn()
    const user = userEvent.setup()
    render(<TestSheet onClose={onClose} />)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('closes on a backdrop tap, but not on a tap inside the panel', async () => {
    const onClose = jest.fn()
    const user = userEvent.setup()
    const { container } = render(<TestSheet onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'First action' }))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(container.ownerDocument.querySelector('.fixed.inset-0')!)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('plays the exit before it unmounts, so the sheet slides away', async () => {
    jest.useFakeTimers()
    const onClose = jest.fn()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<TestSheet onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    // Still open, now animating out.
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog').style.animation).toContain('sheet-out')

    act(() => { jest.advanceTimersByTime(200) })
    expect(onClose).toHaveBeenCalledTimes(1)
    jest.useRealTimers()
  })

  it('animates in by default', () => {
    render(<TestSheet onClose={jest.fn()} />)
    expect(screen.getByRole('dialog').style.animation).toContain('sheet-in')
  })

  it('does not animate at all when the visitor asked for less motion', async () => {
    const restore = setReducedMotion(true)
    const onClose = jest.fn()
    const user = userEvent.setup()
    render(<TestSheet onClose={onClose} />)

    await waitFor(() => expect(screen.getByRole('dialog').style.animation).toBe(''))

    // …and closing is immediate rather than waiting out an animation that is
    // never going to play.
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    restore()
  })

  it('layers above an open sheet when asked', () => {
    render(
      <Sheet onClose={jest.fn()} layer="over" label="Review your change">
        <SheetBody>Confirm?</SheetBody>
      </Sheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Review your change' })).toBeInTheDocument()
    expect(document.querySelector('.z-\\[60\\]')).not.toBeNull()
  })
})
