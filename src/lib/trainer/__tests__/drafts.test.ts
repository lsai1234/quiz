/**
 * @jest-environment node
 */
const mockUser: { current: unknown } = { current: null }
jest.mock('@/lib/auth/session', () => ({ getHubUser: async () => mockUser.current }))
jest.mock('@/lib/portal/guard', () => ({
  isPortalAuthed: async () => true,
  getFounder: async () => ({ email: 'founder@example.com', name: 'Sam Founder' }),
}))

import { POST as memberAsk } from '@/app/api/hub/trainer/route'
import { GET as inboxGet } from '@/app/api/portal/trainer/route'
import { GET as threadGet, POST as threadAnswer, PATCH as threadMark } from '@/app/api/portal/trainer/[userId]/route'
import { createUser } from '@/lib/db/users'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { saveServiceSettings, saveTrainerProfile } from '@/lib/offer/store'
import { exerciseById } from '@/lib/training/library'
import { beginUpload, getFrames, setFrames, deleteMedia } from '@/lib/media/store'
import { deleteAccount } from '@/lib/db/erasure'
import { PAIN_REPLY, saveReply, saveLibraryEntry } from '../content'
import { DRAFT_COPY } from '../draft-copy'
import { checkForm, clearDraft, draftFor, exerciseFor, formText, getDraft, makeDraft, pickAnswer, redact, saveDraft, type CreateFn } from '../drafts'
import { askTrainer } from '../store'

process.env.NOTIFY_TEST_ALLOWLIST = '@example.com'

const NOW = new Date('2026-11-11T10:00:00Z')
const STILL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD'

/** A stand-in for OpenAI that records each request and answers with `reply`. */
function stub(reply: unknown): CreateFn & { bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = []
  const fn = (async (body: Record<string, unknown>) => {
    bodies.push(body)
    return typeof reply === 'string' ? reply : JSON.stringify(reply)
  }) as CreateFn & { bodies: Record<string, unknown>[] }
  fn.bodies = bodies
  return fn
}

const replies = [
  { id: 'pain', title: 'Pain', text: PAIN_REPLY.text, tag: 'pain' as const, builtIn: true },
  { id: 'r1', title: 'Squat depth', text: 'Go as deep as you can keep your heels down and your back flat.', tag: 'form' as const },
]
const library = [{ id: 'l1', about: null, question: 'How long should I rest between sets?', answer: 'About two minutes on the big lifts, a minute on the smaller ones.', at: NOW.toISOString() }]
const question = (text: string, about: string | null = null) => ({ id: 'q1', text, about })

describe('what never reaches AI', () => {
  it('takes out emails, phone numbers and links', () => {
    expect(redact('Email me at jo@example.com or call 07700 900123, see https://x.co/a')).toBe('Email me at [email] or call [number], see [link]')
  })

  it('answers a question about pain with the ready reply, without AI', async () => {
    const create = stub({ pick: 0 })
    const d = await makeDraft({ question: question('My knee hurts when I squat'), replies, library, frames: [STILL] }, NOW, create)
    expect(d).toMatchObject({ kind: 'pain', text: PAIN_REPLY.text })
    expect(create.bodies).toHaveLength(0)
  })

  it('makes no draft for a question that looks medical, and sends nothing', async () => {
    const create = stub({ pick: 0 })
    expect(await makeDraft({ question: question('Is it OK to train on my blood pressure tablets?'), replies, library, frames: [] }, NOW, create)).toBeNull()
    expect(create.bodies).toHaveLength(0)
  })

  it('without a key or a stand-in, makes no AI draft (pain still gets its reply)', async () => {
    const key = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      expect(await makeDraft({ question: question('How deep should I squat?'), replies, library, frames: [] }, NOW)).toBeNull()
      expect((await makeDraft({ question: question('It hurts at the bottom'), replies, library, frames: [] }, NOW))?.kind).toBe('pain')
    } finally {
      if (key !== undefined) process.env.OPENAI_API_KEY = key
    }
  })
})

