/**
 * @jest-environment node
 */
const mockUser: { current: unknown } = { current: null }
jest.mock('@/lib/auth/session', () => ({ getHubUser: async () => mockUser.current }))
jest.mock('@/lib/portal/guard', () => ({
  isPortalAuthed: async () => true,
  getFounder: async () => ({ email: 'founder@example.com', name: 'Sam Founder' }),
}))

import { GET as memberGet, POST as memberAsk } from '@/app/api/hub/trainer/route'
import { GET as inboxGet, POST as inboxSave } from '@/app/api/portal/trainer/route'
import { GET as threadGet, POST as threadAnswer, PATCH as threadMark } from '@/app/api/portal/trainer/[userId]/route'
import { createUser } from '@/lib/db/users'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { listNotifications } from '@/lib/notify/outbox'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { saveServiceSettings, saveTrainerProfile } from '@/lib/offer/store'
import { exportAccount } from '@/lib/db/erasure'
import { accessesForMember } from '@/lib/portal/access-log'
import { askTrainer, answerMember, askedToday, cleanText, getThread, listInbox, TrainerError } from '../store'
import { viewOf } from '../server'
import { TRAINER_COPY } from '../copy'
import type { MemberTrainerView } from '../types'

process.env.NOTIFY_TEST_ALLOWLIST = '@example.com'

let n = 0
async function member(withOrder = true) {
  const email = `trainer-${Date.now()}-${n++}@example.com`
  const user = (await createUser({ email, password: 'a-long-password-1', name: 'Jo Bloggs' } as never)) as { id: string; email: string; name: string | null }
  if (withOrder) {
    await createOrderFromCheckout({ channel: 'quiz', email, status: 'paid', lines: [{ sku: null, productId: MOCK_CATALOGUE[0].id, title: 'x', quantity: 1, unitPrice: 20 }] })
  }
  return user
}
const post = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) })
const params = (userId: string) => ({ params: Promise.resolve({ userId }) })

describe('the thread', () => {
  it('keeps the words as written, squeezed, and refuses an empty or long question', async () => {
    expect(cleanText('  How heavy\r\n\r\n\r\n\r\nshould   I go?  ')).toBe('How heavy\n\nshould I go?')
    const who = { id: `t-${n++}`, email: 'a@example.com', firstName: 'A' }
    await expect(askTrainer(who, { text: '   ' }, 5)).rejects.toEqual(new TrainerError('empty'))
    await expect(askTrainer(who, { text: 'x'.repeat(1001) }, 5)).rejects.toEqual(new TrainerError('too-long'))
  })

  it('counts a day’s questions and stops at the limit; an answer clears the wait', async () => {
    const who = { id: `t-${n++}`, email: 'b@example.com', firstName: 'B' }
    const now = new Date('2026-11-06T10:00:00Z')
    await askTrainer(who, { text: 'One', about: 'Barbell back squat' }, 2, now)
    const { thread } = await askTrainer(who, { text: 'Two' }, 2, now)
    expect(thread.waiting).toBe(true)
    expect(askedToday(thread, now)).toBe(2)
    await expect(askTrainer(who, { text: 'Three' }, 2, now)).rejects.toEqual(new TrainerError('limit'))
    // A day on, the limit has moved.
    await askTrainer(who, { text: 'Next day' }, 2, new Date(now.getTime() + 86_400_001))
    const answered = await answerMember(who.id, { text: 'Start light.', videoUrl: 'https://youtu.be/abc123', videoTitle: 'Squat set-up', by: 'Sam' })
    expect(answered!.thread.waiting).toBe(false)
    expect(answered!.message.video).toEqual({ url: 'https://youtu.be/abc123', title: 'Squat set-up' })
    expect((await getThread(who.id))!.messages[0].about).toBe('Barbell back squat')
  })

  it('only shows videos from the hosts we trust', async () => {
    const who = { id: `t-${n++}`, email: 'c@example.com', firstName: null }
    await askTrainer(who, { text: 'Q' }, 5)
    await expect(answerMember(who.id, { text: 'A', videoUrl: 'http://example.com/x.mp4', by: 'Sam' })).rejects.toEqual(new TrainerError('video'))
    await expect(answerMember(who.id, { text: 'A', videoUrl: 'https://evil.example/x', by: 'Sam' })).rejects.toEqual(new TrainerError('video'))
  })

  it('never tells the member which founder answered', async () => {
    const who = { id: `t-${n++}`, email: 'd@example.com', firstName: 'D' }
    await askTrainer(who, { text: 'Q' }, 5, new Date('2026-11-06T10:00:00Z'))
    const { thread } = (await answerMember(who.id, { text: 'A', by: 'Sam Founder' }, new Date('2026-11-06T11:00:00Z')))!
    const view = viewOf(thread, { name: 'Sam', role: 'Trainer', bio: '', photoUrl: null, replyHours: 48, dailyLimit: 5, notifyEmail: 'sam@example.com', checksPlans: true }, true, true)
    expect(JSON.stringify(view)).not.toMatch(/Sam Founder|sam@example\.com/)
    expect(view.unread).toBe(1)
  })

  it('lists the longest wait first, then the newest', async () => {
    const a = { id: `inbox-a-${n++}`, email: 'ia@example.com', firstName: 'A' }
    const b = { id: `inbox-b-${n++}`, email: 'ib@example.com', firstName: 'B' }
    const c = { id: `inbox-c-${n++}`, email: 'ic@example.com', firstName: 'C' }
    await askTrainer(a, { text: 'later' }, 5, new Date('2026-11-06T12:00:00Z'))
    await askTrainer(b, { text: 'earlier' }, 5, new Date('2026-11-06T08:00:00Z'))
    await askTrainer(c, { text: 'answered' }, 5, new Date('2026-11-06T13:00:00Z'))
    await answerMember(c.id, { text: 'done', by: 'Sam' }, new Date('2026-11-06T14:00:00Z'))
    const rows = (await listInbox()).filter((r) => [a.id, b.id, c.id].includes(r.userId)).map((r) => r.userId)
    expect(rows).toEqual([b.id, a.id, c.id])
  })
})

