import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RosterImport } from '../RosterImport'

jest.mock('@/hooks/useCatalogueProducts', () => ({ invalidateCatalogue: jest.fn() }))

const ROSTER = 'sku,title,swapGroup\nP1,Creatine,creatine\n'

function reply(body: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response)
}

/** A batch's answer from `POST /api/portal/products/import-csv`. */
function batch(offset: number, overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    total: 20,
    offset,
    imported: 0,
    refreshed: 0,
    already: 0,
    enriched: 0,
    nextOffset: null,
    withoutIds: [],
    results: [],
    warnings: [],
    ...overrides,
  }
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  jest.useRealTimers()
})

async function choose(user: ReturnType<typeof userEvent.setup>, text = ROSTER) {
  const button = screen.getByRole('button', { name: 'Choose a roster spreadsheet' })
  await user.upload(button.previousElementSibling as HTMLInputElement, new File([text], 'roster.csv', { type: 'text/csv' }))
}

const bodies = (fetchMock: jest.Mock) => fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)))

describe('RosterImport', () => {
  it('says what each batch did — imported, refreshed, already there — and offers to find missing ids', async () => {
    const fetchMock = jest
      .fn()
      .mockReturnValueOnce(
        reply(
          batch(0, {
            imported: 1,
            refreshed: 1,
            enriched: 1,
            nextOffset: 12,
            withoutIds: ['P7'],
            warnings: ['Row 4: swap group “shaker” is not one we know — imported as general.'],
            results: [
              { sku: 'P1', id: 'creatine', title: 'Creatine', enriched: true, notes: [], outcome: 'added' },
              { sku: 'P2', id: 'whey', title: 'Whey', enriched: false, notes: ['No picture from PowerBody.'], outcome: 'refreshed', existingId: 'whey', existingTitle: 'Whey' },
            ],
          }),
        ),
      )
      .mockReturnValueOnce(
        reply(
          batch(12, {
            already: 1,
            withoutIds: ['P7', 'P8'],
            results: [{ sku: 'P3', id: 'bcaa', title: 'BCAA', enriched: false, notes: [], outcome: 'already', existingId: 'bcaa-live', existingTitle: 'BCAA Fresh' }],
          }),
        ),
      )
    global.fetch = fetchMock as unknown as typeof fetch
    const onFindIds = jest.fn()

    render(<RosterImport onFindIds={onFindIds} />)
    const user = userEvent.setup()
    await choose(user)

    expect(await screen.findByText(/1 product imported, 1 with a picture and description from PowerBody\./)).toBeInTheDocument()
    expect(screen.getByText(/1 product already waiting for review was refreshed with your sheet’s swap groups/)).toBeInTheDocument()
    expect(screen.getByText(/1 product already in the catalogue was left exactly as it is\./)).toBeInTheDocument()
    expect(bodies(fetchMock).map((b) => b.offset)).toEqual([0, 12])

    // SKUs without a PowerBody id, gathered across batches without repeats.
    expect(screen.getByText(/2 SKUs have no PowerBody product id yet/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Find their ids' }))
    expect(onFindIds).toHaveBeenCalledWith(['P7', 'P8'])

    expect(screen.getByRole('link', { name: 'Next: review them' })).toHaveAttribute('href', '/founderhub/products/review')
    await user.click(screen.getByRole('button', { name: /1 row already in the catalogue/ }))
    expect(screen.getByRole('link', { name: 'BCAA Fresh' })).toHaveAttribute('href', '/founderhub/products/item/bcaa-live')
    await user.click(screen.getByRole('button', { name: /1 needs a look before approving/ }))
    expect(screen.getByText('No picture from PowerBody.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /1 problem in the file itself/ }))
    expect(screen.getByText(/swap group “shaker” is not one we know/)).toBeInTheDocument()
  })

  it('asks for a failed batch once more, then offers to carry on from that row', async () => {
    jest.useFakeTimers()
    const fetchMock = jest
      .fn()
      .mockReturnValueOnce(
        reply(batch(0, { imported: 1, nextOffset: 12, results: [{ sku: 'P1', id: 'a', title: 'A', enriched: false, notes: [], outcome: 'added' }] })),
      )
      .mockReturnValueOnce(reply({ error: 'PowerBody did not answer in time.' }, 502))
      .mockReturnValueOnce(reply({ error: 'PowerBody did not answer in time.' }, 502))
      .mockReturnValueOnce(
        reply(batch(12, { imported: 1, results: [{ sku: 'P13', id: 'b', title: 'B', enriched: false, notes: [], outcome: 'added' }] })),
      )
    global.fetch = fetchMock as unknown as typeof fetch

    render(<RosterImport />)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await choose(user)

    expect(await screen.findByText(/Row 13 did not go through \(PowerBody did not answer in time\) — trying that batch once more/)).toBeInTheDocument()
    await act(async () => {
      jest.advanceTimersByTime(2000)
    })

    expect(await screen.findByText(/Stopped at row 13 of 20 — that batch failed twice \(PowerBody did not answer in time\)\. Rows before it are in and stay in\./)).toBeInTheDocument()
    expect(bodies(fetchMock).map((b) => b.offset)).toEqual([0, 12, 12])

    await user.click(screen.getByRole('button', { name: 'Carry on from row 13' }))
    // What landed before the failure is still counted.
    expect(await screen.findByText(/2 products imported/)).toBeInTheDocument()
    expect(bodies(fetchMock).map((b) => b.offset)).toEqual([0, 12, 12, 12])
  })

  it('does not ask twice when the file itself is the problem', async () => {
    const fetchMock = jest.fn().mockReturnValue(reply({ error: 'No sku column — the first line must name the columns.' }, 400))
    global.fetch = fetchMock as unknown as typeof fetch

    render(<RosterImport />)
    await choose(userEvent.setup())

    expect(await screen.findByText(/Not imported — No sku column — the first line must name the columns\. Fix the file and choose it again\./)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refuses PowerBody’s own list with the server’s words, and hands it to the spreadsheet picker', async () => {
    const pbCsv = 'sku;manufacturer_name;name;qty;flavour;weight;img_url;retail_price;\nP1;A;B, C - 1kg;1; ;1;;1;'
    global.fetch = jest.fn().mockReturnValue(
      reply(
        {
          error: 'That is PowerBody’s own product list, not a roster spreadsheet. To add products from it, use “Pick from PowerBody’s spreadsheet” on this page.',
          powerBodyCsv: true,
        },
        400,
      ),
    ) as unknown as typeof fetch
    const onPowerBodyCsv = jest.fn()

    render(<RosterImport onPowerBodyCsv={onPowerBodyCsv} />)
    const user = userEvent.setup()
    await choose(user, pbCsv)

    expect(await screen.findByText(/That is PowerBody’s own product list, not a roster spreadsheet/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open it in the spreadsheet picker' }))
    expect(onPowerBodyCsv).toHaveBeenCalledWith(pbCsv, 'roster.csv')
  })

  it('says which file it wants, and that it is not PowerBody’s list', () => {
    render(<RosterImport />)
    expect(screen.getByText(/Not PowerBody’s product list: that one goes in “Pick from PowerBody’s spreadsheet” above/)).toBeInTheDocument()
  })
})