describe('a question draft is one of the expert’s own answers', () => {
  it('picks a saved reply or a library entry, and sends the question without contact details', async () => {
    const create = stub({ pick: 0 })
    const d = await makeDraft({ question: question('How deep should I go? Reply to jo@example.com'), replies, library, frames: [] }, NOW, create)
    // The built-in pain reply is never a candidate: index 0 is the expert's first own reply.
    expect(d).toMatchObject({ kind: 'saved', text: replies[1].text, from: 'Squat depth', messageId: 'q1' })
    const body = JSON.stringify(create.bodies[0])
    expect(body).not.toContain('jo@example.com')
    expect(create.bodies[0]).toMatchObject({ store: false })

    const lib = await makeDraft({ question: question('Rest between sets?'), replies, library, frames: [] }, NOW, stub({ pick: 1 }))
    expect(lib).toMatchObject({ kind: 'library', text: library[0].answer, from: library[0].question })
  })

  it('makes none when AI says none fits, or answers out of range or not as JSON', async () => {
    for (const reply of [{ pick: -1 }, { pick: 7 }, { pick: 0.5 }, 'not json']) {
      expect(await makeDraft({ question: question('What about cardio?'), replies, library, frames: [] }, NOW, stub(reply))).toBeNull()
    }
    expect(await pickAnswer('Anything', [], stub({ pick: 0 }))).toBeNull()
  })
})

describe('a form-check draft is the library’s own words', () => {
  const goblet = exerciseById('goblet-squat')!

  it('finds the exercise from what it is about, or a name in the question', () => {
    expect(exerciseFor('Goblet squat', '')?.id).toBe('goblet-squat')
    expect(exerciseFor(null, 'Can you check my front squat?')?.id).toBe('front-squat')
    expect(exerciseFor(null, 'Can you check this?')).toBeNull()
  })

  it('watches the whole clip in order, ticks the mistakes it can see and the cues that fit', async () => {
    const create = stub({ visible: true, mistakes: [0], cues: [1] })
    const d = await makeDraft({ question: question('Can you check my form?', 'Goblet squat'), replies, library, frames: [STILL, STILL] }, NOW, create)
    expect(d?.kind).toBe('form')
    expect(d?.from).toBe('Goblet squat')
    expect(d?.text).toContain(DRAFT_COPY.formOpen)
    expect(d?.text).toContain(DRAFT_COPY.formSeen)
    expect(d?.text).toContain(goblet.mistakes[0])
    expect(d?.text).toContain(goblet.cues[1])
    expect(d?.text).not.toContain(goblet.mistakes[1])
    const content = (create.bodies[0].messages as { content: unknown }[])[1].content as { type: string; image_url?: { detail: string } }[]
    expect(content.filter((c) => c.type === 'image_url')).toHaveLength(2)
    expect(content.find((c) => c.type === 'image_url')?.image_url?.detail).toBe('low')
  })

  it('says it looks solid when nothing is seen, and asks for another clip when it can’t see', async () => {
    const clean = formText(goblet, { visible: true, mistakes: [], cues: [] })
    expect(clean).toContain(DRAFT_COPY.formClean)
    expect(clean).toContain(goblet.cues[0])
    expect(formText(goblet, { visible: false, mistakes: [], cues: [] })).toBe(`${DRAFT_COPY.formOpen} ${DRAFT_COPY.formUnclear}`)
    const d = await makeDraft({ question: question('Form check', 'Goblet squat'), replies, library, frames: [STILL] }, NOW, stub({ visible: false, mistakes: [], cues: [] }))
    expect(d?.kind).toBe('unclear')
  })

  it('keeps only indexes in the lists', async () => {
    const v = await checkForm([STILL], goblet, stub({ visible: true, mistakes: [0, 9, -1, 0], cues: [5, 1] }))
    expect(v).toEqual({ visible: true, mistakes: [0], cues: [1] })
  })
})

