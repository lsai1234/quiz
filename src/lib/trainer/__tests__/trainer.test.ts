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
import { DEFAULT_TRAINER } from '@/lib/offer/settings'
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
    const view = viewOf(thread, { ...DEFAULT_TRAINER, name: 'Sam', role: 'Trainer', notifyEmail: 'sam@example.com' }, true, true)
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
    expect(((await (await memberGet(new Request('http://x/api/hub/trainer'))).json()) as MemberTrainerView).live).toBe(false)
    expect((await memberAsk(post({ text: 'Hello' }))).status).toBe(404)
    await saveTrainerProfile({ name: '' })
    await saveServiceSettings({ trainer: true })
    expect((await memberAsk(post({ text: 'Hello' }))).status).toBe(404)
  })

  it('a member asks; the founders see it, answer with a video; the member reads it and is emailed', async () => {
    await saveTrainerProfile({ name: 'Sam', role: 'Co-founder · fitness expert', replyHours: 24, dailyLimit: 3, notifyEmail: 'trainer-alerts@example.com' })
    await saveServiceSettings({ trainer: true })
    const user = await member()
    mockUser.current = user
    const first = (await (await memberGet(new Request('http://x/api/hub/trainer'))).json()) as MemberTrainerView
    expect(first).toMatchObject({ live: true, open: true, left: 3, trainer: { name: 'Sam', replyHours: 24 } })
    expect(JSON.stringify(first)).not.toMatch(/trainer-alerts/)

    const asked = await memberAsk(post({ text: 'How heavy should I squat?', about: 'Barbell back squat' }))
    expect(asked.status).toBe(200)
    expect(((await asked.json()) as MemberTrainerView).left).toBe(2)
    await memberAsk(post({ text: 'And how many sets?' }))
    // One alert to the trainer for the wait, not one per question.
    const alerts = (await listNotifications({ limit: 200 })).filter((x) => x.template === 'trainer-question' && x.email === 'trainer-alerts@example.com' && JSON.stringify(x).includes(user.id))
    expect(alerts).toHaveLength(1)

    const inbox = await (await inboxGet(new Request('http://x/api/portal/trainer'))).json()
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

    const read = (await (await memberGet(new Request('http://x/api/hub/trainer'))).json()) as MemberTrainerView
    expect(read.waiting).toBe(false)
    expect(read.unread).toBe(1)
    expect(read.messages[2]).toMatchObject({ from: 'trainer', text: 'Start with the bar.', video: { url: 'https://vimeo.com/123' } })
    // Looked at: no longer new.
    expect(((await (await memberGet(new Request('http://x/api/hub/trainer'))).json()) as MemberTrainerView).unread).toBe(0)

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

describe('coaching tools: context, ratings, honest signals, the welcome, plan changes', () => {
  afterEach(async () => {
    await saveServiceSettings({ trainer: false, coaching: false, training: false })
  })

  it('keeps sensible context and drops junk', async () => {
    const { cleanContext } = await import('../store')
    expect(cleanContext({ set: 2, of: '3', kg: 20.1, reps: 8, felt: 'hard' })).toEqual({ set: 2, of: 3, kg: 20, reps: 8, felt: 'hard' })
    expect(cleanContext({ set: -1, kg: 'lots', felt: 'meh' })).toBeNull()
  })

  it('works out the median reply, ratings and answers within the promise, leaving notes and welcomes out', async () => {
    const { replyStatsFrom } = await import('../store')
    const t0 = Date.parse('2026-11-01T10:00:00Z')
    const at = (h: number) => new Date(t0 + h * 3_600_000).toISOString()
    const thread = {
      v: 1 as const, userId: 'u', email: 'e', firstName: null, waiting: false, lastAt: at(0), memberReadAt: null, trainerReadAt: null,
      messages: [
        { id: 'w', from: 'trainer' as const, text: 'Welcome', at: at(0), about: null, video: null, kind: 'welcome' as const },
        { id: 'a', from: 'member' as const, text: 'q', at: at(1), about: null, video: null },
        { id: 'b', from: 'trainer' as const, text: 'a', at: at(5), about: null, video: null, rating: 'helpful' as const },
        { id: 'c', from: 'member' as const, text: 'q', at: at(10), about: null, video: null },
        { id: 'd', from: 'member' as const, text: 'q2', at: at(11), about: null, video: null },
        { id: 'e', from: 'trainer' as const, text: 'a', at: at(40), about: null, video: null, rating: 'not-quite' as const },
      ],
    }
    const s = replyStatsFrom([thread], 24, new Date(t0 + 48 * 3_600_000))
    expect(s.answered).toBe(2)
    expect(s.medianHours).toBe(17) // 4h and 30h
    expect(s).toMatchObject({ rated: 2, helpful: 1, withinPromise: 1 })
  })

  it('sends the welcome once, asks with context, says when it was read, and takes a rating', async () => {
    await saveServiceSettings({ trainer: true, coaching: true, training: true })
    await saveTrainerProfile({ name: 'Sam', welcome: 'Welcome in. Ask me anything about your plan.' })
    const user = await member()
    mockUser.current = user
    const first = (await (await memberGet(new Request('http://x/api/hub/trainer'))).json()) as MemberTrainerView
    expect(first.messages.filter((m) => m.kind === 'welcome')).toHaveLength(1)
    await memberGet(new Request('http://x/api/hub/trainer'))
    expect(((await (await memberGet(new Request('http://x/api/hub/trainer'))).json()) as MemberTrainerView).messages.filter((m) => m.kind === 'welcome')).toHaveLength(1)

    const asked = (await (await memberAsk(post({ text: 'Too heavy?', about: 'Goblet squat', context: { set: 2, of: 3, kg: 20, reps: 8 } }))).json()) as MemberTrainerView
    expect(asked.messages.at(-1)?.context).toMatchObject({ set: 2, kg: 20 })
    expect(asked.readByTrainer).toBe(false)
    // A founder opens it: read.
    await threadGet(new Request('http://x'), params(user.id))
    expect(((await (await memberGet(new Request('http://x/api/hub/trainer'))).json()) as MemberTrainerView).readByTrainer).toBe(true)

    const { thread } = (await answerMember(user.id, { text: 'Keep it there for now.', by: 'Sam' }))!
    const answer = thread.messages.at(-1)!
    const rated = (await (await memberAsk(post({ action: 'rate', messageId: answer.id, rating: 'helpful' }))).json()) as MemberTrainerView
    expect(rated.messages.find((m) => m.id === answer.id)?.rating).toBe('helpful')
  })

  it('lets the trainer change a member’s plan, with a reason the member sees and a note in their chat', async () => {
    await saveServiceSettings({ trainer: true, coaching: true, training: true })
    await saveTrainerProfile({ name: 'Sam' })
    const user = await member()
    const { saveTraining, getTraining } = await import('@/lib/training/store')
    const { newPlan } = await import('@/lib/training/edit')
    const plan = newPlan(user.id, { days: [0, 2, 4], minutes: 45, focus: 'muscle', split: 'auto', equipment: 'gym', experience: 'some', avoid: [], activities: [], trainAt: 1080 }, new Date())
    await saveTraining({ v: 1, userId: user.id, readiness: { cleared: true, at: new Date().toISOString() }, plan })
    const s = plan.sessions.find((x) => x.type === 'strength')!
    const ex = s.type === 'strength' ? s.exercises[0] : null
    const { POST: editPlan } = await import('@/app/api/portal/trainer/[userId]/plan/route')
    const refused = await editPlan(post({ sessionId: s.id, exerciseId: ex!.id, sets: 2 }), params(user.id))
    expect(refused.status).toBe(400)
    const ok = await editPlan(post({ sessionId: s.id, exerciseId: ex!.id, sets: 2, reason: 'Fewer sets while your knee settles.' }), params(user.id))
    expect(ok.status).toBe(200)
    const saved = (await getTraining(user.id)).plan!
    const changed = saved.sessions.find((x) => x.id === s.id)!
    expect(changed.type === 'strength' && changed.exercises[0]).toMatchObject({ sets: 2, changedBy: { name: 'Sam', reason: 'Fewer sets while your knee settles.' } })
    const t = await getThread(user.id)
    expect(t?.messages.at(-1)).toMatchObject({ kind: 'change' })
    expect(t?.messages.at(-1)?.text).toContain('Fewer sets while your knee settles.')
    expect((await accessesForMember(user.id)).some((a) => a.kind === 'member-trainer')).toBe(true)
  })
})

describe('video: form checks, video notes, tags, the library and sharing', () => {
  afterEach(async () => {
    await saveServiceSettings({ trainer: false, coaching: false, training: false, video: false })
  })

  async function clip(kind: 'form-check' | 'note', owner: string | null) {
    const { beginUpload, putChunk, finishUpload } = await import('@/lib/media/store')
    const m = await beginUpload({ kind, mime: 'video/mp4', size: 4, owner })
    await putChunk(m.id, 0, Buffer.from('abcd').toString('base64'))
    return finishUpload(m.id)
  }

  it('a question carries the member’s own form check, never someone else’s; a note becomes the member’s', async () => {
    const who = { id: `v-${n++}`, email: 'v@example.com', firstName: 'V' }
    const mine = await clip('form-check', who.id)
    const theirs = await clip('form-check', 'someone-else')
    await expect(askTrainer(who, { text: 'Check my squat?', videoId: theirs.id }, 5)).rejects.toEqual(new TrainerError('clip'))
    const { message } = await askTrainer(who, { text: 'Check my squat?', videoId: mine.id }, 5)
    expect(message.video).toMatchObject({ media: mine.id, url: `/api/media/${mine.id}` })
    expect(message.video?.until).toBeTruthy()

    const note = await clip('note', null)
    const answered = await answerMember(who.id, { text: 'Here’s what I saw.', videoId: note.id, by: 'Sam' })
    expect(answered!.message.video?.media).toBe(note.id)
    const { getMedia } = await import('@/lib/media/store')
    expect((await getMedia(note.id))?.owner).toBe(who.id)
    // A note already someone else's can't be sent to another member.
    const other = { id: `v-${n++}`, email: 'w@example.com', firstName: 'W' }
    await askTrainer(other, { text: 'Hi' }, 5)
    await expect(answerMember(other.id, { text: 'x', videoId: note.id, by: 'Sam' })).rejects.toEqual(new TrainerError('clip'))
  })

  it('the member route takes a form check only while video is on, and uploads only into the member’s own clip', async () => {
    await saveServiceSettings({ trainer: true, coaching: true, training: true, video: true })
    await saveTrainerProfile({ name: 'Sam' })
    const user = await member()
    mockUser.current = user
    const { POST: media } = await import('@/app/api/hub/media/route')
    expect((await media(post({ action: 'begin', mime: 'video/mp4', size: 4, seconds: 12 }))).status).toBe(400) // no consent
    expect((await media(post({ action: 'begin', mime: 'video/mp4', size: 4, seconds: 45, consent: true }))).status).toBe(400) // too long
    const begun = await (await media(post({ action: 'begin', mime: 'video/mp4', size: 4, seconds: 12, consent: true }))).json()
    expect(begun.id).toMatch(/^m_/)
    const someone = await clip('form-check', 'someone-else')
    expect((await media(post({ action: 'chunk', id: someone.id, n: 0, data: 'YWJjZA==' }))).status).toBe(404)
    expect((await media(post({ action: 'chunk', id: begun.id, n: 0, data: 'YWJjZA==' }))).status).toBe(200)
    const done = await (await media(post({ action: 'finish', id: begun.id }))).json()
    expect(done.until).toBeTruthy()
    const asked = await memberAsk(post({ text: 'Form check please', videoId: begun.id }))
    expect(asked.status).toBe(200)
    const view = (await asked.json()) as MemberTrainerView
    expect(view.video).toBe(true)
    expect(view.messages.at(-1)?.video?.media).toBe(begun.id)

    await saveServiceSettings({ video: false })
    expect((await media(post({ action: 'begin', mime: 'video/mp4', size: 4, seconds: 12, consent: true }))).status).toBe(404)
  })

  it('tags stay in the Founders Hub; sharing needs the member’s yes, and a no takes it down', async () => {
    await saveServiceSettings({ trainer: true, coaching: true, training: true, video: true })
    await saveTrainerProfile({ name: 'Sam' })
    const user = await member()
    mockUser.current = user
    await memberAsk(post({ text: 'My knee hurts on squats' }))
    const thread = (await getThread(user.id))!
    const q = thread.messages.at(-1)!
    expect((await threadMark(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ messageId: q.id, tag: 'pain' }) }), params(user.id))).status).toBe(200)
    expect((await getThread(user.id))!.messages.at(-1)!.tag).toBe('pain')
    const { mentionsPain, savedReplies, setFeatured, getFeatured, ContentError } = await import('../content')
    expect(mentionsPain(q.text)).toBe(true)
    expect(mentionsPain('How many sets should I do?')).toBe(false)
    expect((await savedReplies())[0]).toMatchObject({ id: 'pain', builtIn: true, tag: 'pain' })

    await threadAnswer(post({ text: 'See a GP or physio first.' }), params(user.id))
    const view = (await (await memberGet(new Request('http://x/api/hub/trainer'))).json()) as MemberTrainerView
    expect(view.messages.some((m) => 'tag' in m)).toBe(false)
    const answer = view.messages.filter((m) => m.from === 'trainer' && !m.kind).at(-1)!
    await expect(setFeatured({ userId: user.id, messageId: answer.id })).rejects.toEqual(new ContentError('not-shared'))
    await memberAsk(post({ action: 'share', messageId: answer.id, ok: true }))
    const f = await setFeatured({ userId: user.id, messageId: answer.id })
    expect(f.question).toBe('My knee hurts on squats')
    await memberAsk(post({ action: 'share', messageId: answer.id, ok: false }))
    expect(await getFeatured()).toBeNull()
  })

  it('the library is rewritten words only, newest first', async () => {
    const { saveLibraryEntry, library, deleteLibraryEntry } = await import('../content')
    const a = await saveLibraryEntry({ about: 'Goblet squat', question: 'How deep?', answer: 'As deep as you can keep your heels down.' }, new Date('2026-11-01T00:00:00Z'))
    await saveLibraryEntry({ question: 'Rest between sets?', answer: 'About two minutes.' }, new Date('2026-11-02T00:00:00Z'))
    const all = await library()
    expect(all[0].question).toBe('Rest between sets?')
    await deleteLibraryEntry(a.find((e) => e.question === 'How deep?')!.id)
    expect((await library()).some((e) => e.question === 'How deep?')).toBe(false)
  })
})
