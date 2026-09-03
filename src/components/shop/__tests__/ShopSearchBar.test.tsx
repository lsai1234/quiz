import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { Suggestion } from '@/lib/shop/suggestions'
import { ShopSearchBar } from '../ShopSearchBar'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return { id: 'v', title: 'V', flavour: null, size: null, price: 30, compareAtPrice: null, available: true, ...over }
}

function makeProduct(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'p', title: 'P', handle: 'p', description: '', imageUrl: null, category: 'Protein',
    stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [], formats: ['powder'],
    variants: [variant()], basePrice: 30, compareAtPrice: null, subscriptionEligible: true,
    servings: 30, swapGroup: 'protein-whey', recommendationPriority: 5, marginPriority: 5,
    isCoreEligible: true, isBoosterEligible: false, hasStimulants: false, shortReason: '',
    warnings: [], ...over,
  }
}

const WHEY = makeProduct({ id: 'whey', title: 'CHRGD Whey Protein' })
const CASEIN = makeProduct({ id: 'casein', title: 'CHRGD Casein' })

const PRODUCT_SUGGESTIONS: Suggestion[] = [
  { kind: 'product', id: 'product:whey', product: WHEY },
  { kind: 'product', id: 'product:casein', product: CASEIN },
  { kind: 'jump', id: 'jump:category:Protein', facet: 'category', value: 'Protein', label: 'Protein', count: 4 },
]

const RECENT_SUGGESTIONS: Suggestion[] = [
  { kind: 'recent', id: 'recent:whey', query: 'whey' },
  { kind: 'recent', id: 'recent:magnesium', query: 'magnesium' },
]

interface HostProps {
  count?: number | null
  suggestions?: Suggestion[]
  onSelect?: (s: Suggestion) => void
  onSubmit?: (v: string) => void
  onClearRecent?: () => void
}

/** A controlled host, because the bar is a controlled input by design. */
function Host({
  count = null, suggestions = [], onSelect = () => {}, onSubmit = () => {}, onClearRecent = () => {},
}: HostProps) {
  const [value, setValue] = useState('')
  return (
    <ShopSearchBar
      value={value}
      onChange={setValue}
      resultCount={count}
      suggestions={suggestions}
      onSelect={onSelect}
      onSubmit={onSubmit}
      onClearRecent={onClearRecent}
    />
  )
}

const box = () => screen.getByRole('combobox', { name: 'Search the shop' })

