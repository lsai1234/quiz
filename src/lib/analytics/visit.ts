/**
 * Who a visit is, in the coarse terms a funnel can be segmented by — without
 * knowing who the visitor is.
 *
 * Two halves, both pure so they are testable without a browser or a request:
 *
 *   • `buildVisitContext` runs in the browser ONCE per visit, on the page the
 *     visit began on. It is the only moment the referrer and the campaign tags
 *     mean anything: by the second page `document.referrer` is our own site and
 *     the `utm_*` parameters are gone from the URL. The result rides on every
 *     beacon for the rest of the visit, so whichever beacon reaches the server
 *     first can describe the visit, and a lost first beacon loses nothing.
 *
 *   • `parseUserAgent` and `classifySource` run on the server, from the request
 *     the beacon arrived on and the context it carried.
 *
 * ── What this deliberately does not keep ────────────────────────────────────
 * The full referrer URL (a search engine's can carry the query), the user agent
 * string itself (which is a fingerprinting input), the IP address (only the
 * country the platform derived from it), screen dimensions, and any identifier
 * that outlives the tab. What survives is a handful of buckets — "mobile",
 * "iOS", "Instagram app", "GB" — that thousands of visitors share.
 */

/** What the browser reports about how this visit began. Every field optional: old clients send none. */
export interface VisitContext {
  /** Referring site's hostname, when it was not us. Never the path or query. */
  ref?: string
  /** The path the visit landed on. */
  land?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  /** An ad platform's click id was on the landing URL — which platform, not the id. */
  click?: 'meta' | 'google' | 'tiktok'
  /** A partner's `?ref=` code, which is already public (it is printed on their posts). */
  partner?: string
  /** `navigator.maxTouchPoints` — the one way to tell an iPad from a Mac. */
  touch?: number
}

const clip = (v: string | null | undefined, n = 80): string | undefined => {
  const t = v?.trim()
  return t ? t.slice(0, n) : undefined
}

/**
 * The visit's context, from where the browser is when the visit starts.
 *
 * @param href     `location.href` of the first page.
 * @param referrer `document.referrer` on the first page.
 */
export function buildVisitContext(input: { href: string; referrer: string; maxTouchPoints?: number }): VisitContext {
  const ctx: VisitContext = {}
  let url: URL | null = null
  try {
    url = new URL(input.href)
  } catch {
    /* not a URL we can read — the context is just emptier */
  }

  if (url) {
    ctx.land = clip(url.pathname, 120)
    const q = url.searchParams
    ctx.utm_source = clip(q.get('utm_source'))?.toLowerCase()
    ctx.utm_medium = clip(q.get('utm_medium'))?.toLowerCase()
    ctx.utm_campaign = clip(q.get('utm_campaign'))
    if (q.has('fbclid')) ctx.click = 'meta'
    else if (q.has('gclid') || q.has('gbraid') || q.has('wbraid')) ctx.click = 'google'
    else if (q.has('ttclid')) ctx.click = 'tiktok'
    const partner = q.get('ref')
    if (partner && /^[A-Za-z0-9_-]{2,40}$/.test(partner)) ctx.partner = partner.toUpperCase()
  }

  if (input.referrer) {
    try {
      const host = new URL(input.referrer).hostname.toLowerCase()
      if (host && (!url || host !== url.hostname.toLowerCase())) ctx.ref = host.slice(0, 120)
    } catch {
      /* an unreadable referrer is no referrer */
    }
  }

  if (typeof input.maxTouchPoints === 'number' && Number.isFinite(input.maxTouchPoints)) {
    ctx.touch = Math.max(0, Math.min(20, Math.round(input.maxTouchPoints)))
  }

  for (const k of Object.keys(ctx) as (keyof VisitContext)[]) {
    if (ctx[k] === undefined) delete ctx[k]
  }
  return ctx
}

