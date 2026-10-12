import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedExport } from '../FeedExport'

/**
 * Looking a code up asks "is this one there?" and answers slowly when it is
 * not. The export asks "what is there?" once — the right shape when there is a
 * list of a hundred to check against the account. Carried over from the old
 * PowerBody tab's SKU box, where these tests began.
 */

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  jest.restoreAllMocks()
})

function pass(body: string, rows: string, next: string, complete = !next) {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'X-Row-Count': rows, 'X-Feed-Complete': complete ? 'yes' : 'no', 'X-Next-Page': next }),
    text: async () => body,
    json: async () => ({}),
  } as unknown as Response)
}

describe('FeedExport', () => {
  /** A pass that says `X-Next-Page` is a pause, not the end of the file. */
  it('keeps reading until the feed actually ends, and stitches the passes', async () => {
    const createObjectURL = jest.fn(() => 'blob:feed')
    const revokeObjectURL = jest.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const fetchMock = jest
      .fn()
      .mockReturnValueOnce(pass('productId,sku\n1,PB-1\n', '3000', '151'))
      .mockReturnValueOnce(pass('2,PB-2\n', '1200', ''))
    global.fetch = fetchMock as unknown as typeof fetch

    render(<FeedExport />)
    await userEvent.setup().click(screen.getByRole('button', { name: /download the full product list/i }))

    // 3000 + 1200 — the first pass alone was the bug.
    expect(await screen.findByText(/Downloaded all 4,200 products on this account/)).toBeInTheDocument()
    expect(screen.getByText(/its productId column is what “Paste its product id” takes/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // The second pass resumes rather than restarting.
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ fromPage: 151 })
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:feed')
  })

  /**
   * A truncated export is not a smaller answer — it is a wrong one to the
   * question people act on. "Not in the file" has to stop meaning "not on the
   * account" the moment the read fell short.
   */
  it('warns that a truncated export proves nothing about what is missing', async () => {
    Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:feed'), revokeObjectURL: jest.fn() })
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    // A supplier that never stops paging: the loop gives up and SAYS so.
    global.fetch = jest.fn((_url: string, init?: RequestInit) => {
      const from = JSON.parse(String(init?.body ?? '{}')).fromPage ?? 1
      return pass('productId,sku\n', '10', String(from + 150), false)
    }) as unknown as typeof fetch

    render(<FeedExport />)
    await userEvent.setup().click(screen.getByRole('button', { name: /download the full product list/i }))

    expect(await screen.findByText(/so this file is only part of the catalogue/)).toBeInTheDocument()
    expect(screen.getByText(/anything missing proves nothing/)).toBeInTheDocument()
  })

  it('says why the list could not be read, and what to do', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers(),
      json: async () => ({ error: 'PowerBody is rate limiting us (HTTP 429).' }),
    }) as unknown as typeof fetch

    render(<FeedExport />)
    await userEvent.setup().click(screen.getByRole('button', { name: /download the full product list/i }))

    expect(await screen.findByText(/PowerBody stopped answering after 0 products \(PowerBody is rate limiting us \(HTTP 429\)\)\. Nothing was downloaded — press it again in a few minutes/)).toBeInTheDocument()
  })
})
