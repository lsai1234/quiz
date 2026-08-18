import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChangeSummary, type PendingChange } from '../ChangeSummary'

function change(over: Partial<PendingChange> = {}): PendingChange {
  return {
    title: 'Add to your plan',
    subtitle: 'CHRGD Daily Fizz',
    monthlyBefore: 59.89,
    monthlyAfter: 71.64,
    onConfirm: jest.fn(),
    ...over,
  }
}

/**
 * The confirm-your-change sheet is the one screen every price-affecting action
 * in the hub passes through, so its two guarantees matter more than most: it
 * applies nothing until Confirm, and it sits above whichever sheet raised it.
 */
describe('ChangeSummary', () => {
  it('shows what happens to the bill before anything is applied', () => {
    const onConfirm = jest.fn()
    render(<ChangeSummary change={change({ onConfirm })} onClose={jest.fn()} />)

    expect(screen.getByRole('heading', { name: 'Add to your plan' })).toBeInTheDocument()
    expect(screen.getByText(/£59\.89 → £71\.64/)).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('applies the change and closes, in that order', async () => {
    const onConfirm = jest.fn()
    const onClose = jest.fn()
    const user = userEvent.setup()
    render(<ChangeSummary change={change({ onConfirm })} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Confirm change' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('takes the caller’s word for the confirm label', () => {
    render(<ChangeSummary change={change({ confirmLabel: 'Skip & credit' })} onClose={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Skip & credit' })).toBeInTheDocument()
  })

  it('backs out without applying anything', async () => {
    const onConfirm = jest.fn()
    const onClose = jest.fn()
    const user = userEvent.setup()
    render(<ChangeSummary change={change({ onConfirm })} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('still closes on Escape now that the sheet owns the listener', async () => {
    const onClose = jest.fn()
    const user = userEvent.setup()
    render(<ChangeSummary change={change()} onClose={onClose} />)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('layers above the sheet that raised it', () => {
    render(<ChangeSummary change={change()} onClose={jest.fn()} />)
    // Two sheets deep is the one legitimate case in the hub: a manage sheet
    // opens this to confirm what it is about to charge. Both are portalled to
    // the end of <body> at the same z-index, so the later one paints on top —
    // asserted as "it is the last dialog in the document" rather than as a
    // z-index, because the z-index is not what makes it work.
    const dialogs = document.querySelectorAll('[role="dialog"]')
    expect(dialogs.length).toBeGreaterThan(0)
    expect(dialogs[dialogs.length - 1]).toBe(screen.getByRole('dialog'))
    // And it locks scrolling while it is open, so the sheet underneath does not
    // scroll away behind it.
    expect(document.body.style.overflow).toBe('hidden')
  })
})
