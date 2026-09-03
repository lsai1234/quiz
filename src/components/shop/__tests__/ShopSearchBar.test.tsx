import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ShopSearchBar } from '../ShopSearchBar'

/** A controlled host, because the bar is a controlled input by design. */
function Host({ count = null }: { count?: number | null }) {
  const [value, setValue] = useState('')
  return <ShopSearchBar value={value} onChange={setValue} resultCount={count} />
}

describe('ShopSearchBar', () => {
  it('is reachable by its accessible name', () => {
    render(<Host />)
    expect(screen.getByRole('searchbox', { name: 'Search the shop' })).toBeInTheDocument()
  })

  it('reports every keystroke, so the shell can debounce rather than the input lagging', async () => {
    const onChange = jest.fn()
    render(<ShopSearchBar value="" onChange={onChange} resultCount={null} />)
    await userEvent.type(screen.getByRole('searchbox'), 'wh')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('shows a clear button only once there is something to clear', async () => {
    render(<Host />)
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()

    await userEvent.type(screen.getByRole('searchbox'), 'whey')
    const clear = screen.getByRole('button', { name: 'Clear search' })
    await userEvent.click(clear)

    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })

  it('clears on Escape', async () => {
    render(<Host />)
    const input = screen.getByRole('searchbox')
    await userEvent.type(input, 'whey')
    await userEvent.keyboard('{Escape}')
    expect(input).toHaveValue('')
  })

  it('announces the result count politely', () => {
    render(<Host count={14} />)
    expect(screen.getByRole('status')).toHaveTextContent('14 products found')
  })

  it('says "product" in the singular', () => {
    render(<Host count={1} />)
    expect(screen.getByRole('status')).toHaveTextContent('1 product found')
  })

  it('announces nothing while browsing', () => {
    render(<Host count={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('focuses on "/" from anywhere on the page', async () => {
    render(<Host />)
    const input = screen.getByRole('searchbox')
    expect(input).not.toHaveFocus()
    await userEvent.keyboard('/')
    expect(input).toHaveFocus()
  })

  it('leaves "/" alone while someone is typing in another field', async () => {
    render(
      <>
        <input aria-label="Somewhere else" />
        <Host />
      </>,
    )
    const other = screen.getByRole('textbox', { name: 'Somewhere else' })
    await userEvent.click(other)
    await userEvent.keyboard('/')

    // The slash belongs to the field they are in — stealing focus mid-typing
    // would be worse than having no shortcut at all.
    expect(other).toHaveFocus()
    expect(other).toHaveValue('/')
  })
})
