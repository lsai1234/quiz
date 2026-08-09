import type { MetadataRoute } from 'next'

const BASE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://getchrgd.co.uk').replace(/\/$/, '')

/**
 * The quiz, shop and bundle pages are the whole point of the site being on the
 * apex domain — everything else is signed-in surface with nothing for a crawler
 * to index: /myhub is a member's own subscription, /founderhub is the business.
 * Order confirmations already send `X-Robots-Tag: noindex` (see next.config.ts);
 * this keeps them out of the crawl in the first place.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/myhub', '/founderhub', '/order/', '/api/'] }],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  }
}
