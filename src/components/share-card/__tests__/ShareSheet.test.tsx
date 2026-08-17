import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShareSheet } from '../ShareSheet'
import { sharePersonas } from '@/lib/share-card/personas'
import { track } from '@/lib/analytics/events'

jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }))

/**
 * The share sheet.
 *
 * What matters here is not that the buttons render — it is that every rung of
 * the ladder is *visible* when it is reached, and that the label says which rung
 * it is before anything is pressed. There is no way to post to Instagram Stories
 * from mobile web, so the card reaches a story through the OS share sheet, and
 * on a device that cannot do that it falls to a download and then to
 * press-and-hold. A rung that fails silently leaves someone pressing a button
 * that appears dead, and it reads in the funnel as disinterest.
 */

const payload = sharePersonas()[0].payload
const events = () => (track as jest.Mock).mock.calls.map(([name]) => name)
const propsFor = (name: string) =>
  (track as jest.Mock).mock.calls.find(([e]) => e === name)?.[1]

const originalNavigator = globalThis.navigator

function setNavigator(value: Partial<Navigator>) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })
}

/** The primary action, whatever this device's rung called it. */
const primary = () => screen.getByRole('button', { name: /share your card|share the link|save your card/i })

beforeEach(() => {
  ;(track as jest.Mock).mockClear()
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob(['png'], { type: 'image/png' }),
  }) as unknown as typeof fetch
  global.URL.createObjectURL = jest.fn(() => 'blob:x')
  global.URL.revokeObjectURL = jest.fn()
})

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator, configurable: true, writable: true,
  })
})

describe('opening', () => {
  it('reports the funnel top and shows the card', () => {
    setNavigator({ userAgent: 'desktop' })
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)

    expect(events()).toContain('share_open')
    expect(propsFor('share_open')).toMatchObject({ format: 'story', hasCode: true })
    expect(screen.getByRole('img', { name: /my stack card/i })).toBeInTheDocument()
  })

  it('says what the card does not contain', () => {
    // The one line on this sheet that is not about sharing. A card is a public
    // URL with no expiry, and this is where someone finds out what is on it.
    setNavigator({ userAgent: 'desktop' })
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    expect(screen.getByText(/never shows your price/i)).toBeInTheDocument()
  })

  it('traps focus, which the hand-rolled sheet never did', async () => {
    // The previous sheet was a portal with no focus management at all: a
    // keyboard user could Tab straight out of it into the page behind.
    setNavigator({ userAgent: 'desktop' })
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)

    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(dialog).toHaveFocus())
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })
})

/**
 * The label is a promise about what the next tap does.
 *
 * It used to say "Share" on every device and then download a file on half of
 * them. `shareCapability()` is read before anything is pressed so the button can
 * name the rung it is actually on.
 */
describe('saying what will happen', () => {
  it('offers to share where the OS sheet exists, and teaches the step people miss', () => {
    setNavigator({ share: jest.fn(), canShare: () => true, userAgent: 'Android Chrome' })
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)

    expect(screen.getByRole('button', { name: /share your card/i })).toBeInTheDocument()
    expect(screen.getByText(/pick instagram, then story/i)).toBeInTheDocument()
  })

  it('offers to save where it does not, and says what to do with the file', () => {
    setNavigator({ userAgent: 'desktop' })
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)

    expect(screen.getByRole('button', { name: /save your card/i })).toBeInTheDocument()
    expect(screen.getByText(/from your camera roll/i)).toBeInTheDocument()
  })
})

