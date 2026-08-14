/**
 * Which address each kind of email leaves from.
 */
import {
  bareAddress,
  fromAddressFor,
  listStreams,
  replyToAddress,
  streamFor,
} from '@/lib/notify/streams'

const ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ENV }
})

describe('picking a stream', () => {
  it('sends order receipts and plan emails from different addresses', () => {
    // The whole reason streams exist: one kind of email having a bad week must
    // not drag the others' deliverability down with it.
    process.env.NOTIFY_DOMAIN = 'getchrgd.co.uk'
    expect(streamFor('order-confirmation')).toBe('orders')
    expect(streamFor('subscription-confirmation')).toBe('subscriptions')
    expect(streamFor('payment-failed')).toBe('billing')
    expect(fromAddressFor('orders')).not.toBe(fromAddressFor('billing'))
  })

  it('collapses to one address until a domain is configured', () => {
    // Deliberate: a `noreply@` on a domain whose SPF and DKIM have not been set
    // up is not a better default, it is a bounce. Nothing sends from the
    // per-stream addresses until someone has actually verified the domain.
    delete process.env.NOTIFY_DOMAIN
    delete process.env.NOTIFY_FROM_ORDERS
    expect(fromAddressFor('orders')).toBe(fromAddressFor('billing'))
  })

  it('groups by what the member is being told about, not by which module wrote it', () => {
    // A substitution and a plan ending arrive from different code and are the
    // same thing to the person reading them: news about their subscription.
    expect(streamFor('product-substituted')).toBe('subscriptions')
    expect(streamFor('exit-receipt')).toBe('subscriptions')
  })
})

describe('resolving the address', () => {
  it('derives every stream from one domain setting', () => {
    process.env.NOTIFY_DOMAIN = 'getchrgd.co.uk'
    delete process.env.NOTIFY_FROM_ORDERS

    expect(bareAddress(fromAddressFor('orders'))).toBe('orderconfirmation.noreply@getchrgd.co.uk')
    expect(bareAddress(fromAddressFor('subscriptions'))).toBe('subscriptions.noreply@getchrgd.co.uk')
    expect(bareAddress(fromAddressFor('billing'))).toBe('billing.noreply@getchrgd.co.uk')
  })

  it('lets one stream be overridden without touching the others', () => {
    process.env.NOTIFY_DOMAIN = 'getchrgd.co.uk'
    process.env.NOTIFY_FROM_ORDERS = 'Orders <receipts@getchrgd.co.uk>'

    expect(fromAddressFor('orders')).toBe('Orders <receipts@getchrgd.co.uk>')
    expect(bareAddress(fromAddressFor('billing'))).toBe('billing.noreply@getchrgd.co.uk')
  })

  it('still honours the older single-address setting', () => {
    // An existing deployment that only ever set NOTIFY_FROM keeps working
    // exactly as it did, rather than silently starting to send from a domain it
    // has not verified.
    delete process.env.NOTIFY_DOMAIN
    delete process.env.NOTIFY_FROM_ORDERS
    process.env.NOTIFY_FROM = 'CHRGD <hello@example.com>'

    expect(fromAddressFor('orders')).toBe('CHRGD <hello@example.com>')
    expect(fromAddressFor('billing')).toBe('CHRGD <hello@example.com>')
  })

  it('names the stream in the From header, so an inbox can be filtered on it', () => {
    process.env.NOTIFY_DOMAIN = 'getchrgd.co.uk'
    delete process.env.NOTIFY_FROM_ORDERS
    expect(fromAddressFor('orders')).toContain('getCHRGD Orders')
  })
})

describe('replies', () => {
  it('points a noreply sender at a monitored inbox', () => {
    // A noreply address with nowhere to reply to is how a customer with a
    // question about their order ends up with nobody to ask.
    process.env.NOTIFY_REPLY_TO = 'contact@getchrgd.co.uk'
    expect(replyToAddress()).toBe('contact@getchrgd.co.uk')
    expect(listStreams().every((s) => s.replyTo === 'contact@getchrgd.co.uk')).toBe(true)
  })

  it('falls back to contact@ on the sending domain', () => {
    delete process.env.NOTIFY_REPLY_TO
    delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL
    process.env.NOTIFY_DOMAIN = 'getchrgd.co.uk'
    expect(replyToAddress()).toBe('contact@getchrgd.co.uk')
  })

  it('ignores an unfilled placeholder support address', () => {
    // The legal-entity settings use `[bracketed]` to mean "not set yet", and one
    // of those is not somewhere to send a customer's reply.
    delete process.env.NOTIFY_REPLY_TO
    delete process.env.NOTIFY_DOMAIN
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = '[support email]'
    expect(replyToAddress()).toBeNull()
  })
})
