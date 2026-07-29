/**
 * The outbox, against the in-memory database.
 */
import {
  dedupeKeyFor,
  flushOutbox,
  getByDedupeKey,
  listNotifications,
  queueNotification,
  markSentManually,
  retryNotification,
  sendNotificationNow,
} from '@/lib/notify/outbox'
import { createUser } from '@/lib/db/users'
import type { QueueInput, RenderedEmail } from '@/lib/notify/types'

const rendered: RenderedEmail = { subject: 'Subject', text: 'Body', html: '<p>Body</p>' }

function input(over: Partial<QueueInput> = {}): QueueInput {
  return {
    userId: null,
    email: 'member@example.com',
    template: 'product-removed',
    rendered,
    changeEventId: 'chg_test_l1_out-of-stock',
    ...over,
  }
}

describe('queueing', () => {
  it('stores the rendered email, not a promise to render one later', async () => {
    // What the member receives is decided when the change happened. A product
    // title that moves before the worker runs can't rewrite history.
    const user = await createUser({ email: 'queue-1@example.com' })
    const queued = await queueNotification(input({ userId: user.id, changeEventId: 'chg_q1' }))

    expect(queued).toMatchObject({ status: 'queued', attempts: 0, sentAt: null })
    expect(queued.rendered).toEqual(rendered)
  })

  it('derives the dedupe key from the change and the template', async () => {
    const queued = await queueNotification(input({ changeEventId: 'chg_q2', template: 'product-substituted' }))
    expect(queued.dedupeKey).toBe(dedupeKeyFor('chg_q2', 'product-substituted'))
  })

  it('never queues the same message twice for the same change', async () => {
    // The guarantee that a re-run of the daily job can't email anyone twice.
    const first = await queueNotification(input({ changeEventId: 'chg_dupe' }))
    const second = await queueNotification(input({ changeEventId: 'chg_dupe' }))

    expect(second.id).toBe(first.id)
    expect((await listNotifications({ limit: 200 })).filter((n) => n.changeEventId === 'chg_dupe')).toHaveLength(1)
  })

  it('does distinguish two different templates about the same change', async () => {
    await queueNotification(input({ changeEventId: 'chg_two', template: 'product-removed' }))
    await queueNotification(input({ changeEventId: 'chg_two', template: 'product-substituted' }))

    expect(await getByDedupeKey(dedupeKeyFor('chg_two', 'product-removed'))).not.toBeNull()
    expect(await getByDedupeKey(dedupeKeyFor('chg_two', 'product-substituted'))).not.toBeNull()
  })
})

describe('flushing', () => {
  // Flushing is the provider path. Manual mode — the default — deliberately
  // sends nothing, which is covered in its own block below.
  beforeEach(() => { process.env.NOTIFY_SOURCE = 'mock' })
  afterEach(() => { delete process.env.NOTIFY_SOURCE })

  it('sends what is queued and records it', async () => {
    await queueNotification(input({ changeEventId: 'chg_flush' }))
    const result = await flushOutbox()

    expect(result.sent.length).toBeGreaterThan(0)
    const sent = result.sent.find((n) => n.changeEventId === 'chg_flush')!
    expect(sent).toMatchObject({ status: 'sent', attempts: 1 })
    expect(sent.sentAt).not.toBeNull()
    expect(sent.providerId).toMatch(/^mock_/)
  })

  it('tells the caller who was actually reached', async () => {
    await queueNotification(input({ changeEventId: 'chg_cb' }))
    const seen: string[] = []
    await flushOutbox({ onSent: async (n) => { if (n.changeEventId) seen.push(n.changeEventId) } })

    expect(seen).toContain('chg_cb')
  })

  it('does not lose a send when the callback throws', async () => {
    // The row is durable before the callback runs, so a bookkeeping failure
    // downstream can't make us re-send to the member.
    await queueNotification(input({ changeEventId: 'chg_throw' }))
    await flushOutbox({ onSent: async () => { throw new Error('bookkeeping blew up') } })

    const stored = await getByDedupeKey(dedupeKeyFor('chg_throw', 'product-removed'))
    expect(stored!.status).toBe('sent')
  })

  it('is a no-op when nothing is queued', async () => {
    await flushOutbox()
    expect(await flushOutbox()).toEqual({ sent: [], failed: [] })
  })
})