describe('the ladder', () => {
  it('goes to the OS sheet when the browser can take a file', async () => {
    const share = jest.fn().mockResolvedValue(undefined)
    setNavigator({ share, canShare: () => true, userAgent: 'Android Chrome' })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(primary())

    await waitFor(() => expect(propsFor('share_method')).toMatchObject({ method: 'native-file' }))
    expect(share).toHaveBeenCalled()
    expect(await screen.findByText(/sent to your share sheet/i)).toBeInTheDocument()
  })

  it('shows the press-and-hold instruction when nothing else works', async () => {
    // iOS Safari, where `download` on a blob URL is ignored. Without this the
    // button genuinely does nothing.
    setNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1' })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(primary())

    expect(await screen.findByText(/press and hold the card/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /press and hold to save/i })).toBeInTheDocument()
  })

  it('falls back to the link when the card cannot be built', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } as unknown as Clipboard, userAgent: 'desktop' })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(primary())

    await waitFor(() => expect(events()).toContain('share_error'))
    expect(propsFor('share_error')).toMatchObject({ at: 'render' })
    expect(await screen.findByText(/link copied/i)).toBeInTheDocument()
  })

  it('stays put when the customer dismisses the OS sheet', async () => {
    // An AbortError is someone saying no. The sheet must not then hand them a
    // download, must not report a share, and must not advance to a step that
    // claims something happened.
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    setNavigator({ share: jest.fn().mockRejectedValue(abort), canShare: () => true, userAgent: 'iPhone' })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(primary())

    await waitFor(() => expect(primary()).toBeEnabled())
    expect(events()).not.toContain('share_method')
    expect(screen.queryByText(/sent to your share sheet/i)).not.toBeInTheDocument()
  })
})

describe('copy link', () => {
  it('records the rung it completed on', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } as unknown as Clipboard, userAgent: 'desktop' })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /copy the link/i }))

    await waitFor(() => expect(propsFor('share_method')).toMatchObject({ method: 'copy-link' }))
    expect(writeText.mock.calls[0][0]).toContain('ref=SARAH20')
  })

  it('says so in place when the clipboard refuses', async () => {
    // Not by advancing to the press-and-hold rung: that answers a clipboard
    // refusal with an instruction about saving an image, which is a different
    // problem the person did not have.
    setNavigator({
      clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } as unknown as Clipboard,
      userAgent: 'desktop',
    })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /copy the link/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not copy/i)
    expect(propsFor('share_error')).toMatchObject({ at: 'clipboard' })
    expect(primary()).toBeInTheDocument()
  })
})

describe('choosing a card', () => {
  it('switches the card and reports the change', async () => {
    setNavigator({ userAgent: 'desktop' })
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)

    await userEvent.click(screen.getByRole('tab', { name: 'Post' }))

    expect(propsFor('share_format')).toMatchObject({ from: 'story', to: 'square' })
    expect(screen.getByRole('img', { name: /post card/i })).toBeInTheDocument()
  })

  it('costs one tab stop, not one per card', async () => {
    // The ARIA tabs pattern is a roving tabindex. The previous row announced
    // itself as a tablist and behaved like a toolbar — three stops, and arrow
    // keys did nothing.
    setNavigator({ userAgent: 'desktop' })
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs.filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1)
    expect(tabs.filter((t) => t.getAttribute('tabindex') === '-1')).toHaveLength(tabs.length - 1)
  })

  it('moves with the arrow keys, and wraps', async () => {
    setNavigator({ userAgent: 'desktop' })
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)

    const story = screen.getByRole('tab', { name: 'My stack' })
    story.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Post' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'My stack' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('closing', () => {
  it('reports whether anything was shared', async () => {
    setNavigator({ userAgent: 'desktop' })
    const onClose = jest.fn()
    render(<ShareSheet payload={payload} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    // The shared `Sheet` runs its exit animation before handing back, so this
    // is not synchronous the way the hand-rolled one was.
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(propsFor('share_dismiss')).toMatchObject({ shared: false })
  })
})

/**
 * Which card the sheet opens on.
 *
 * While a draw is running the competition card is the one we want shared, and a
 * promotion that depends on somebody noticing a third tab is a promotion most
 * people never enter. So it comes first and it is preselected — but only until
 * the person picks for themselves, because a sheet that swaps the card under
 * somebody mid-choice is the sheet overruling them.
 */
function withCompetition(open: boolean) {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/competition/enter')) {
      return Promise.resolve({
        ok: true,
        json: async () => (open
          ? { state: 'open', prize: 'Win £200 of supplements', test: false }
          : { state: 'off' }),
      })
    }
    return Promise.resolve({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) })
  }) as unknown as typeof fetch
}

