import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShareSheet } from '../ShareSheet'
import { sharePersonas } from '@/lib/share-card/personas'
import { track } from '@/lib/analytics/events'

jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }))

/**
 * The share sheet.
 *
 * What matters here is not that the buttons render — it is that every rung of
 * the ladder is *visible* when it is reached. There is no way to post to
 * Instagram Stories from mobile web, so the card reaches a story through the OS
 * share sheet, and on a device that cannot do that it falls to a download and
 * then to press-and-hold. A rung that fails silently leaves someone pressing a
 * button that appears dead, and it reads in the funnel as disinterest.
 */

const payload = sharePersonas()[0].payload
const events = () => (track as jest.Mock).mock.calls.map(([name]) => name)
const propsFor = (name: string) =>
  (track as jest.Mock).mock.calls.find(([e]) => e === name)?.[1]

const originalNavigator = globalThis.navigator

function setNavigator(value: Partial<Navigator>) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })
}

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
    expect(screen.getByRole('img', { name: /story size/i })).toBeInTheDocument()
  })

  it('says what the card does not contain', () => {
    // The one line on this sheet that is not about sharing. A card is a public
    // URL with no expiry, and this is where someone finds out what is on it.
    setNavigator({ userAgent: 'desktop' })
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    expect(screen.getByText(/never shows your price/i)).toBeInTheDocument()
  })
})

describe('the ladder', () => {
  it('goes to the OS sheet when the browser can take a file', async () => {
    const share = jest.fn().mockResolvedValue(undefined)
    setNavigator({ share, canShare: () => true, userAgent: 'Android Chrome' })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(propsFor('share_method')).toMatchObject({ method: 'native-file' }))
    expect(share).toHaveBeenCalled()
    expect(await screen.findByText(/opening your share sheet/i)).toBeInTheDocument()
  })

  it('shows the press-and-hold instruction when nothing else works', async () => {
    // iOS Safari, where `download` on a blob URL is ignored. Without this the
    // button genuinely does nothing.
    setNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1' })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    expect(await screen.findByText(/press and hold the card/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /press and hold to save/i })).toBeInTheDocument()
  })

  it('falls back to the link when the card cannot be built', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } as unknown as Clipboard, userAgent: 'desktop' })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(events()).toContain('share_error'))
    expect(propsFor('share_error')).toMatchObject({ at: 'render' })
    expect(await screen.findByText(/link copied/i)).toBeInTheDocument()
  })

  it('returns to idle when the customer dismisses the OS sheet', async () => {
    // An AbortError is someone saying no. The sheet must not then hand them a
    // download, and must not report a share.
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    setNavigator({ share: jest.fn().mockRejectedValue(abort), canShare: () => true, userAgent: 'iPhone' })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled())
    expect(events()).not.toContain('share_method')
  })
})

describe('copy link', () => {
  it('records the rung it completed on', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } as unknown as Clipboard, userAgent: 'desktop' })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /copy link/i }))

    await waitFor(() => expect(propsFor('share_method')).toMatchObject({ method: 'copy-link' }))
    expect(writeText.mock.calls[0][0]).toContain('ref=SARAH20')
  })

  it('says so when the clipboard refuses rather than looking successful', async () => {
    setNavigator({
      clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } as unknown as Clipboard,
      userAgent: 'desktop',
    })

    render(<ShareSheet payload={payload} onClose={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /copy link/i }))

    expect(await screen.findByText(/could not copy/i)).toBeInTheDocument()
    expect(propsFor('share_error')).toMatchObject({ at: 'clipboard' })
  })
})

describe('format', () => {
  it('switches size and reports the change', async () => {
    setNavigator({ userAgent: 'desktop' })
    render(<ShareSheet payload={payload} onClose={jest.fn()} />)

    await userEvent.click(screen.getByRole('tab', { name: 'Post' }))

    expect(propsFor('share_format')).toMatchObject({ from: 'story', to: 'square' })
    expect(screen.getByRole('img', { name: /post size/i })).toBeInTheDocument()
  })
})

describe('closing', () => {
  it('reports whether anything was shared', async () => {
    setNavigator({ userAgent: 'desktop' })
    const onClose = jest.fn()
    render(<ShareSheet payload={payload} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalled()
    expect(propsFor('share_dismiss')).toMatchObject({ shared: false })
  })
})