describe('manual sending (the default)', () => {
  it('leaves everything queued rather than marking unsent email as delivered', async () => {
    // The queue IS the workflow: a founder copies these out by hand. Flushing
    // them would quietly claim messages were delivered that nobody has sent.
    await queueNotification(input({ changeEventId: 'chg_manual' }))
    const result = await flushOutbox()

    expect(result).toEqual({ sent: [], failed: [] })
    expect((await getByDedupeKey(dedupeKeyFor('chg_manual', 'product-removed')))!.status).toBe('queued')
  })

  it('ticks one off when a founder says they have sent it', async () => {
    await queueNotification(input({ changeEventId: 'chg_byhand' }))
    const queued = await getByDedupeKey(dedupeKeyFor('chg_byhand', 'product-removed'))

    const sent = await markSentManually(queued!.id)

    expect(sent).toMatchObject({ status: 'sent', sentManually: true, providerId: null })
    expect(sent!.sentAt).not.toBeNull()
  })

  it('never re-stamps something already sent, so a double-click cannot rewrite when', async () => {
    await queueNotification(input({ changeEventId: 'chg_twice' }))
    const queued = await getByDedupeKey(dedupeKeyFor('chg_twice', 'product-removed'))

    const first = await markSentManually(queued!.id)
    const second = await markSentManually(queued!.id)

    expect(second!.sentAt).toBe(first!.sentAt)
  })

  it('reports nothing for an id that does not exist', async () => {
    expect(await markSentManually('ntf_nope')).toBeNull()
  })
})

describe('failure handling', () => {
  const realFetch = global.fetch

  afterEach(() => {
    delete process.env.NOTIFY_SOURCE
    delete process.env.RESEND_API_KEY
    global.fetch = realFetch
  })

  it('records why a send failed and keeps it retryable', async () => {
    process.env.NOTIFY_SOURCE = 'auto'
    process.env.RESEND_API_KEY = 'test-key'
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 422, text: async () => 'invalid recipient',
    }) as unknown as typeof fetch

    await queueNotification(input({ changeEventId: 'chg_fail' }))
    const result = await flushOutbox()

    const failed = result.failed.find((n) => n.changeEventId === 'chg_fail')!
    expect(failed.status).toBe('failed')
    expect(failed.error).toContain('422')
    expect(failed.attempts).toBe(1)
  })

  it('requeues a failure and sends it on the next flush', async () => {
    process.env.NOTIFY_SOURCE = 'auto'
    process.env.RESEND_API_KEY = 'test-key'
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as unknown as typeof fetch

    await queueNotification(input({ changeEventId: 'chg_retry' }))
    await flushOutbox()
    const failed = await getByDedupeKey(dedupeKeyFor('chg_retry', 'product-removed'))
    expect(failed!.status).toBe('failed')

    // Back to a working provider, as if it recovered.
    process.env.NOTIFY_SOURCE = 'mock'
    await retryNotification(failed!.id)
    await flushOutbox()

    const after = await getByDedupeKey(dedupeKeyFor('chg_retry', 'product-removed'))
    expect(after!.status).toBe('sent')
    expect(after!.attempts).toBe(2)
    expect(after!.error).toBeNull()
  })

  it('refuses to requeue something already sent', async () => {
    process.env.NOTIFY_SOURCE = 'mock'
    await queueNotification(input({ changeEventId: 'chg_sent' }))
    await flushOutbox()
    const sent = await getByDedupeKey(dedupeKeyFor('chg_sent', 'product-removed'))

    expect((await retryNotification(sent!.id))!.status).toBe('sent')
  })
})

