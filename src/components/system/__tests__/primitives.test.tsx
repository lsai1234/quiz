import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Card } from '../Card'
import { Checkbox } from '../Checkbox'
import { Disclosure } from '../Disclosure'
import { Input } from '../Input'
import { Modal, ModalBody, ModalFooter, ModalHeader } from '../Modal'
import { Select } from '../Select'
import { Tabs } from '../Tabs'
import { Skeleton, SkeletonText } from '../Skeleton'
import { Textarea } from '../Textarea'

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
    expect(screen.getByRole('button').className).toContain('system-focus')
  })

  it('stacks its content when asked, so it can be a card you press', () => {
    /* The three places in My Hub that press like a card — the delivery
       calendar's boxes, the line-manage rows, the product-change options — pass
       several stacked children. They used to say so in `className`, which
       reached the button and never reached its content: the children live in a
       wrapper span that was unconditionally `inline-flex items-center
       justify-center`, so four stacked rows were laid out side by side inside a
       160px box and, being centred, spilled out of both edges at once. */
    const { container, rerender } = render(
      <Button layout="stack"><span>one</span><span>two</span></Button>,
    )
    const stacked = container.querySelector('button > span')!
    expect(stacked.className).toContain('flex-col')
    expect(stacked.className).not.toContain('justify-center')
    expect(container.querySelector('button')!.className).toContain('flex-col')

    rerender(<Button><span>one</span></Button>)
    const row = container.querySelector('button > span')!
    expect(row.className).toContain('items-center')
    expect(row.className).not.toContain('flex-col')
  })

  it('rings a destructive action in its own colour, not the accent', () => {
    // One ring colour for everything disappears against a coloured fill, which
    // is the state a keyboard user most needs to see on a delete.
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByRole('button').className).toContain('system-focus-critical')
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


/**
 * The compact field.
 *
 * The variant exists because Founders Hub is full of dense rows that already
 * name their value, and the stacked label doubles the height of those pages.
 * The whole risk of a variant like this is that "no label" quietly becomes "no
 * accessible name" — so what is pinned here is that nothing a screen reader
 * relies on was dropped, only the space it took.
 */
describe('Input, compact', () => {
  it('still has an accessible name, with no visible label', () => {
    render(<Input compact label="Discount" />)
    expect(screen.getByRole('textbox', { name: 'Discount' })).toBeInTheDocument()
    // Nothing drawn: the row around it already says what this is.
    expect(screen.queryByText('Discount')).not.toBeInTheDocument()
  })

  it('still announces its error, without giving it a line', () => {
    render(<Input compact label="Weight" error="Must be a positive number." />)
    const field = screen.getByRole('textbox', { name: 'Weight' })
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription('Must be a positive number.')
  })

  it('still announces its hint', () => {
    render(<Input compact label="Rate" hint="Percent, not a fraction." />)
    expect(screen.getByRole('textbox', { name: 'Rate' })).toHaveAccessibleDescription(
      'Percent, not a fraction.',
    )
  })

  it('takes the caller width on the control itself', () => {
    // There is no wrapper in compact mode, so a className that lands anywhere
    // else is a width that silently does nothing.
    render(<Input compact label="Cost" className="w-16" />)
    expect(screen.getByRole('textbox', { name: 'Cost' }).className).toContain('w-16')
  })

  it('keeps its focus ring', () => {
    render(<Input compact label="Cost" />)
    expect(screen.getByRole('textbox', { name: 'Cost' }).className).toContain('system-focus')
  })

  it('puts the caller width on the box, not the text, when there is a unit', () => {
    // With a unit the box is the wrapper and the input is bare inside it, so a
    // width on the input sizes the text and leaves the box full-bleed — which is
    // the opposite of what a caller asking for `w-24` in a table row wants.
    render(<Input compact label="Unit price" prefix="£" className="w-24" />)
    const field = screen.getByRole('textbox', { name: 'Unit price' })
    expect(field.className).not.toContain('w-24')
    expect(field.parentElement?.className).toContain('w-24')
    // The ring still belongs to the box the member can see.
    expect(field.parentElement?.className).toContain('system-focus-within')
  })

  it('does not set aria-label when the label is visible', () => {
    // A visible <label htmlFor> plus an aria-label is the one way to make a
    // correctly-labelled field announce something other than what is on screen.
    render(<Input label="Supplier SKU" />)
    expect(screen.getByLabelText('Supplier SKU')).not.toHaveAttribute('aria-label')
  })
})

describe('Select, compact', () => {
  it('still has an accessible name, with no visible label', () => {
    render(
      <Select compact label="Cadence">
        <option value="1">Monthly</option>
      </Select>,
    )
    expect(screen.getByRole('combobox', { name: 'Cadence' })).toBeInTheDocument()
    expect(screen.queryByText('Cadence')).not.toBeInTheDocument()
  })
})

describe('Textarea', () => {
  it('labels the control, so tapping the label focuses it', async () => {
    const user = userEvent.setup()
    render(<Textarea label="Description" />)
    await user.click(screen.getByText('Description'))
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveFocus()
  })

  it('announces its error and marks itself invalid', () => {
    render(<Textarea label="Reason" error="A reason is required." />)
    const field = screen.getByRole('textbox', { name: 'Reason' })
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription('A reason is required.')
  })

  it('keeps the caller rows — the control surface would otherwise flatten it', () => {
    // `controlSurface` sets a single control's `minHeight`. If that won every
    // textarea in the system is one line tall whatever `rows` says.
    render(<Textarea label="Notes" rows={5} />)
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAttribute('rows', '5')
  })

  it('has a focus ring', () => {
    render(<Textarea label="Notes" />)
    expect(screen.getByRole('textbox', { name: 'Notes' }).className).toContain('system-focus')
  })
})

describe('Checkbox', () => {
  it('toggles when the sentence beside it is clicked, not only the box', async () => {
    const user = userEvent.setup()
    render(<Checkbox label="First order only" />)
    const box = screen.getByRole('checkbox', { name: 'First order only' })
    expect(box).not.toBeChecked()
    await user.click(screen.getByText('First order only'))
    expect(box).toBeChecked()
  })

  it('is a real checkbox, so the space bar works', async () => {
    const user = userEvent.setup()
    render(<Checkbox label="Self-billed" />)
    const box = screen.getByRole('checkbox', { name: 'Self-billed' })
    box.focus()
    await user.keyboard(' ')
    expect(box).toBeChecked()
  })

  it('describes itself with the hint', () => {
    render(<Checkbox label="First order only" hint="Without it the code is site-wide." />)
    expect(screen.getByRole('checkbox', { name: 'First order only' })).toHaveAccessibleDescription(
      'Without it the code is site-wide.',
    )
  })

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup()
    render(<Checkbox label="Locked" disabled />)
    const box = screen.getByRole('checkbox', { name: 'Locked' })
    await user.click(screen.getByText('Locked'))
    expect(box).not.toBeChecked()
  })

  it('has a focus ring', () => {
    render(<Checkbox label="Locked" />)
    expect(screen.getByRole('checkbox', { name: 'Locked' }).className).toContain('system-focus')
  })
})

