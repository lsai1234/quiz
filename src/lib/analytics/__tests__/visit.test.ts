import { buildVisitContext, classifySource, parseUserAgent, sanitiseVisitContext } from '../visit'

/**
 * Where a visit came from and what it was on — the buckets every breakdown on
 * the Analytics page is drawn from. Real user-agent strings, because the
 * failure this guards against is a real one: an in-app browser read as Safari
 * turns "Instagram traffic leaves at the reveal" into "Safari users leave at
 * the reveal", which sends somebody off to fix the wrong thing.
 */

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.29.84 (iPhone15,3; iOS 18_5; en_GB; en; scale=3.00; 1290x2796; 761487349)',
  iphoneTikTok:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_39.6.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/GB',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
  androidFacebook:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.7204.63 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/520.0.0.47.73;]',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  cubot:
    'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0',
  googlebot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/138.0.7204.183 Safari/537.36',
  headless:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36',
}

describe('parseUserAgent', () => {
  it.each([
    ['iphoneSafari', 'mobile', 'iOS', 'Safari'],
    ['iphoneInstagram', 'mobile', 'iOS', 'Instagram app'],
    ['iphoneTikTok', 'mobile', 'iOS', 'TikTok app'],
    ['iphoneChrome', 'mobile', 'iOS', 'Chrome'],
    ['androidChrome', 'mobile', 'Android', 'Chrome'],
    ['androidFacebook', 'mobile', 'Android', 'Facebook app'],
    ['androidSamsung', 'mobile', 'Android', 'Samsung Internet'],
    ['androidTablet', 'tablet', 'Android', 'Chrome'],
    ['cubot', 'mobile', 'Android', 'Chrome'],
    ['macSafari', 'desktop', 'macOS', 'Safari'],
    ['windowsEdge', 'desktop', 'Windows', 'Edge'],
  ] as const)('reads %s as %s / %s / %s', (key, device, os, browser) => {
    expect(parseUserAgent(UA[key])).toEqual({ device, os, browser, bot: false })
  })

  it('tells an iPad asking for the desktop site from a Mac by its touch points', () => {
    expect(parseUserAgent(UA.macSafari, 5)).toMatchObject({ device: 'tablet', os: 'iPadOS' })
    expect(parseUserAgent(UA.macSafari, 0)).toMatchObject({ device: 'desktop', os: 'macOS' })
  })

  it('names crawlers and headless browsers as bots, so they are never counted', () => {
    expect(parseUserAgent(UA.googlebot).bot).toBe(true)
    expect(parseUserAgent(UA.headless).bot).toBe(true)
    // …but a phone whose maker's name ends in "bot" is a phone.
    expect(parseUserAgent(UA.cubot).bot).toBe(false)
  })

  it('reports nothing rather than guessing when there is no user agent', () => {
    expect(parseUserAgent(null)).toEqual({ device: null, os: null, browser: null, bot: false })
  })
})

describe('buildVisitContext', () => {
  it('keeps the campaign tags, the landing path and the referring host — never its path', () => {
    const ctx = buildVisitContext({
      href: 'https://chrgd.co.uk/?utm_source=Instagram&utm_medium=Paid_Social&utm_campaign=Launch%20Week',
      referrer: 'https://www.google.com/search?q=private+thing',
      maxTouchPoints: 5,
    })
    expect(ctx).toEqual({
      land: '/',
      utm_source: 'instagram',
      utm_medium: 'paid_social',
      utm_campaign: 'Launch Week',
      ref: 'www.google.com',
      touch: 5,
    })
  })

  it('ignores a referrer that is our own site', () => {
    expect(buildVisitContext({ href: 'https://chrgd.co.uk/shop', referrer: 'https://chrgd.co.uk/' }).ref).toBeUndefined()
  })

  it('records which ad platform tagged the link, not the click id itself', () => {
    const ctx = buildVisitContext({ href: 'https://chrgd.co.uk/?fbclid=IwAR123secret', referrer: '' })
    expect(ctx.click).toBe('meta')
    expect(JSON.stringify(ctx)).not.toContain('IwAR123secret')
  })

  it('picks up a partner code from ?ref=', () => {
    expect(buildVisitContext({ href: 'https://chrgd.co.uk/?ref=sarah20', referrer: '' }).partner).toBe('SARAH20')
  })
})

describe('sanitiseVisitContext', () => {
  it('drops anything that is not the expected shape', () => {
    expect(sanitiseVisitContext({ ref: 42, click: 'myspace', partner: 'no spaces allowed', touch: 'many', utm_source: 'X'.repeat(500) })).toEqual({
      utm_source: 'x'.repeat(80),
    })
    expect(sanitiseVisitContext('nonsense')).toEqual({})
  })
})

describe('classifySource', () => {
  it('credits a partner link first', () => {
    expect(classifySource({ partner: 'SARAH20', utm_source: 'instagram' }, 'Instagram app')).toEqual({
      source: 'Partner link',
      channel: 'Partner',
      campaign: 'SARAH20',
    })
  })

  it('reads campaign tags, and a paid medium as paid', () => {
    expect(classifySource({ utm_source: 'ig', utm_medium: 'paid', utm_campaign: 'launch' }, null)).toEqual({
      source: 'Instagram',
      channel: 'Paid',
      campaign: 'launch',
    })
    expect(classifySource({ utm_source: 'newsletter', utm_medium: 'email' }, null).channel).toBe('Email')
  })

  it('treats fbclid as Meta but not as proof of an ad, and uses the app to say which', () => {
    expect(classifySource({ click: 'meta' }, 'Instagram app')).toEqual({ source: 'Instagram', channel: 'Social', campaign: null })
    expect(classifySource({ click: 'meta' }, 'Safari')).toEqual({ source: 'Facebook', channel: 'Social', campaign: null })
    expect(classifySource({ click: 'google' }, 'Chrome')).toEqual({ source: 'Google', channel: 'Paid', campaign: null })
  })

  it('names Instagram from its in-app browser when it sent no referrer at all', () => {
    expect(classifySource({ land: '/' }, 'Instagram app')).toEqual({ source: 'Instagram', channel: 'Social', campaign: null })
  })

  it('classifies referring sites', () => {
    expect(classifySource({ ref: 'www.google.co.uk' }, 'Chrome')).toMatchObject({ source: 'Google', channel: 'Search' })
    expect(classifySource({ ref: 'l.instagram.com' }, 'Safari')).toMatchObject({ source: 'Instagram', channel: 'Social' })
    expect(classifySource({ ref: 'www.someblog.com' }, 'Safari')).toMatchObject({ source: 'someblog.com', channel: 'Referral' })
  })

  it('knows a shared stack card from a direct visit', () => {
    expect(classifySource({ land: '/s/abc123' }, 'Safari')).toMatchObject({ source: 'Shared stack', channel: 'Shared stack' })
    expect(classifySource({ land: '/' }, 'Safari')).toEqual({ source: 'Direct', channel: 'Direct', campaign: null })
  })
})