/** Whatever arrived over the wire, narrowed to a `VisitContext` — never trust a beacon's shape. */
export function sanitiseVisitContext(raw: unknown): VisitContext {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const str = (k: string, n = 80) => (typeof r[k] === 'string' ? clip(r[k] as string, n) : undefined)
  const ctx: VisitContext = {
    ref: str('ref', 120)?.toLowerCase(),
    land: str('land', 120),
    utm_source: str('utm_source')?.toLowerCase(),
    utm_medium: str('utm_medium')?.toLowerCase(),
    utm_campaign: str('utm_campaign'),
    click: r.click === 'meta' || r.click === 'google' || r.click === 'tiktok' ? r.click : undefined,
    partner: typeof r.partner === 'string' && /^[A-Za-z0-9_-]{2,40}$/.test(r.partner) ? r.partner.toUpperCase() : undefined,
    touch: typeof r.touch === 'number' && Number.isFinite(r.touch) ? Math.max(0, Math.min(20, Math.round(r.touch))) : undefined,
  }
  for (const k of Object.keys(ctx) as (keyof VisitContext)[]) {
    if (ctx[k] === undefined) delete ctx[k]
  }
  return ctx
}

// ─── The device ─────────────────────────────────────────────────────────────

export type DeviceType = 'mobile' | 'tablet' | 'desktop'

export interface DeviceInfo {
  device: DeviceType | null
  os: string | null
  browser: string | null
  /** A crawler, a link previewer or a headless browser. Not a visitor. */
  bot: boolean
}

/**
 * Things that run JavaScript and fire beacons without being anybody.
 *
 * Googlebot renders pages, and a rendered landing page sends a page view — so
 * an unfiltered "landing views" figure counts the crawl schedule as traffic.
 * Headless browsers are here for the same reason: an uptime check or a test run
 * is not a visit.
 */
const BOT = /[a-z]bot\/|\bbot\b|crawl|spider|slurp|facebookexternalhit|meta-externalagent|headless|lighthouse|pagespeed|chrome-lighthouse|preview|python-|curl\/|wget\/|httpclient|axios\/|node-fetch|undici|go-http-client|phantomjs|puppeteer|playwright|selenium|uptime|pingdom|statuscake/i

/**
 * The visitor's device, OS and browser, from the user-agent string.
 *
 * In-app browsers are checked first and named as apps, because that is the
 * fact that matters most for this business: nearly all of its traffic is going
 * to arrive from an Instagram or TikTok post, and those apps open links in their
 * own web views — with their own storage, their own quirks, and a habit of
 * being closed with a swipe. A funnel that cannot separate "Instagram's browser"
 * from "Safari" cannot tell an ad problem from a web-view problem.
 *
 * @param touch `navigator.maxTouchPoints` from the visit context. iPadOS asks
 *              for desktop sites by default and sends a Mac user agent; touch
 *              points are the only way to tell it from a laptop.
 */
export function parseUserAgent(ua: string | null | undefined, touch?: number): DeviceInfo {
  if (!ua) return { device: null, os: null, browser: null, bot: false }
  if (BOT.test(ua)) return { device: null, os: null, browser: null, bot: true }

  let os: string
  let device: DeviceType
  if (/iPhone|iPod/.test(ua)) {
    os = 'iOS'
    device = 'mobile'
  } else if (/iPad/.test(ua)) {
    os = 'iPadOS'
    device = 'tablet'
  } else if (/Android/.test(ua)) {
    os = 'Android'
    device = /Mobile/.test(ua) ? 'mobile' : 'tablet'
  } else if (/Windows NT/.test(ua)) {
    os = 'Windows'
    device = 'desktop'
  } else if (/CrOS/.test(ua)) {
    os = 'ChromeOS'
    device = 'desktop'
  } else if (/Macintosh|Mac OS X/.test(ua)) {
    if ((touch ?? 0) > 1) {
      os = 'iPadOS'
      device = 'tablet'
    } else {
      os = 'macOS'
      device = 'desktop'
    }
  } else if (/Linux/.test(ua)) {
    os = 'Linux'
    device = 'desktop'
  } else {
    os = 'Other'
    device = /Mobi/.test(ua) ? 'mobile' : 'desktop'
  }

  return { device, os, browser: browserOf(ua, os), bot: false }
}