describe('Skeleton', () => {
  it('is hidden from screen readers — it says nothing worth hearing', () => {
    const { container } = render(<Skeleton width={120} height={12} />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('ends a paragraph short, the way a real one does', () => {
    const { container } = render(<SkeletonText lines={3} />)
    const blocks = container.querySelectorAll('.system-shimmer')
    expect(blocks).toHaveLength(3)
    expect((blocks[2] as HTMLElement).style.width).toBe('62%')
  })
})

describe('Disclosure', () => {
  it('starts closed and says so', () => {
    render(
      <Disclosure summary="Plan & billing settings">
        <p>Regular ship day</p>
      </Disclosure>,
    )
    const trigger = screen.getByRole('button', { name: /plan & billing settings/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Regular ship day')).not.toBeInTheDocument()
  })

  it('opens, and points at the panel it controls', async () => {
    const user = userEvent.setup()
    render(
      <Disclosure summary="Plan & billing settings">
        <p>Regular ship day</p>
      </Disclosure>,
    )

    const trigger = screen.getByRole('button', { name: /plan & billing settings/i })
    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Regular ship day')).toBeInTheDocument()
    // The ▲/▼ characters this replaces told assistive tech nothing at all.
    const panelId = trigger.getAttribute('aria-controls')!
    expect(document.getElementById(panelId)).toContainElement(screen.getByText('Regular ship day'))
  })

  it('lets a parent drive it, for a deep link that must land open', async () => {
    const onOpenChange = jest.fn()
    const user = userEvent.setup()
    render(
      <Disclosure summary="Settings" open onOpenChange={onOpenChange}>
        <p>Ship day</p>
      </Disclosure>,
    )

    expect(screen.getByText('Ship day')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    // Still open: the parent owns the state and has not changed it yet.
    expect(screen.getByText('Ship day')).toBeInTheDocument()
  })
})
