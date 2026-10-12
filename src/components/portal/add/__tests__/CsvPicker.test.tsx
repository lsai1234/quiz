import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CsvPicker } from '../CsvPicker'

/**
 * PowerBody's own catalogue export: one row per SKU, semicolon separated, the
 * flavour usually only in the name ("<Product>, <Flavour> - <size>").
 */
const CSV = [
  'sku;manufacturer_name;name;qty;flavour;weight;img_url;retail_price;',
  'P1;Applied Nutrition;Creatine HCl, Fruit Punch - 75g;50+; ;0.1;https://x/1.jpg;10;',
  'P2;Applied Nutrition;Creatine HCl, Blue Raz - 75g;12; ;0.1;https://x/2.jpg;10;',
  'P3;Applied Nutrition;Creatine HCl, Fruit Punch - 300g;0; ;0.3;;20;',
  'P4;Optimum Nutrition;Gold Standard Whey, Double Rich Chocolate - 2270g;50+;Double Rich Chocolate;2.3;;60;',
  'p5;Optimum Nutrition;Gold Standard Whey, Vanilla Ice Cream - 2270g;50+; ;2.3;;60;',
].join('\n')

function setup(props: Partial<Parameters<typeof CsvPicker>[0]> = {}) {
  const onLookUp = jest.fn()
  const onRoster = jest.fn()
  render(<CsvPicker incoming={null} busy={false} onLookUp={onLookUp} onRoster={onRoster} {...props} />)
  return { onLookUp, onRoster, user: userEvent.setup() }
}

async function choose(user: ReturnType<typeof userEvent.setup>, text: string, name = 'powerbody.csv') {
  const button = screen.getByRole('button', { name: /PowerBody’s spreadsheet|Choose another file/ })
  await user.upload(button.previousElementSibling as HTMLInputElement, new File([text], name, { type: 'text/csv' }))
}

/** The spreadsheet's products as listed, each with its flavour count. */
const listed = () =>
  within(screen.getByRole('list', { name: 'Products in the spreadsheet' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('span')?.textContent)

describe('CsvPicker', () => {
  it('groups the flavours of one product together, and keeps sizes apart', async () => {
    const { user } = setup()
    await choose(user, CSV)

    expect(await screen.findByText('powerbody.csv: 3 products, 5 SKUs')).toBeInTheDocument()
    // Name minus flavour, size kept: the 75g and the 300g are two products.
    expect(listed()).toEqual(['Creatine HCl - 75g', 'Creatine HCl - 300g', 'Gold Standard Whey - 2270g'])

    const creatine = screen.getAllByRole('listitem')[0]
    expect(within(creatine).getByText('2 flavours')).toBeInTheDocument()
    expect(within(creatine).getByRole('checkbox', { name: 'Fruit Punch' })).toHaveAccessibleDescription('P1 · 50+ in stock')
    expect(within(creatine).getByRole('checkbox', { name: 'Blue Raz' })).not.toBeChecked()
  })

  it('searches by name, brand, flavour or SKU', async () => {
    const { user } = setup()
    await choose(user, CSV)
    const search = await screen.findByRole('textbox', { name: 'Search the spreadsheet' })

    await user.type(search, 'vanilla')
    expect(listed()).toEqual(['Gold Standard Whey - 2270g'])

    await user.clear(search)
    await user.type(search, 'applied 300g')
    expect(listed()).toEqual(['Creatine HCl - 300g'])

    await user.clear(search)
    await user.type(search, 'p2')
    expect(listed()).toEqual(['Creatine HCl - 75g'])

    await user.clear(search)
    await user.type(search, 'mass gainer')
    expect(screen.getByText(/Nothing in the file matches “mass gainer”/)).toBeInTheDocument()
  })

  it('looks the ticked flavours up one group per product, so each product’s flavours stay together', async () => {
    const { user, onLookUp } = setup()
    await choose(user, CSV)

    await screen.findByRole('list', { name: 'Products in the spreadsheet' })
    const [creatine, , whey] = screen.getAllByRole('listitem')
    await user.click(within(creatine).getByRole('button', { name: 'Tick all 2' }))
    await user.click(within(whey).getByRole('checkbox', { name: 'Vanilla Ice Cream' }))
    await user.click(screen.getByRole('button', { name: 'Look up 3 ticked' }))

    expect(onLookUp).toHaveBeenCalledWith([
      { title: 'Creatine HCl - 75g', brand: 'Applied Nutrition', source: 'csv', codes: ['P1', 'P2'] },
      // Codes normalised as the box would: a lower-case SKU in the file is still P5.
      { title: 'Gold Standard Whey - 2270g', brand: 'Optimum Nutrition', source: 'csv', codes: ['P5'] },
    ])
    // Ticks clear once they are on their way.
    expect(screen.getByRole('button', { name: 'Tick the flavours you want' })).toBeDisabled()
  })

  it('says why the file has to be looked up — it has no product ids', () => {
    setup()
    expect(screen.getByText(/but no product ids and no cost/)).toBeInTheDocument()
  })

  it('sends a roster spreadsheet to the roster import rather than reading it as PowerBody’s', async () => {
    const { user, onRoster } = setup()
    await choose(user, 'sku,title,swapGroup\nP1,Creatine,creatine\n', 'roster.csv')

    expect(await screen.findByText(/roster\.csv is not PowerBody’s catalogue spreadsheet/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to the roster import' }))
    expect(onRoster).toHaveBeenCalled()
  })

  it('reads a file handed over from the roster import', async () => {
    setup({ incoming: { text: CSV, fileName: 'from-roster.csv', nonce: 1 } })
    expect(await screen.findByText('from-roster.csv: 3 products, 5 SKUs')).toBeInTheDocument()
  })
})
