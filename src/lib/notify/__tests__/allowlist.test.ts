import { guardedForTesting, HeldForTestingError, recipientAllowed, testAllowlist } from '../allowlist'
import type { NotificationProvider } from '../types'

const email = { subject: 'Hi', text: 'Hi', html: '<p>Hi</p>' }

function provider() {
  const sent: string[] = []
  const p: NotificationProvider = { name: 'resend', send: async (to) => (sent.push(to), { providerId: 'x' }) }
  return { p, sent }
}

describe('the test allowlist: nothing leaves a non-live deployment except to it', () => {
  it('reads addresses and whole domains, and ignores junk', () => {
    expect(testAllowlist({ NOTIFY_TEST_ALLOWLIST: ' Lewis@Example.com, @chrgd.dev  nope ,' })).toEqual(['lewis@example.com', '@chrgd.dev'])
    expect(testAllowlist({})).toEqual([])
  })

  it('matches an address exactly, or anyone at a listed domain', () => {
    const list = ['lewis@example.com', '@chrgd.dev']
    expect(recipientAllowed('LEWIS@example.com', list)).toBe(true)
    expect(recipientAllowed('anyone@chrgd.dev', list)).toBe(true)
    expect(recipientAllowed('anyone@sub.chrgd.dev', list)).toBe(false)
    expect(recipientAllowed('lewis@example.co', list)).toBe(false)
  })

  it('holds a customer outside live, sends to the list, and lifts the hold once live', async () => {
    const { p, sent } = provider()
    let live = false
    const guarded = guardedForTesting(p, () => live, () => ['@chrgd.dev'])
    await expect(guarded.send('customer@gmail.com', email)).rejects.toBeInstanceOf(HeldForTestingError)
    await guarded.send('founder@chrgd.dev', email)
    live = true
    await guarded.send('customer@gmail.com', email)
    expect(sent).toEqual(['founder@chrgd.dev', 'customer@gmail.com'])
  })

  it('holds everyone outside live when no list is set', async () => {
    const { p, sent } = provider()
    await expect(guardedForTesting(p, () => false, () => []).send('founder@chrgd.dev', email)).rejects.toThrow(/test allowlist/)
    expect(sent).toEqual([])
  })
})
