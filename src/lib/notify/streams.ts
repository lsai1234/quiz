/**
 * Mail streams — which address each email leaves from.
 *
 * Every email in the system belongs to exactly one stream, and each stream has
 * its own sending address. That is not decoration:
 *
 *  • **Deliverability is per-address.** A receipt nobody ever complains about
 *    and a price-rise notice that occasionally gets a spam report build separate
 *    reputations when they leave from separate addresses. Sending everything as
 *    `hello@` means one bad week for one kind of email drags the receipts down
 *    with it.
 *  • **People filter on the sender.** "All my getCHRGD orders" is a rule someone
 *    can actually write when orders come from one address and billing from
 *    another.
 *
 * The addresses are `noreply` because nobody reads the mailbox they arrive in —
 * but every one of them carries a **Reply-To of the real contact address**, so
 * hitting reply still reaches a human. A `noreply` sender with no reply path is
 * how a customer with a question about their order ends up with nowhere to ask
 * it, and mailbox providers treat it as a spam signal besides.
 *
 * Resolution order for a stream's address:
 *   1. `NOTIFY_FROM_<STREAM>` — an explicit override for that one stream.
 *   2. `NOTIFY_DOMAIN` — derive `<localpart>@<domain>` for every stream at once.
 *      This is the intended production setup: set the domain, get the addresses.
 *   3. `NOTIFY_FROM` — the older single-address setting, still honoured so an
 *      existing deployment keeps working unchanged.
 *   4. The development default.
 */
import type { TemplateId } from './types'

export type MailStream = 'orders' | 'subscriptions' | 'billing' | 'account'

interface StreamSpec {
  /** Shown in the Founders Hub, and the display name on the From header. */
  label: string
  /** The local part used when `NOTIFY_DOMAIN` derives the address. */
  localPart: string
  /** What this stream is for, in the hub's own words. */
  purpose: string
}

const STREAMS: Record<MailStream, StreamSpec> = {
  orders: {
    label: 'getCHRGD Orders',
    localPart: 'orderconfirmation.noreply',
    purpose: 'Receipts for one-off orders.',
  },
  subscriptions: {
    label: 'getCHRGD Subscriptions',
    localPart: 'subscriptions.noreply',
    purpose: 'Plan confirmations, changes to a plan, and plans ending.',
  },
  billing: {
    label: 'getCHRGD Billing',
    localPart: 'billing.noreply',
    purpose: 'Payments, price changes and terms.',
  },
  /**
   * Getting into the account: reset links and security notices.
   *
   * Its own stream for a reason the others only have in theory. A reset email is
   * the one email that is useless if it lands in spam — the member is locked out
   * and cannot be told anything else — and it is also the one that never carries
   * a promotion, never goes to a list, and is never sent to anyone who did not
   * ask for it seconds earlier. Keeping it away from everything else is how it
   * stays that way.
   */
  account: {
    label: 'getCHRGD Account',
    localPart: 'account.noreply',
    purpose: 'Password resets and security notices.',
  },
}

/**
 * Which stream an email belongs to.
 *
 * Grouped by what the member is being told about rather than by which module
 * raised it: a substitution and a plan ending are both "something about your
 * subscription", however differently they arrive in the code.
 */
const STREAM_FOR_TEMPLATE: Record<TemplateId, MailStream> = {
  'order-confirmation': 'orders',
  'subscription-confirmation': 'subscriptions',
  'product-substituted': 'subscriptions',
  'product-removed': 'subscriptions',
  'exit-receipt': 'subscriptions',
  'exit-scheduled': 'subscriptions',
  'exit-return-requested': 'subscriptions',
  'price-change-notice': 'billing',
  'terms-updated': 'billing',
  'payment-failed': 'billing',
  'exit-charge-failed': 'billing',
  'password-reset': 'account',
  'password-changed': 'account',
}

export function streamFor(template: TemplateId): MailStream {
  // Defaulted rather than asserted: a template added without a stream should
  // still send, from the address that says the least about what is inside.
  return STREAM_FOR_TEMPLATE[template] ?? 'subscriptions'
}

export function streamLabel(stream: MailStream): string {
  return STREAMS[stream].label
}

export function streamPurpose(stream: MailStream): string {
  return STREAMS[stream].purpose
}

/** The sending domain, when one is configured. */
export function notifyDomain(): string | null {
  const raw = (process.env.NOTIFY_DOMAIN ?? '').trim().replace(/^@+/, '').toLowerCase()
  return raw.length > 0 ? raw : null
}

const ENV_KEY: Record<MailStream, string> = {
  orders: 'NOTIFY_FROM_ORDERS',
  subscriptions: 'NOTIFY_FROM_SUBSCRIPTIONS',
  billing: 'NOTIFY_FROM_BILLING',
  account: 'NOTIFY_FROM_ACCOUNT',
}

/** The full From header for a stream, e.g. `getCHRGD Orders <…@getchrgd.co.uk>`. */
export function fromAddressFor(stream: MailStream): string {
  const explicit = (process.env[ENV_KEY[stream]] ?? '').trim()
  if (explicit) return explicit

  const domain = notifyDomain()
  if (domain) return `${STREAMS[stream].label} <${STREAMS[stream].localPart}@${domain}>`

  const shared = (process.env.NOTIFY_FROM ?? '').trim()
  if (shared) return shared

  return 'CHRGD <hello@chrgd.dev>'
}

/**
 * Where a reply actually goes.
 *
 * Falls back through the support address and then `contact@` on the sending
 * domain, because the whole point of a `noreply` sender is that something else
 * is catching the replies. Returns null only when there is genuinely nowhere to
 * send them — a bare development install with nothing configured.
 */
export function replyToAddress(): string | null {
  const explicit = (process.env.NOTIFY_REPLY_TO ?? '').trim()
  if (explicit) return explicit

  const support = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? '').trim()
  // The legal-entity settings use `[bracketed]` placeholders to mean "not filled
  // in yet"; one of those is not an address to point people at.
  if (support && !support.startsWith('[') && support.includes('@')) return support

  const domain = notifyDomain()
  return domain ? `contact@${domain}` : null
}

/** Just the address part of a From header, for display and for `mailto:`. */
export function bareAddress(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return (match ? match[1] : from).trim()
}

export interface StreamSummary {
  id: MailStream
  label: string
  purpose: string
  from: string
  replyTo: string | null
}

/** Every stream and the address it sends from — the hub's settings view. */
export function listStreams(): StreamSummary[] {
  const replyTo = replyToAddress()
  return (Object.keys(STREAMS) as MailStream[]).map((id) => ({
    id,
    label: STREAMS[id].label,
    purpose: STREAMS[id].purpose,
    from: fromAddressFor(id),
    replyTo,
  }))
}