describe('the input', () => {
  it('is a combobox, reachable by its accessible name', () => {
    render(<Host />)
    expect(box()).toBeInTheDocument()
  })

  it('reports every keystroke, so the shell can debounce rather than the input lagging', async () => {
    const onChange = jest.fn()
    render(
      <ShopSearchBar
        value="" onChange={onChange} resultCount={null}
        suggestions={[]} onSelect={() => {}} onSubmit={() => {}} onClearRecent={() => {}}
      />,
    )
    await userEvent.type(screen.getByRole('combobox'), 'wh')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('shows a clear button only once there is something to clear', async () => {
    render(<Host />)
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()

    await userEvent.type(box(), 'whey')
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(box()).toHaveValue('')
    expect(box()).toHaveFocus()
  })

  it('announces the result count politely', () => {
    render(<Host count={14} />)
    expect(screen.getByRole('status')).toHaveTextContent('14 products found')
  })

  it('says "product" in the singular, and nothing while browsing', () => {
    const { rerender } = render(<Host count={1} />)
    expect(screen.getByRole('status')).toHaveTextContent('1 product found')
    rerender(<Host count={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('focuses on "/" from anywhere on the page', async () => {
    render(<Host />)
    expect(box()).not.toHaveFocus()
    await userEvent.keyboard('/')
    expect(box()).toHaveFocus()
  })

  it('leaves "/" alone while someone is typing in another field', async () => {
    render(<><input aria-label="Somewhere else" /><Host /></>)
    const other = screen.getByRole('textbox', { name: 'Somewhere else' })
    await userEvent.click(other)
    await userEvent.keyboard('/')
    // The slash belongs to the field they are in — stealing focus mid-typing
    // would be worse than having no shortcut at all.
    expect(other).toHaveFocus()
    expect(other).toHaveValue('/')
  })
})

describe('the suggestion popup', () => {
  it('is closed until the box has focus and something to show', async () => {
    render(<Host suggestions={PRODUCT_SUGGESTIONS} />)
    expect(box()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await userEvent.click(box())
    expect(box()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox', { name: 'Search suggestions' })).toBeInTheDocument()
  })

  it('stays closed when there is nothing to suggest', async () => {
    render(<Host suggestions={[]} />)
    await userEvent.click(box())
    expect(box()).toHaveAttribute('aria-expanded', 'false')
  })

  it('points aria-controls at the listbox it owns', async () => {
    render(<Host suggestions={PRODUCT_SUGGESTIONS} />)
    await userEvent.click(box())
    expect(box().getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id)
  })

  it('renders a row per suggestion, with prices and shelf sizes', async () => {
    render(<Host suggestions={PRODUCT_SUGGESTIONS} />)
    await userEvent.click(box())
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(options[0]).toHaveTextContent('CHRGD Whey Protein')
    expect(options[0]).toHaveTextContent('£30.00')
    expect(options[2]).toHaveTextContent('4 products')
  })

  it('selects a row on click', async () => {
    const onSelect = jest.fn()
    render(<Host suggestions={PRODUCT_SUGGESTIONS} onSelect={onSelect} />)
    await userEvent.click(box())
    await userEvent.click(screen.getAllByRole('option')[1])
    expect(onSelect).toHaveBeenCalledWith(PRODUCT_SUGGESTIONS[1])
  })
})

describe('the keyboard contract the combobox role promises', () => {
  const openWith = async (suggestions: Suggestion[], props: HostProps = {}) => {
    render(<Host suggestions={suggestions} {...props} />)
    await userEvent.click(box())
  }

  it('highlights nothing until an arrow key is pressed', async () => {
    await openWith(PRODUCT_SUGGESTIONS)
    expect(box()).not.toHaveAttribute('aria-activedescendant')
  })

  it('moves down and up through the rows, naming the active one', async () => {
    await openWith(PRODUCT_SUGGESTIONS)
    await userEvent.keyboard('{ArrowDown}')
    expect(box()).toHaveAttribute('aria-activedescendant', 'product:whey')
    await userEvent.keyboard('{ArrowDown}')
    expect(box()).toHaveAttribute('aria-activedescendant', 'product:casein')
    await userEvent.keyboard('{ArrowUp}')
    expect(box()).toHaveAttribute('aria-activedescendant', 'product:whey')
  })

  it('marks the active row as selected, and only that one', async () => {
    await openWith(PRODUCT_SUGGESTIONS)
    await userEvent.keyboard('{ArrowDown}')
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(options[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('wraps back through "nothing highlighted" rather than sticking at the ends', async () => {
    await openWith(RECENT_SUGGESTIONS)
    await userEvent.keyboard('{ArrowUp}')
    // One Up from nothing lands on the LAST row.
    expect(box()).toHaveAttribute('aria-activedescendant', 'recent:magnesium')
    await userEvent.keyboard('{ArrowDown}')
    // Past the end is "nothing", so the typed text is reachable again.
    expect(box()).not.toHaveAttribute('aria-activedescendant')
  })

  it('selects the highlighted row on Enter', async () => {
    const onSelect = jest.fn()
    const onSubmit = jest.fn()
    await openWith(PRODUCT_SUGGESTIONS, { onSelect, onSubmit })
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith(PRODUCT_SUGGESTIONS[0])
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the typed text on Enter when nothing is highlighted', async () => {
    const onSelect = jest.fn()
    const onSubmit = jest.fn()
    render(<Host suggestions={PRODUCT_SUGGESTIONS} onSelect={onSelect} onSubmit={onSubmit} />)
    await userEvent.type(box(), 'whey{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('whey')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('closes the popup on Escape but keeps what was typed', async () => {
    render(<Host suggestions={PRODUCT_SUGGESTIONS} />)
    await userEvent.type(box(), 'whey')
    expect(box()).toHaveAttribute('aria-expanded', 'true')

    await userEvent.keyboard('{Escape}')
    expect(box()).toHaveAttribute('aria-expanded', 'false')
    // Someone who opened the list by accident should not lose their query to it.
    expect(box()).toHaveValue('whey')
  })

  it('clears the box on a second Escape', async () => {
    render(<Host suggestions={PRODUCT_SUGGESTIONS} />)
    await userEvent.type(box(), 'whey')
    await userEvent.keyboard('{Escape}{Escape}')
    expect(box()).toHaveValue('')
  })

  it('drops the highlight when the suggestions change underneath it', async () => {
    const { rerender } = render(<Host suggestions={PRODUCT_SUGGESTIONS} />)
    await userEvent.click(box())
    await userEvent.keyboard('{ArrowDown}')
    expect(box()).toHaveAttribute('aria-activedescendant', 'product:whey')

    // Row 1 of the old list is not row 1 of the new one; keeping the index would
    // move the highlight onto an unrelated product as the shopper types.
    rerender(<Host suggestions={RECENT_SUGGESTIONS} />)
    expect(box()).not.toHaveAttribute('aria-activedescendant')
  })
})

describe('recent searches', () => {
  it('labels them and offers one tap to forget them', async () => {
    const onClearRecent = jest.fn()
    render(<Host suggestions={RECENT_SUGGESTIONS} onClearRecent={onClearRecent} />)
    await userEvent.click(box())

    expect(screen.getByText('Recent')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear recent searches' }))
    expect(onClearRecent).toHaveBeenCalled()
  })

  it('keeps the clear button out of the listbox, which may only hold options', async () => {
    render(<Host suggestions={RECENT_SUGGESTIONS} />)
    await userEvent.click(box())
    const listbox = screen.getByRole('listbox')
    expect(listbox).not.toContainElement(screen.getByRole('button', { name: 'Clear recent searches' }))
  })

  it('shows no Recent heading when the rows are real matches', async () => {
    render(<Host suggestions={PRODUCT_SUGGESTIONS} />)
    await userEvent.click(box())
    expect(screen.queryByText('Recent')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear recent searches' })).not.toBeInTheDocument()
  })
})