describe('provider selection', () => {
  afterEach(() => {
    delete process.env.NOTIFY_SOURCE
    delete process.env.RESEND_API_KEY
  })

  it('falls back to manual when resend is forced without a key', async () => {
    // A missing key must never mean a member's plan changed and nobody told
    // them — the email waits where a human can see it instead.
    process.env.NOTIFY_SOURCE = 'resend'
    const { getNotificationSource } = await import('@/lib/notify')
    expect(getNotificationSource()).toBe('manual')
  })

  it('sends by hand unless told otherwise', async () => {
    delete process.env.NOTIFY_SOURCE
    const { getNotificationSource, isManualMode } = await import('@/lib/notify')
    expect(getNotificationSource()).toBe('manual')
    expect(isManualMode()).toBe(true)
  })
})

describe('the Send button', () => {
  const realFetch = global.fetch
  afterEach(() => {
    delete process.env.NOTIFY_SOURCE
    delete process.env.RESEND_API_KEY
    global.fetch = realFetch
  })

  function withResend(ok = true) {
    process.env.NOTIFY_SOURCE = 'resend'
    process.env.RESEND_API_KEY = 'test-key'
    global.fetch = jest.fn().mockResolvedValue(
      ok
        ? { ok: true, json: async () => ({ id: 're_123' }) }
        : { ok: false, status: 422, text: async () => 'bad recipient' },
    ) as unknown as typeof fetch
  }

  it('delivers one email and marks it sent, not sent-by-hand', async () => {
    withResend()
    await queueNotification(input({ changeEventId: 'chg_send_one' }))
    const queued = await getByDedupeKey(dedupeKeyFor('chg_send_one', 'product-removed'))

    const sent = await sendNotificationNow(queued!.id)

    expect(sent).toMatchObject({ status: 'sent', sentManually: false, providerId: 're_123' })
    expect(sent!.sentAt).not.toBeNull()
  })

  it('keeps a failed send in the queue with the reason attached', async () => {
    withResend(false)
    await queueNotification(input({ changeEventId: 'chg_send_fail' }))
    const queued = await getByDedupeKey(dedupeKeyFor('chg_send_fail', 'product-removed'))

    const result = await sendNotificationNow(queued!.id)

    expect(result!.status).toBe('failed')
    expect(result!.error).toContain('422')
    // Still a to-do, not silently gone.
    expect((await getByDedupeKey(dedupeKeyFor('chg_send_fail', 'product-removed')))!.status).toBe('failed')
  })

  it('refuses, with a useful reason, when no provider is configured', async () => {
    // Pressing Send with nothing wired up must say so rather than pretend.
    await queueNotification(input({ changeEventId: 'chg_send_noprov' }))
    const queued = await getByDedupeKey(dedupeKeyFor('chg_send_noprov', 'product-removed'))

    const result = await sendNotificationNow(queued!.id)

    expect(result!.status).toBe('failed')
    expect(result!.error).toMatch(/no email provider/i)
  })

  it('never sends the same email twice', async () => {
    withResend()
    await queueNotification(input({ changeEventId: 'chg_send_twice' }))
    const queued = await getByDedupeKey(dedupeKeyFor('chg_send_twice', 'product-removed'))

    const first = await sendNotificationNow(queued!.id)
    const second = await sendNotificationNow(queued!.id)

    expect(second!.sentAt).toBe(first!.sentAt)
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1)
  })

  it('is available with a provider, without switching on unattended sending', async () => {
    // Configuring Resend gives you a button, not a hands-off system — those are
    // different levels of trust and stay different decisions.
    withResend()
    const { canSendFromHub, isAutoSendEnabled } = await import('@/lib/notify')
    expect(canSendFromHub()).toBe(true)
    expect(isAutoSendEnabled()).toBe(false)

    process.env.NOTIFY_SOURCE = 'auto'
    expect(isAutoSendEnabled()).toBe(true)
  })

  it('does not flush by itself while sending is click-to-send', async () => {
    withResend()
    await queueNotification(input({ changeEventId: 'chg_no_autoflush' }))

    expect(await flushOutbox()).toEqual({ sent: [], failed: [] })
    expect((await getByDedupeKey(dedupeKeyFor('chg_no_autoflush', 'product-removed')))!.status).toBe('queued')
  })
})