describe('the routes', () => {
  afterAll(async () => {
    await saveServiceSettings({ trainer: false })
  })

  it('says nothing while it’s off, or while nobody is named', async () => {
    await saveServiceSettings({ trainer: false })
    mockUser.current = await member()
    expect(((await (await memberGet()).json()) as MemberTrainerView).live).toBe(false)
    expect((await memberAsk(post({ text: 'Hello' }))).status).toBe(404)
    await saveTrainerProfile({ name: '' })
    await saveServiceSettings({ trainer: true })
    expect((await memberAsk(post({ text: 'Hello' }))).status).toBe(404)
  })

  it('a member asks; the founders see it, answer with a video; the member reads it and is emailed', async () => {
    await saveTrainerProfile({ name: 'Sam', role: 'Co-founder · personal trainer', replyHours: 24, dailyLimit: 3, notifyEmail: 'trainer-alerts@example.com' })
    await saveServiceSettings({ trainer: true })
    const user = await member()
    mockUser.current = user
    const first = (await (await memberGet()).json()) as MemberTrainerView
    expect(first).toMatchObject({ live: true, open: true, left: 3, trainer: { name: 'Sam', replyHours: 24 } })
    expect(JSON.stringify(first)).not.toMatch(/trainer-alerts/)

    const asked = await memberAsk(post({ text: 'How heavy should I squat?', about: 'Barbell back squat' }))
    expect(asked.status).toBe(200)
    expect(((await asked.json()) as MemberTrainerView).left).toBe(2)
    await memberAsk(post({ text: 'And how many sets?' }))
    // One alert to the trainer for the wait, not one per question.
    const alerts = (await listNotifications({ limit: 200 })).filter((x) => x.template === 'trainer-question' && x.email === 'trainer-alerts@example.com' && JSON.stringify(x).includes(user.id))
    expect(alerts).toHaveLength(1)

    const inbox = await (await inboxGet()).json()
    const row = inbox.inbox.find((r: { userId: string }) => r.userId === user.id)
    expect(row).toMatchObject({ waiting: true, firstName: 'Jo', unread: true })

    const opened = await (await threadGet(new Request('http://x'), params(user.id))).json()
    expect(opened.thread.messages).toHaveLength(2)
    expect(opened.member).toMatchObject({ firstName: 'Jo', hub: 'member' })
    // Opening a member's questions is an access to their record.
    expect((await accessesForMember(user.id)).some((a) => a.kind === 'member-trainer')).toBe(true)

    expect((await threadAnswer(post({ text: 'Start with the bar.', videoUrl: 'https://vimeo.com/123' }), params(user.id))).status).toBe(200)
    expect((await threadAnswer(post({ text: '' }), params(user.id))).status).toBe(400)
    const replies = (await listNotifications({ limit: 200 })).filter((x) => x.template === 'trainer-reply' && x.email === user.email)
    expect(replies).toHaveLength(1)
    expect(replies[0].rendered.subject).toBe(TRAINER_COPY.replySubject('Sam'))

    const read = (await (await memberGet()).json()) as MemberTrainerView
    expect(read.waiting).toBe(false)
    expect(read.unread).toBe(1)
    expect(read.messages[2]).toMatchObject({ from: 'trainer', text: 'Start with the bar.', video: { url: 'https://vimeo.com/123' } })
    // Looked at: no longer new.
    expect(((await (await memberGet()).json()) as MemberTrainerView).unread).toBe(0)

    // In their data export.
    const data = await exportAccount(user.id)
    expect(data!.trainerQuestions).toHaveLength(3)

    expect((await threadMark(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ waiting: true }) }), params(user.id))).status).toBe(200)
  })

  it('stops at the day’s limit, and when the hub has closed', async () => {
    await saveTrainerProfile({ name: 'Sam', dailyLimit: 1 })
    await saveServiceSettings({ trainer: true })
    mockUser.current = await member()
    expect((await memberAsk(post({ text: 'One' }))).status).toBe(200)
    expect((await memberAsk(post({ text: 'Two' }))).status).toBe(429)
    mockUser.current = await member(false)
    expect((await memberAsk(post({ text: 'No order yet' }))).status).toBe(403)
  })

  it('founders switch it on and name the trainer', async () => {
    const res = await (await inboxSave(post({ on: true, trainer: { name: '  Sam  ', photoUrl: 'javascript:alert(1)', replyHours: 999 } }))).json()
    expect(res).toMatchObject({ on: true, live: true, trainer: { name: 'Sam', photoUrl: null, replyHours: 168 } })
  })
})

describe('the setup the trainer reads', () => {
  it('says the days by name and the kit and experience in words', () => {
    const { setupLine } = jest.requireActual('@/lib/training/view') as typeof import('@/lib/training/view')
    const line = setupLine({ focus: 'muscle', days: [4, 0, 2], minutes: 45, equipment: 'gym', experience: 'some', avoid: [] })
    expect(line).toMatch(/^.+ · 3 days \(Mon, Wed, Fri\) · 45 min · A gym · .+$/)
    expect(line).not.toMatch(/0,2,4|\bgym\b(?! )/)
  })
})