describe('in the inbox', () => {
  let n = 0
  async function member() {
    const email = `drafts-${Date.now()}-${n++}@example.com`
    const user = (await createUser({ email, password: 'a-long-password-1', name: 'Jo Bloggs' } as never)) as { id: string; email: string; name: string | null }
    await createOrderFromCheckout({ channel: 'quiz', email, status: 'paid', lines: [{ sku: null, productId: MOCK_CATALOGUE[0].id, title: 'x', quantity: 1, unitPrice: 20 }] })
    return user
  }

  beforeAll(async () => {
    await saveServiceSettings({ trainer: true, training: true, video: true })
    await saveTrainerProfile({ name: 'Sam', aiDrafts: true })
    await saveReply({ title: 'Rest times', text: 'About two minutes on the big lifts.' })
    await saveLibraryEntry({ question: 'How often should I train?', answer: 'Three times a week suits most people starting out.' })
  })

  it('waits beside the newest question, shows on the row, and goes once answered', async () => {
    const user = await member()
    const { message } = await askTrainer({ id: user.id, email: user.email, firstName: 'Jo' }, { text: 'How long should I rest?' }, 5, NOW)
    const d = await draftFor(user.id, message.id, stub({ pick: 0 }))
    expect(d?.kind).toBe('saved')
    expect((await getDraft(user.id))?.messageId).toBe(message.id)

    const inbox = (await (await inboxGet(new Request('http://x'))).json()) as { inbox: { userId: string; drafted?: boolean }[] }
    expect(inbox.inbox.find((r) => r.userId === user.id)?.drafted).toBe(true)
    const opened = (await (await threadGet(new Request('http://x'), { params: Promise.resolve({ userId: user.id }) })).json()) as { draft: { text: string } | null }
    expect(opened.draft?.text).toBe('About two minutes on the big lifts.')

    const answered = await threadAnswer(new Request('http://x', { method: 'POST', body: JSON.stringify({ text: opened.draft!.text }) }), { params: Promise.resolve({ userId: user.id }) })
    expect(answered.status).toBe(200)
    expect(await getDraft(user.id)).toBeNull()
  })

  it('is not shown for an older question, and goes when marked answered another way', async () => {
    const user = await member()
    const first = await askTrainer({ id: user.id, email: user.email, firstName: 'Jo' }, { text: 'How often should I train?' }, 5, NOW)
    await saveDraft(user.id, { messageId: first.message.id, kind: 'library', text: 'x', from: 'y', at: NOW.toISOString() })
    await askTrainer({ id: user.id, email: user.email, firstName: 'Jo' }, { text: 'And how long for?' }, 5, NOW)
    const opened = (await (await threadGet(new Request('http://x'), { params: Promise.resolve({ userId: user.id }) })).json()) as { draft: unknown }
    expect(opened.draft).toBeNull()
    await threadMark(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ waiting: false }) }), { params: Promise.resolve({ userId: user.id }) })
    expect(await getDraft(user.id)).toBeNull()
  })

  it('reads a form check’s frames, kept with the clip and deleted with it', async () => {
    const user = await member()
    const m = await beginUpload({ kind: 'form-check', mime: 'video/mp4', size: 1000, owner: user.id })
    expect(await setFrames(m.id, 0, [STILL, 'not an image', STILL, 42])).toBe(2)
    expect(await setFrames(m.id, 1, [STILL])).toBe(1)
    expect(await setFrames(m.id, 6, [STILL])).toBe(0)
    expect(await getFrames(m.id)).toHaveLength(3)
    const create = stub({ visible: true, mistakes: [1], cues: [0] })
    const { message } = await askTrainer({ id: user.id, email: user.email, firstName: 'Jo' }, { text: 'Can you check my goblet squat?', about: 'Goblet squat' }, 5, NOW)
    // The clip on the question (askTrainer only links a finished upload): point the draft at it directly.
    const { getThread } = await import('../store')
    const t = (await getThread(user.id))!
    t.messages.find((x) => x.id === message.id)!.video = { url: `/api/media/${m.id}`, title: null, media: m.id }
    await (await import('@/lib/db/kv')).kvSet(`trainer-thread:${user.id}`, t)
    const d = await draftFor(user.id, message.id, create)
    expect(d?.kind).toBe('form')
    expect(create.bodies).toHaveLength(1)
    await deleteMedia(m.id)
    expect(await getFrames(m.id)).toEqual([])
  })

  it('starts when a member asks, while AI drafts are on', async () => {
    const user = await member()
    mockUser.current = user
    const asked = await memberAsk(new Request('http://x', { method: 'POST', body: JSON.stringify({ text: 'My shoulder hurts on the press. What should I do?' }) }))
    expect(asked.status).toBe(200)
    expect((await getDraft(user.id))?.kind).toBe('pain')

    await saveTrainerProfile({ aiDrafts: false })
    const other = await member()
    mockUser.current = other
    await memberAsk(new Request('http://x', { method: 'POST', body: JSON.stringify({ text: 'My knee hurts on lunges.' }) }))
    expect(await getDraft(other.id)).toBeNull()
    await saveTrainerProfile({ aiDrafts: true })
  })

  it('goes with the account', async () => {
    const user = await member()
    await saveDraft(user.id, { messageId: 'm', kind: 'saved', text: 'x', from: null, at: NOW.toISOString() })
    await deleteAccount(user.id)
    expect(await getDraft(user.id)).toBeNull()
    await clearDraft(user.id)
  })
})