function browserOf(ua: string, os: string): string {
  // In-app web views first: they all ALSO claim to be Safari or Chrome.
  if (/Instagram/.test(ua)) return 'Instagram app'
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A|\[FB/.test(ua)) return 'Facebook app'
  if (/musical_ly|TikTok|BytedanceWebview|trill_/i.test(ua)) return 'TikTok app'
  if (/Snapchat/.test(ua)) return 'Snapchat app'
  if (/Pinterest/.test(ua)) return 'Pinterest app'
  if (/LinkedInApp/.test(ua)) return 'LinkedIn app'
  if (/Twitter/.test(ua)) return 'X app'
  if (/\bGSA\//.test(ua)) return 'Google app'
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet'
  if (/Edg(e|A|iOS)?\//.test(ua)) return 'Edge'
  if (/OPR\/|OPiOS|Opera/.test(ua)) return 'Opera'
  if (/Firefox\/|FxiOS/.test(ua)) return 'Firefox'
  if (/CriOS|Chrome\//.test(ua)) return /; wv\)/.test(ua) ? 'In-app (other)' : 'Chrome'
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari'
  // An iOS web view drops the Safari token; an app opened the link itself.
  if (os === 'iOS' || os === 'iPadOS') return 'In-app (other)'
  return 'Other'
}

// ─── Where the visit came from ──────────────────────────────────────────────

/** How a visit arrived, coarsely. Answers "which kind of effort is working?". */
export type Channel = 'Paid' | 'Social' | 'Search' | 'Partner' | 'Shared stack' | 'Email' | 'Referral' | 'Direct'

export interface Source {
  /** The platform or site: "Instagram", "Google", "Direct". */
  source: string
  channel: Channel
  /** `utm_campaign`, or the partner code. */
  campaign: string | null
}

const SOCIAL = new Set(['Instagram', 'Facebook', 'TikTok', 'X', 'YouTube', 'Pinterest', 'Snapchat', 'LinkedIn', 'Reddit', 'Threads', 'WhatsApp'])
const SEARCH = new Set(['Google', 'Bing', 'DuckDuckGo', 'Yahoo', 'Ecosia'])

/** A utm_source value or a hostname, as a platform name. */
function platformOf(raw: string): string | null {
  const s = raw.toLowerCase()
  if (/(^|\.)(instagram\.com|l\.instagram\.com)$|^ig$|^insta(gram)?/.test(s)) return 'Instagram'
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$|^fb$|^facebook|^meta$/.test(s)) return 'Facebook'
  if (/(^|\.)threads\.net$|^threads/.test(s)) return 'Threads'
  if (/(^|\.)tiktok\.com$|^tiktok|^tt$/.test(s)) return 'TikTok'
  if (/(^|\.)(t\.co|twitter\.com|x\.com)$|^twitter|^x$/.test(s)) return 'X'
  if (/(^|\.)(youtube\.com|youtu\.be)$|^youtube|^yt$/.test(s)) return 'YouTube'
  if (/(^|\.)pinterest\.[a-z.]+$|^pin\.it$|^pinterest/.test(s)) return 'Pinterest'
  if (/(^|\.)snapchat\.com$|^snapchat|^snap$/.test(s)) return 'Snapchat'
  if (/(^|\.)(linkedin\.com|lnkd\.in)$|^linkedin/.test(s)) return 'LinkedIn'
  if (/(^|\.)reddit\.com$|^reddit/.test(s)) return 'Reddit'
  if (/(^|\.)(whatsapp\.com|wa\.me)$|^whatsapp/.test(s)) return 'WhatsApp'
  if (/(^|\.)google\.[a-z.]+$|^google|^adwords/.test(s)) return 'Google'
  if (/(^|\.)bing\.com$|^bing/.test(s)) return 'Bing'
  if (/(^|\.)duckduckgo\.com$|^duckduckgo|^ddg$/.test(s)) return 'DuckDuckGo'
  if (/(^|\.)yahoo\.[a-z.]+$|^yahoo/.test(s)) return 'Yahoo'
  if (/(^|\.)ecosia\.org$/.test(s)) return 'Ecosia'
  if (/(^|\.)linktr\.ee$|^linktree/.test(s)) return 'Linktree'
  if (/mail|newsletter|klaviyo|mailchimp/.test(s)) return 'Email'
  return null
}

const APP_PLATFORM: Record<string, string> = {
  'Instagram app': 'Instagram',
  'Facebook app': 'Facebook',
  'TikTok app': 'TikTok',
  'Snapchat app': 'Snapchat',
  'Pinterest app': 'Pinterest',
  'LinkedIn app': 'LinkedIn',
  'X app': 'X',
}

function channelOf(platform: string): Channel {
  if (platform === 'Email') return 'Email'
  if (SOCIAL.has(platform)) return 'Social'
  if (SEARCH.has(platform)) return 'Search'
  return 'Referral'
}

const PAID_MEDIUM = /cpc|ppc|paid|^ads?$|display|cpm|cpv|sponsored|boost/

/**
 * Where a visit came from, in priority order: a partner's code, explicit
 * campaign tags, an ad platform's click id, the referring site, the app whose
 * browser opened the link, a shared stack card — and only then "Direct".
 *
 * Instagram is the case all of this is shaped around. Its in-app browser
 * usually sends no referrer at all, so a story link with no tags would read as
 * "Direct" from the referrer alone; the user agent is what names it. And
 * `fbclid` rides on every outbound Meta link, organic or paid, so on its own it
 * says "Meta", not "an ad" — only `utm_medium` or a Google/TikTok click id is
 * taken as proof of paid.
 */
export function classifySource(ctx: VisitContext, browser: string | null): Source {
  const app = browser ? APP_PLATFORM[browser] ?? null : null

  if (ctx.partner) return { source: 'Partner link', channel: 'Partner', campaign: ctx.partner }

  if (ctx.utm_source) {
    const platform = platformOf(ctx.utm_source) ?? titleCase(ctx.utm_source)
    const medium = ctx.utm_medium ?? ''
    const channel: Channel = PAID_MEDIUM.test(medium) || ctx.click === 'google' || ctx.click === 'tiktok'
      ? 'Paid'
      : /e-?mail/.test(medium) ? 'Email' : channelOf(platform)
    return { source: platform, channel, campaign: ctx.utm_campaign ?? null }
  }

  if (ctx.click === 'google') return { source: 'Google', channel: 'Paid', campaign: null }
  if (ctx.click === 'tiktok') return { source: 'TikTok', channel: 'Paid', campaign: null }
  if (ctx.click === 'meta') {
    const platform = app === 'Instagram' || ctx.ref?.includes('instagram') ? 'Instagram' : 'Facebook'
    return { source: platform, channel: 'Social', campaign: null }
  }

  if (ctx.ref) {
    const platform = platformOf(ctx.ref)
    if (platform) return { source: platform, channel: channelOf(platform), campaign: null }
    return { source: ctx.ref.replace(/^www\./, ''), channel: 'Referral', campaign: null }
  }

  if (app) return { source: app, channel: 'Social', campaign: null }

  if (ctx.land?.startsWith('/s/')) return { source: 'Shared stack', channel: 'Shared stack', campaign: null }

  return { source: 'Direct', channel: 'Direct', campaign: null }
}

function titleCase(s: string): string {
  return s.slice(0, 40).replace(/(^|[\s_-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase())
}
