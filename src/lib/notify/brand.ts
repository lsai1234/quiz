/**
 * The house style for every email — masthead, body, marketing strip, footer.
 *
 * One shell, used by every template, so a new email cannot drift away from the
 * others by being written on a different day. Templates supply words and, where
 * there is one, a receipt; everything around them is decided here.
 *
 * The structure is the ordinary shape of a commercial email, and each band is
 * doing a job:
 *
 *   ┌ masthead ─── dark, wordmark, accent hairline. Says who this is from
 *   │              before a single word is read.
 *   ├ body ─────── white card. The transactional content: what happened, the
 *   │              receipt, and the one thing to do about it.
 *   ├ marketing ── the promotional strip. Present only when the reader has not
 *   │              opted out, and never above the content they were sent for.
 *   └ footer ───── dark. Who we legally are, where to reach us, and the opt-out.
 *
 * Three constraints run through all of it, and they are the reason it does not
 * look like the website's markup:
 *
 *  1. **Tables and inline styles.** Outlook renders through Word; Gmail strips
 *     `<style>` blocks in several clients. Anything expressed as a class or a
 *     flexbox is a thing that vanishes for a large minority of readers.
 *  2. **No external assets.** No image host, no web font. The wordmark is set in
 *     type and the accent is a coloured cell, so nothing depends on a reader
 *     choosing to load remote images — which most do not, by default.
 *  3. **Explicit colours on explicit backgrounds.** Every cell that carries text
 *     states both, so a client's dark mode cannot leave dark text on the dark
 *     background it just substituted.
 */
import { LEGAL_ENTITY } from '@/lib/legal/content'
import { ACCENT } from '@/lib/ui/tokens'
import { escapeHtml, receiptEmailHtml, receiptText } from './receipt-email'
import type { ReceiptData } from '@/lib/receipt/types'

const INK_DARK = '#0a0a0c'
const INK_DARK_2 = '#141418'
const PAPER = '#ffffff'
const PAGE = '#eef0f2'
const TEXT = '#18181b'
const TEXT_SOFT = '#52525b'
const TEXT_FAINT = '#a1a1aa'
const HAIRLINE = '#e4e4e7'

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export interface EmailLinks {
  /** Absolute origin, e.g. `https://getchrgd.co.uk`. */
  base: string
  /** The opt-out link for the marketing strip. Its absence hides the strip. */
  optOutUrl?: string | null
}

export interface MarketingBlock {
  eyebrow: string
  heading: string
  points: string[]
  cta: { label: string; url: string }
}

export interface ShellInput {
  /** The line clients show next to the subject in the inbox list. */
  preheader: string
  heading: string
  /** Sits under the heading, before anything else. Optional. */
  intro?: string
  paragraphs: string[]
  /** The printed receipt, when this email has one. */
  receipt?: ReceiptData | null
  cta?: { label: string; url: string }
  /** Small print under the button. */
  footnote?: string
  /** A second, quieter link under the button — "or view your plan". */
  secondaryCta?: { label: string; url: string }
  links: EmailLinks
  /** Omitted when the reader has opted out, or when the email is unsuitable. */
  marketing?: MarketingBlock | null
}

/**
 * Who is reading, which decides what there is left to sell them.
 *
 * `prospect` covers anyone without a running plan — a one-off buyer, someone
 * whose plan has ended. `member` is someone already subscribed, and the pitch
 * has to change completely for them: telling a subscriber to take the quiz they
 * took last week is the fastest way to make a promotional block read as
 * something nobody looked at.
 */
export type MarketingAudience = 'prospect' | 'member'

/**
 * The default promotional strip.
 *
 * Kept short and factual on purpose. A receipt is the email with the highest
 * open rate a business ever sends, and the temptation is to fill the rest of it
 * — which is exactly how a receipt stops being read. Three lines and one button.
 */
