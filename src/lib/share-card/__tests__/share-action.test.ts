import { shareCard, copyLink, canShareFiles, isIosSafari } from '../share-action'

/**
 * The share ladder.
 *
 * This is the part of the feature most likely to fail on a real device and least
 * likely to be noticed: every rung falls to the next one, so a browser that
 * cannot do file sharing still ends up somewhere — and a bug here looks exactly
 * like a customer changing their mind. The assertions are about *which* rung
 * carried it, because that is what the analytics have to be able to say.
 */

const blob = () => new Blob(['x'], { type: 'image/png' })

const req = () => ({
  blob: blob(),
  fileName: 'chrgd-iron-foundations-story.png',
  text: 'My CHRGD stack: Iron Foundations.',
  url: 'https://getchrgd.co.uk/?d=abc',
  format: 'story' as const,
})

const originalNavigator = globalThis.navigator

function setNavigator(value: Partial<Navigator>) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })
}

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator, configurable: true, writable: true,
  })
})

describe('the ladder', () => {
  it('hands the file to the OS sheet when it can', async () => {
    const share = jest.fn().mockResolvedValue(undefined)
    setNavigator({ share, canShare: () => true, userAgent: 'Android Chrome' })

    const out = await shareCard(req(), () => true)

    expect(out).toMatchObject({ ok: true, method: 'native-file', cancelled: false })
    expect(share).toHaveBeenCalledTimes(1)
    expect(share.mock.calls[0][0].files[0].name).toBe('chrgd-iron-foundations-story.png')
  })

  it('falls to sharing the link when files are not supported', async () => {
    // Some browsers implement share() but not canShare({ files }). The link
    // still unfurls as the card, so this is a worse rung rather than a failure.
    const share = jest.fn().mockResolvedValue(undefined)
    setNavigator({ share, canShare: () => false, userAgent: 'Android Chrome' })

    const out = await shareCard(req(), () => true)

    expect(out).toMatchObject({ ok: true, method: 'native-link' })
    expect(out.failures).toEqual([{ at: 'share-unavailable' }])
    expect(share.mock.calls[0][0].files).toBeUndefined()
  })

  it('falls to a download when the browser cannot share at all', async () => {
    setNavigator({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome' })
    const download = jest.fn().mockReturnValue(true)

    const out = await shareCard(req(), download)

    expect(out).toMatchObject({ ok: true, method: 'download' })
    expect(download).toHaveBeenCalledWith(expect.any(Blob), 'chrgd-iron-foundations-story.png')
  })

  it('ends on the long-press rung when even the download is refused', async () => {
    // iOS Safari ignores `download` on a blob URL. Reporting success here would
    // leave the customer looking at a button that did nothing.
    setNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari' })

    const out = await shareCard(req(), () => false)

    expect(out).toMatchObject({ ok: false, method: null, cancelled: false })
    expect(out.failures.map((f) => f.at)).toContain('download-blocked')
  })

  it('records every rung it had to skip', async () => {
    setNavigator({
      share: jest.fn().mockRejectedValue(new Error('NotAllowedError: needs a gesture')),
      canShare: () => true,
      userAgent: 'Android Chrome',
    })

    const out = await shareCard(req(), () => true)

    expect(out.method).toBe('download')
    expect(out.failures.map((f) => f.at)).toEqual(['share-failed', 'share-failed'])
  })
})

describe('cancelling', () => {
  it('is not a failure and does not fall through to a download', async () => {
    // `navigator.share()` rejects with AbortError when the sheet is dismissed.
    // Treating that as a failed rung hands a file to someone who just said no.
    const abort = Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' })
    setNavigator({ share: jest.fn().mockRejectedValue(abort), canShare: () => true, userAgent: 'iPhone Safari' })
    const download = jest.fn().mockReturnValue(true)

    const out = await shareCard(req(), download)

    expect(out).toMatchObject({ ok: false, method: null, cancelled: true })
    expect(download).not.toHaveBeenCalled()
  })
})

describe('canShareFiles', () => {
  it('is false when the API is absent', () => {
    setNavigator({ userAgent: 'old browser' })
    expect(canShareFiles(new File([], 'a.png'))).toBe(false)
  })

  it('defers to canShare rather than assuming', () => {
    setNavigator({ share: jest.fn(), canShare: () => false, userAgent: 'x' })
    expect(canShareFiles(new File([], 'a.png'))).toBe(false)
  })
})

describe('isIosSafari', () => {
  it('catches every browser on iOS, not only Safari', () => {
    // Chrome and Firefox on iOS are WebKit with the same download behaviour, so
    // sniffing for "Safari" alone sends them down a rung that does not work.
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120 Mobile',
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) FxiOS/120',
    ]) {
      setNavigator({ userAgent: ua })
      expect(isIosSafari()).toBe(true)
    }
  })

  it('is false on desktop', () => {
    setNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120', maxTouchPoints: 0 })
    expect(isIosSafari()).toBe(false)
  })
})

describe('copyLink', () => {
  it('reports success', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } as unknown as Clipboard, userAgent: 'x' })
    await expect(copyLink('https://getchrgd.co.uk/?d=abc')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('https://getchrgd.co.uk/?d=abc')
  })

  it('reports failure rather than throwing', async () => {
    // Clipboard writes reject without a user gesture, and in an insecure
    // context there is no `navigator.clipboard` at all. Neither may take the
    // share sheet down with it.
    setNavigator({ clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } as unknown as Clipboard, userAgent: 'x' })
    await expect(copyLink('x')).resolves.toBe(false)

    setNavigator({ userAgent: 'x' })
    await expect(copyLink('x')).resolves.toBe(false)
  })
})
