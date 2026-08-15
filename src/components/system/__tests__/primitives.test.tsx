import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Card } from '../Card'
import { Input } from '../Input'
import { Modal, ModalBody, ModalFooter, ModalHeader } from '../Modal'
import { Select } from '../Select'
import { Tabs } from '../Tabs'

/**
 * The behaviour the primitives promise.
 *
 * Everything asserted here is something the 151 hand-rolled buttons and 79
 * hand-rolled inputs across the three hubs get wrong somewhere: a button that
 * submits a form it was only meant to sit in, an input whose label is a `<p>`,
 * an error message with no `aria-describedby`, a dialog a keyboard user can Tab
 * straight out of. Centralising the components only fixes those once; the tests
 * are what keep them fixed.
 */

describe('Button', () => {
  it('is a button, not a submit, unless asked', () => {
    render(<Button>Approve</Button>)
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute('type', 'button')
  })

  it('reports a press', async () => {
    const onClick = jest.fn()
    const user = userEvent.setup()
    render(<Button onClick={onClick}>Send</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })

  it('ignores presses while disabled', async () => {
    const onClick = jest.fn()
    const user = userEvent.setup()
    render(
      <Button disabled onClick={onClick}>
        Send
      </Button>,
    )
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('blocks presses while loading, without the caller disabling it', async () => {
    // The bug this prevents: a save handler that fires twice because the button
    // stayed live for the second between the click and the state update.
    const onClick = jest.fn()
    const user = userEvent.setup()
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    )
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('says it is busy while loading', () => {
    render(<Button loading>Saving</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps its label while loading, so the button does not resize', () => {
    render(<Button loading>Saving your change</Button>)
    expect(screen.getByRole('button', { name: 'Saving your change' })).toBeInTheDocument()
  })

  it('takes a focus ring — which almost none of the buttons it replaces had', () => {
    render(<Button>Manage</Button>)
    expect(screen.getByRole('button').className).toContain('focus-visible:ring-2')
  })
})

describe('Input', () => {
  it('labels the field, so tapping the label focuses it', async () => {
    const user = userEvent.setup()
    render(<Input label="Supplier SKU" />)
    await user.click(screen.getByText('Supplier SKU'))
    expect(screen.getByLabelText('Supplier SKU')).toHaveFocus()
  })

  it('describes the field with its hint', () => {
    render(<Input label="List price" hint="Excluding VAT." />)
    expect(screen.getByLabelText('List price')).toHaveAccessibleDescription('Excluding VAT.')
  })

  it('marks the field invalid and announces why', () => {
    render(<Input label="Contact email" error="That does not look like an email address." />)
    const field = screen.getByLabelText('Contact email')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription('That does not look like an email address.')
  })

  it('shows the error instead of the hint, rather than both', () => {
    render(<Input label="Contact email" hint="We only use this for receipts." error="Required." />)
    expect(screen.queryByText('We only use this for receipts.')).not.toBeInTheDocument()
  })

  it('keeps the field labelled when it carries a unit', () => {
    // The prefix moves the box onto a wrapper; the label has to stay wired to
    // the input inside it, not to the wrapper.
    render(<Input label="List price" prefix="£" />)
    expect(screen.getByLabelText('List price').tagName).toBe('INPUT')
  })

  it('hides the unit from screen readers, which the label already covers', () => {
    render(<Input label="Commission" suffix="%" />)
    expect(screen.getByText('%')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Select', () => {
  it('labels the control', () => {
    render(
      <Select label="Delivery cadence">
        <option value="1">Every month</option>
      </Select>,
    )
    expect(screen.getByLabelText('Delivery cadence')).toBeInTheDocument()
  })

  it('reports a change', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(
      <Select label="Status" onChange={onChange} defaultValue="live">
        <option value="live">Live</option>
        <option value="paused">Paused</option>
      </Select>,
    )
    await user.selectOptions(screen.getByLabelText('Status'), 'paused')
    expect(onChange).toHaveBeenCalled()
  })
})

describe('Badge', () => {
  it('renders its label as text, not as a picture of one', () => {
    render(<Badge tone="positive">Paid</Badge>)
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('keeps the dot out of the accessible name', () => {
    render(<Badge tone="positive" dot>Live</Badge>)
    expect(screen.getByText('Live').textContent).toBe('Live')
  })
})

describe('Card', () => {
  it('renders as the element it is', () => {
    render(<Card as="section">Billing</Card>)
    expect(screen.getByText('Billing').tagName).toBe('SECTION')
  })
})

describe('Tabs', () => {
  const TABS = [
    { id: 'orders', label: 'Orders', content: <p>Order list</p> },
    { id: 'exits', label: 'Exits', content: <p>Exit list</p> },
    { id: 'payouts', label: 'Payouts', content: <p>Payout list</p> },
  ]

  it('is a tablist, which the bottom-border rows it replaces were not', () => {
    render(<Tabs label="Commerce" tabs={TABS} />)
    expect(screen.getByRole('tablist', { name: 'Commerce' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('selects the first tab and shows only its panel', () => {
    render(<Tabs label="Commerce" tabs={TABS} />)
    expect(screen.getByRole('tab', { name: 'Orders' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Order list')).toBeVisible()
    expect(screen.getByText('Exit list')).not.toBeVisible()
  })

  it('keeps one tab in the tab order, not all of them', () => {
    // Roving tabindex. Without it, Tab walks through every tab in the strip
    // before reaching the panel — eight tabs is eight presses.
    render(<Tabs label="Commerce" tabs={TABS} />)
    const inOrder = screen.getAllByRole('tab').filter((t) => t.getAttribute('tabindex') === '0')
    expect(inOrder).toHaveLength(1)
  })

  it('moves with the arrow keys, and wraps', async () => {
    const user = userEvent.setup()
    render(<Tabs label="Commerce" tabs={TABS} />)
    screen.getByRole('tab', { name: 'Orders' }).focus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Exits' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Payouts' })).toHaveAttribute('aria-selected', 'true')
  })

  it('jumps to the ends with Home and End', async () => {
    const user = userEvent.setup()
    render(<Tabs label="Commerce" tabs={TABS} />)
    screen.getByRole('tab', { name: 'Orders' }).focus()

    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Payouts' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Orders' })).toHaveAttribute('aria-selected', 'true')
  })

  it('skips a disabled tab when arrowing past it', async () => {
    const user = userEvent.setup()
    render(
      <Tabs
        label="Commerce"
        tabs={[TABS[0], { id: 'gone', label: 'Retired', disabled: true }, TABS[1]]}
      />,
    )
    screen.getByRole('tab', { name: 'Orders' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Exits' })).toHaveAttribute('aria-selected', 'true')
  })

  it('can be driven from outside', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Tabs label="Commerce" tabs={TABS} value="exits" onChange={onChange} />)

    await user.click(screen.getByRole('tab', { name: 'Payouts' }))
    expect(onChange).toHaveBeenCalledWith('payouts')
    // Controlled: the parent decides, so nothing moved on its own.
    expect(screen.getByRole('tab', { name: 'Exits' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('Modal', () => {
  function Harness({ onClose = jest.fn() }: { onClose?: () => void }) {
    return (
      <Modal onClose={onClose}>
        <ModalHeader title="Change the delivery date" subtitle="Next order only." />
        <ModalBody>
          <Input label="New date" />
        </ModalBody>
        <ModalFooter>
          <Button variant="primary">Save</Button>
        </ModalFooter>
      </Modal>
    )
  }

  it('is a modal dialog, labelled by its heading', () => {
    render(<Harness />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('heading', { name: 'Change the delivery date' })).toBeInTheDocument()
  })

  it('moves focus into the panel on open', () => {
    render(<Harness />)
    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('closes on Escape', async () => {
    const onClose = jest.fn()
    const user = userEvent.setup()
    render(<Harness onClose={onClose} />)
    await user.keyboard('{Escape}')
    // The exit animation runs first; reduced motion is off in jsdom, so wait.
    await screen.findByRole('dialog')
    await new Promise((r) => setTimeout(r, 250))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when the scrim is clicked', async () => {
    const onClose = jest.fn()
    const user = userEvent.setup()
    render(<Harness onClose={onClose} />)

    const scrim = screen.getByRole('dialog').parentElement
    await user.click(scrim!)
    await new Promise((r) => setTimeout(r, 250))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close when the panel itself is clicked', async () => {
    // The scrim handler fires on any click that bubbles to it, so it has to
    // check the target — otherwise clicking a label inside the form closes the
    // dialog and throws away what the member typed.
    const onClose = jest.fn()
    const user = userEvent.setup()
    render(<Harness onClose={onClose} />)

    await user.click(screen.getByRole('dialog'))
    await new Promise((r) => setTimeout(r, 250))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps Tab inside the dialog', async () => {
    // The defect in all four hand-rolled overlays: Tab walks out of the dialog
    // into the page behind it, with no visible sign that it has.
    const user = userEvent.setup()
    render(<Harness />)

    const dialog = screen.getByRole('dialog')
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('gives focus back to whatever opened it', async () => {
    const user = userEvent.setup()

    function Parent() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Edit
          </button>
          {open && (
            <Modal onClose={() => setOpen(false)} label="Editor">
              <ModalBody>Body</ModalBody>
            </Modal>
          )}
        </>
      )
    }

    render(<Parent />)
    const opener = screen.getByRole('button', { name: 'Edit' })
    await user.click(opener)
    expect(screen.getByRole('dialog')).toHaveFocus()

    await user.keyboard('{Escape}')
    await new Promise((r) => setTimeout(r, 250))
    expect(opener).toHaveFocus()
  })

  it('locks the page behind it, and unlocks it after', async () => {
    const { unmount } = render(<Harness />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})