export function defaultMarketing(base: string, audience: MarketingAudience = 'prospect'): MarketingBlock {
  if (audience === 'member') {
    return {
      eyebrow: 'Getting the most from it',
      heading: 'Your plan is yours to move around',
      points: [
        'Swap any product for another, any month, and your monthly re-prices itself before you confirm it.',
        'Going away, or stocked up already? Skip a delivery and the payment moves with it — nothing is wasted.',
        'Add a one-off to your next box from the shop, and it ships with your plan instead of on its own postage.',
      ],
      cta: { label: 'Browse the shop', url: `${base}/shop` },
    }
  }

  return {
    eyebrow: 'While you are here',
    heading: 'Built round what you are actually training for',
    points: [
      'A two-minute quiz builds a stack from your goal, your training week and your budget — not from whatever is on offer.',
      'One box, one payment, on your own rhythm. Monthly, or every other month for the things that last.',
      'Swap, pause or cancel any of it yourself, any time, from your hub. No email to write and nobody to ask.',
    ],
    cta: { label: 'Take the quiz', url: `${base}/` },
  }
}

function button(label: string, url: string): string {
  // A table-wrapped anchor rather than a styled link: Outlook ignores padding on
  // inline elements, so an unwrapped button arrives as underlined blue text.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>
    <td align="center" bgcolor="${ACCENT}" style="background:${ACCENT};border-radius:12px">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:14px;font-weight:700;color:#001018;text-decoration:none;border-radius:12px">${escapeHtml(label)}</a>
    </td>
  </tr></table>`
}

function band(background: string, inner: string, padding = '28px 32px'): string {
  return `<tr><td bgcolor="${background}" style="background:${background};padding:${padding}">${inner}</td></tr>`
}

function masthead(base: string): string {
  return `${band(
    INK_DARK,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
      <tr>
        <td style="font-family:${SANS};font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#ffffff">
          <a href="${escapeHtml(base)}" style="color:#ffffff;text-decoration:none">get<span style="color:${ACCENT}">CHRGD</span></a>
        </td>
        <td align="right" style="font-family:${SANS};font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:${TEXT_FAINT}">
          Performance stacks
        </td>
      </tr>
    </table>`,
    '22px 32px',
  )}
  <tr><td bgcolor="${ACCENT}" style="background:${ACCENT};height:3px;font-size:0;line-height:0">&nbsp;</td></tr>`
}

function marketingBand(block: MarketingBlock): string {
  const points = block.points
    .map(
      (point) => `<tr>
      <td valign="top" width="14" style="padding:0 10px 10px 0"><div style="width:6px;height:6px;border-radius:3px;background:${ACCENT};margin-top:6px;font-size:0;line-height:0">&nbsp;</div></td>
      <td valign="top" style="padding:0 0 10px;font-family:${SANS};font-size:13px;line-height:1.55;color:#d4d4d8">${escapeHtml(point)}</td>
    </tr>`,
    )
    .join('')

  return band(
    INK_DARK_2,
    `<div style="font-family:${SANS};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:${ACCENT};padding-bottom:8px">${escapeHtml(block.eyebrow)}</div>
    <div style="font-family:${SANS};font-size:18px;font-weight:800;line-height:1.3;color:#ffffff;padding-bottom:16px">${escapeHtml(block.heading)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">${points}</table>
    <div style="padding-top:12px">${button(block.cta.label, block.cta.url)}</div>`,
  )
}

function footerBand(links: EmailLinks): string {
  const nav = [
    { label: 'Shop', href: `${links.base}/shop` },
    { label: 'Your hub', href: `${links.base}/myhub` },
    { label: 'Terms', href: `${links.base}/legal/terms` },
    { label: 'Health disclaimer', href: `${links.base}/legal/disclaimer` },
  ]
    .map(
      (item) =>
        `<a href="${escapeHtml(item.href)}" style="color:${TEXT_FAINT};text-decoration:underline;padding-right:14px">${escapeHtml(item.label)}</a>`,
    )
    .join('')

  // The registered details are a company-law requirement on business email, not
  // decoration — and they are the reason the placeholders in `LEGAL_ENTITY` are
  // loud enough to be noticed before anything is sent for real.
  const entity = [
    LEGAL_ENTITY.legalName,
    LEGAL_ENTITY.companyNumber ? `Company no. ${LEGAL_ENTITY.companyNumber}` : '',
    LEGAL_ENTITY.registeredAddress,
  ]
    .filter(Boolean)
    .join(' &middot; ')

  const optOut = links.optOutUrl
    ? `<div style="font-family:${SANS};font-size:11px;line-height:1.6;color:${TEXT_FAINT};padding-top:12px">
      You are getting this because you bought from us. Updates about your orders and your plan will always be sent — but if you would rather not see the promotion above,
      <a href="${escapeHtml(links.optOutUrl)}" style="color:#ffffff;text-decoration:underline">turn it off here</a>.
    </div>`
    : ''

  return band(
    INK_DARK,
    `<div style="font-family:${SANS};font-size:12px;line-height:1.8;padding-bottom:10px">${nav}</div>
    <div style="font-family:${SANS};font-size:11px;line-height:1.6;color:${TEXT_FAINT}">${entity}</div>
    <div style="font-family:${SANS};font-size:11px;line-height:1.6;color:${TEXT_FAINT};padding-top:6px">
      Questions? Just reply to this email — it reaches a real inbox.
    </div>
    ${optOut}`,
    '24px 32px 30px',
  )
}

/**
 * Render the whole email.
 *
 * Returns both bodies. The plain-text one is built from the same inputs rather
 * than stripped out of the HTML, because a tag-stripped receipt is a column of
 * numbers with no labels attached — and plain text is what a meaningful number
 * of clients, and every forwarding-to-the-accountant workflow, actually shows.
 */
export function emailShell(input: ShellInput): { text: string; html: string } {
  const { links } = input

  /**
   * The promotional strip needs a way to refuse it, so the two travel together.
   *
   * Enforced here rather than trusted to each caller: this is the one place
   * every email passes through, and "marketing without an opt-out" is the exact
   * mistake that a footer-shaped convention lets through eventually.
   */
  const marketing = links.optOutUrl ? input.marketing : null

  // ── Plain text ──
  const text = [
    input.heading,
    '',
    ...(input.intro ? [input.intro, ''] : []),
    ...input.paragraphs,
    ...(input.receipt ? ['', receiptText(input.receipt)] : []),
    ...(input.cta ? ['', `${input.cta.label}: ${input.cta.url}`] : []),
    ...(input.secondaryCta ? [`${input.secondaryCta.label}: ${input.secondaryCta.url}`] : []),
    ...(input.footnote ? ['', input.footnote] : []),
    ...(marketing
      ? ['', '—'.repeat(3), marketing.heading, '', ...marketing.points.map((p) => `· ${p}`), '', `${marketing.cta.label}: ${marketing.cta.url}`]
      : []),
    '',
    `— ${LEGAL_ENTITY.tradingName}`,
    `${links.base}`,
    ...(links.optOutUrl
      ? ['', `Order and plan updates will always be sent. To stop the promotional part of these emails: ${links.optOutUrl}`]
      : []),
  ].join('\n')

  // ── HTML ──
  const body = [
    `<div style="font-family:${SANS};font-size:22px;font-weight:800;line-height:1.25;color:${TEXT};padding-bottom:${input.intro ? '8px' : '16px'}">${escapeHtml(input.heading)}</div>`,
    input.intro
      ? `<div style="font-family:${SANS};font-size:15px;line-height:1.6;color:${TEXT_SOFT};padding-bottom:16px">${escapeHtml(input.intro)}</div>`
      : '',
    ...input.paragraphs.map(
      (p) => `<div style="font-family:${SANS};font-size:14px;line-height:1.65;color:${TEXT};padding-bottom:12px">${escapeHtml(p)}</div>`,
    ),
    input.receipt ? `<div style="padding:12px 0 4px">${receiptEmailHtml(input.receipt)}</div>` : '',
    input.cta ? `<div style="padding:16px 0 0">${button(input.cta.label, input.cta.url)}</div>` : '',
    input.secondaryCta
      ? `<div style="padding:12px 0 0;font-family:${SANS};font-size:13px"><a href="${escapeHtml(input.secondaryCta.url)}" style="color:${TEXT_SOFT};text-decoration:underline">${escapeHtml(input.secondaryCta.label)}</a></div>`
      : '',
    input.footnote
      ? `<div style="padding:16px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${TEXT_SOFT};border-top:1px solid ${HAIRLINE};margin-top:20px">${escapeHtml(input.footnote)}</div>`
      : '',
  ]
    .filter(Boolean)
    .join('\n      ')

  const html = `<div style="background:${PAGE};margin:0;padding:0;width:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${escapeHtml(input.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="width:100%;border-collapse:collapse;background:${PAGE}">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;border-collapse:collapse;border-radius:16px;overflow:hidden">
        ${masthead(links.base)}
        ${band(PAPER, body, '32px')}
        ${marketing ? marketingBand(marketing) : ''}
        ${footerBand(links)}
      </table>
    </td></tr>
  </table>
</div>`

  return { text, html }
}
