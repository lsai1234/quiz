/**
 * @jest-environment node
 */
const mockUser: { current: unknown } = { current: null }
jest.mock('@/lib/auth/session', () => ({ getHubUser: async () => mockUser.current }))
const founder = { authed: true }
jest.mock('@/lib/portal/guard', () => ({ isPortalAuthed: async () => founder.authed }))

import { POST } from '../route'
import { GET as inbox, POST as markSeen, DELETE as remove } from '../../../portal/member-feedback/route'
import { createUser } from '@/lib/db/users'
import { deleteAccount, exportAccount } from '@/lib/db/erasure'
import { FEEDBACK_MAX, FEEDBACK_PER_DAY, listMemberFeedback } from '@/lib/member-feedback/store'
import type { MemberFeedback } from '@/lib/member-feedback/store'

/**
 * The hub's feedback page and the founders' inbox.
 *
 * What these hold: anyone signed in can send one, it reaches the inbox with who
 * sent it, a member can't flood it, and it goes with their account when they
 * ask for that.
 */

const send = (text: unknown) =>
  POST(new Request('http://x/api/hub/member-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }))
const read = async () => (await (await inbox()).json()) as { entries: MemberFeedback[]; seenAt: string | null }

let n = 0
async function member(name = 'Sam Reed') {
  const user = await createUser({ email: `feedback-${++n}@example.com`, name })
  mockUser.current = user
  return user
}

beforeEach(() => {
  founder.authed = true
})

describe('sending feedback', () => {
  it('needs a signed-in member', async () => {
    mockUser.current = null
    expect((await send('Love the calendar')).status).toBe(401)
  })

  it('reaches the founders’ inbox, with who sent it and where they were with us', async () => {
    const user = await member()
    const res = await send('  The delivery calendar took me a while to find.  ')
    expect(res.status).toBe(200)
    const mine = (await read()).entries.find((e) => e.userId === user.id)
    expect(mine).toMatchObject({
      text: 'The delivery calendar took me a while to find.',
      email: user.email,
      name: 'Sam Reed',
      access: 'none',
    })
  })

  it('refuses an empty message and an over-long one, and keeps neither', async () => {
    const user = await member()
    expect((await send('')).status).toBe(400)
    expect((await send('  ok')).status).toBe(400)
    expect((await send({ not: 'text' })).status).toBe(400)
    expect((await send('x'.repeat(FEEDBACK_MAX + 1))).status).toBe(400)
    expect((await listMemberFeedback()).some((e) => e.userId === user.id)).toBe(false)
  })

  it('takes a few a day from one member, then says so', async () => {
    const user = await member()
    for (let i = 0; i < FEEDBACK_PER_DAY; i++) expect((await send(`Thought number ${i + 1}`)).status).toBe(200)
    const over = await send('One more thing')
    expect(over.status).toBe(429)
    expect((await over.json()).error).toMatch(/tomorrow/)
    expect((await listMemberFeedback()).filter((e) => e.userId === user.id)).toHaveLength(FEEDBACK_PER_DAY)
  })
})

describe('the founders’ inbox', () => {
  it('is founders only', async () => {
    founder.authed = false
    expect((await inbox()).status).toBe(401)
    expect((await markSeen(new Request('http://x', { method: 'POST', body: JSON.stringify({ seen: true }) }))).status).toBe(401)
    expect((await remove(new Request('http://x/?id=00000000-0000-0000-0000-000000000000', { method: 'DELETE' }))).status).toBe(401)
  })

  it('lists newest first, remembers when it was read, and deletes a message', async () => {
    await member()
    await send('First message')
    await send('Second message')
    const before = await read()
    const [newest, older] = before.entries
    expect(newest.createdAt >= older.createdAt).toBe(true)

    await markSeen(new Request('http://x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seen: true }) }))
    const seen = (await read()).seenAt
    expect(seen && seen >= newest.createdAt).toBe(true)

    expect((await remove(new Request(`http://x/?id=${newest.id}`, { method: 'DELETE' }))).status).toBe(200)
    expect((await read()).entries.some((e) => e.id === newest.id)).toBe(false)
    expect((await remove(new Request('http://x/?id=not-an-id', { method: 'DELETE' }))).status).toBe(400)
  })
})

describe('a member’s own data', () => {
  it('comes in their copy, and goes when they delete their account', async () => {
    const user = await member()
    await send('Please add a dark mode for emails.')
    const copy = await exportAccount(user.id)
    expect(copy?.memberFeedback).toEqual([{ sentAt: expect.any(String), text: 'Please add a dark mode for emails.' }])

    const result = await deleteAccount(user.id)
    expect(result.deleted).toContain('feedback they sent us')
    expect((await listMemberFeedback()).some((e) => e.userId === user.id)).toBe(false)
  })
})