describe('which card it opens on', () => {
  it('offers the competition first and starts there', async () => {
    setNavigator({ userAgent: 'desktop' })
    withCompetition(true)
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /competition/i })).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getAllByRole('tab').map((t) => t.textContent))
      .toEqual(['Competition', 'My stack', 'Post'])
  })

  it('leaves the tab alone once somebody has picked one', async () => {
    // The competition answer lands a moment after the sheet opens. Somebody who
    // has already chosen "My stack" must not have it swapped underneath them.
    setNavigator({ userAgent: 'desktop' })
    let resolve: (v: unknown) => void = () => {}
    const pending = new Promise((r) => { resolve = r })
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/competition/enter')) return pending
      return Promise.resolve({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) })
    }) as unknown as typeof fetch

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(screen.getByRole('tab', { name: /post/i }))

    resolve({ ok: true, json: async () => ({ state: 'open', prize: 'Win £200', test: false }) })

    await waitFor(() => expect(screen.getByRole('tab', { name: /competition/i })).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: /post/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('is My stack, first and only, when no draw is running', async () => {
    setNavigator({ userAgent: 'desktop' })
    withCompetition(false)
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.getByRole('tab', { name: /my stack/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: /competition/i })).not.toBeInTheDocument()
  })
})

/**
 * What happens after it goes.
 *
 * The old sheet ended with a line of text and left entering the giveaway as an
 * accordion the person had to notice, open and fill in — the conversion-critical
 * step of the whole promotion, competing with the button beside it. Entering is
 * now the step that follows a share.
 */
describe('after a successful share', () => {
  function shareable(open: boolean) {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/competition/enter')) {
        return Promise.resolve({
          ok: true,
          json: async () => (open ? { state: 'open', prize: 'Win £200', test: false } : { state: 'off' }),
        })
      }
      return Promise.resolve({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) })
    }) as unknown as typeof fetch
  }

  it('asks for the handle, because posting alone does not enter you', async () => {
    shareable(true)
    setNavigator({ share: jest.fn().mockResolvedValue(undefined), canShare: () => true, userAgent: 'Android' })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await waitFor(() => expect(screen.getByRole('tab', { name: /competition/i })).toBeInTheDocument())
    await userEvent.click(primary())

    expect(await screen.findByText(/posting alone doesn’t enter you/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/instagram handle/i)).toBeInTheDocument()
  })

  it('does not ask for a handle when no draw is running', async () => {
    shareable(false)
    setNavigator({ share: jest.fn().mockResolvedValue(undefined), canShare: () => true, userAgent: 'Android' })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(primary())

    expect(await screen.findByText(/that’s away/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/handle/i)).not.toBeInTheDocument()
  })

  it('lets somebody go back and share another card', async () => {
    shareable(false)
    setNavigator({ share: jest.fn().mockResolvedValue(undefined), canShare: () => true, userAgent: 'Android' })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(primary())
    await screen.findByText(/that’s away/i)

    await userEvent.click(screen.getByRole('button', { name: /share another/i }))
    expect(await screen.findByRole('tab', { name: 'My stack' })).toBeInTheDocument()
  })
})

/**
 * The wait.
 *
 * The card is rasterised on the server — Satori laying out a 1080×1920 poster
 * and encoding a PNG — so there is a real second or two between opening the
 * sheet and seeing anything. A line of static text across that gap reads as a
 * stall, and somebody who thinks the sheet is broken does not share.
 */
describe('while the card is being built', () => {
  // The sheet is portalled to `document.body`, so the render container is empty
  // and everything has to be found on the document.
  const sheen = () => document.querySelector('.card-build-sheen')

  it('says so, to a screen reader as well as on screen', () => {
    setNavigator({ userAgent: 'desktop' })
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/building your card/i)
    expect(status).toHaveAttribute('aria-live', 'polite')
  })

  it('holds the card’s shape so the preview does not jump when it lands', () => {
    setNavigator({ userAgent: 'desktop' })
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)

    expect(sheen()).toBeInTheDocument()
    expect(document.querySelectorAll('.card-build-bar').length).toBeGreaterThan(6)
  })

  it('hides the skeleton once the card has loaded', async () => {
    setNavigator({ userAgent: 'desktop' })
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)

    const img = document.querySelector('img') as HTMLImageElement
    fireEvent.load(img)

    await waitFor(() => expect(sheen()).not.toBeInTheDocument())
    expect(screen.queryByText(/building your card/i)).not.toBeInTheDocument()
    expect(img).toHaveStyle({ opacity: '1' })
  })

  it('keeps the skeleton decorative — a reader wants the status, not the bars', () => {
    setNavigator({ userAgent: 'desktop' })
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    expect(sheen()?.closest('[aria-hidden="true"]')).toBeInTheDocument()
  })
})
