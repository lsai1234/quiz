'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Checkbox, Disclosure, Input, Note, Select, Textarea } from '@/components/system'
import type { TrainerProfile } from '@/lib/offer/settings'
import { TRAINER_COPY, TRAINER_MAX } from '@/lib/trainer/copy'
import type { EditablePlan } from '@/lib/trainer/plan-view'
import { mentionsPain } from '@/lib/trainer/triage'
import type { InboxRow, TriageTag, TrainerThread } from '@/lib/trainer/types'
import { DRAFT_COPY } from '@/lib/trainer/draft-copy'
import type { TrainerDraft } from '@/lib/trainer/drafts'
import { AnswerActions, SavedReplyPicker, TagSelect, TrainerContentSettings, TrainerVideoRow, VideoNoteRow, useContent, type Content, type NoteClip } from './TrainerVideoTools'

/**
 * Founders Hub → Trainer: members' questions, and the answers.
 *
 * The inbox lists everyone waiting first, the longest wait at the top. A
 * member's questions open with what an answer needs (their training setup,
 * whether their hub is open) and a box to answer, with a video if it helps.
 * Answers go out under the trainer's name, and the member is emailed that one
 * is waiting. Opening someone's questions is logged as an access to their
 * record, as opening an order is.
 *
 * The trainer's profile sits above it: who members see, how soon they can
 * expect an answer, how many questions a day, and where alerts go.
 */

interface Inbox {
  on: boolean
  live: boolean
  trainer: TrainerProfile
  inbox: InboxRow[]
  waiting: number
  plansWaiting: number
  stats?: { medianHours: number | null; answered: number; rated: number; helpful: number; withinPromise: number }
}

interface PlanRow {
  userId: string
  email: string | null
  firstName: string | null
  since: string
  source: 'ai' | 'rules'
  setup: string
  sessions: { day: number; title: string; moves: string[] }[]
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Opened {
  thread: TrainerThread
  member: { firstName: string | null; email: string; hub: string; hubUntil: string | null }
  training: { setup: string; sessions: number; done: number; checked: 'waiting' | 'checked' | null } | null
  /** Their week for the plan editor, while the coaching tools are on. */
  plan?: EditablePlan | null
  /** An AI draft for their newest question, waiting for the fitness expert. */
  draft?: TrainerDraft | null
}

const HEADING = { fontSize: 'var(--text-title)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' } as const
const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' } as const
const BODY = { fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-2)' } as const
const STRONG = { fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' } as const

/** Where a draft's words came from, for the fitness expert. */
function draftFrom(d: TrainerDraft): string {
  const f = DRAFT_COPY
  switch (d.kind) {
    case 'pain':
      return f.fromPain
    case 'saved':
      return f.fromSaved(d.from ?? '')
    case 'library':
      return f.fromLibrary(d.from ?? '')
  }
}

function ago(at: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - Date.parse(at)) / 60_000))
  if (mins < 60) return `${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.round(hours / 24)} days`
}
const stamp = (at: string) => new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function TrainerInbox() {
  const [view, setView] = useState<Inbox | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  // `?samples=1` (Settings → Test views): the sample members, in place of real ones.
  const [samples] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('samples') === '1')
  const [content, setContent] = useContent(samples)

  const load = useCallback(async () => {
    try {
      const r = await fetch(samples ? '/api/portal/trainer?samples=1' : '/api/portal/trainer')
      if (!r.ok) throw new Error()
      setView((await r.json()) as Inbox)
    } catch {
      setError('Couldn’t load the inbox.')
    }
  }, [samples])

  useEffect(() => {
    void load()
    // From the "new question" email: /founderhub/trainer?member=<id>
    const m = new URLSearchParams(window.location.search).get('member')
    if (m) setOpenId(m)
  }, [load])

  if (error) return <Note tone="critical">{error}</Note>
  if (!view) return <p style={META}>Loading…</p>

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-5)' }} data-trainer-inbox>
      <header className="flex flex-wrap items-end justify-between" style={{ gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ ...HEADING, fontSize: 'var(--text-display)' }}>Trainer</h1>
          <p style={{ ...BODY, marginTop: 'var(--space-1)' }}>Members’ questions about their training. A real person answers every one: nothing here goes to an AI.</p>
        </div>
        <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
          {view.stats && view.stats.answered > 0 && (
            <Badge tone="neutral" dot>
              {`Median reply ${view.stats.medianHours}h · ${view.stats.answered} answered in 30 days`}
            </Badge>
          )}
          {view.stats && view.stats.rated > 0 && <Badge tone="neutral" dot>{`${Math.round((view.stats.helpful / view.stats.rated) * 100)}% helpful (${view.stats.rated} rated)`}</Badge>}
          {view.waiting > 0 && <Badge tone="attention" dot>{`${view.waiting} waiting`}</Badge>}
          {view.plansWaiting > 0 && <Badge tone="info" dot>{`${view.plansWaiting} plan${view.plansWaiting === 1 ? '' : 's'} to check`}</Badge>}
          <Badge tone={view.live ? 'positive' : 'neutral'} dot>
            {view.live ? 'Live in the hub' : view.on ? 'Needs a name' : 'Switched off'}
          </Badge>
        </div>
      </header>

      {samples ? (
        <Note tone="attention" icon="info">
          Sample members from Settings → Test views, in place of real ones. Answer and check them freely: nothing reaches anyone. What you add to the answers library or the
          results page here shows only in test views, and Reset sample data clears it.{' '}
          <a href="/founderhub/trainer" style={{ textDecoration: 'underline' }}>
            Back to real members
          </a>
        </Note>
      ) : (
        <>
          <ProfileSettings view={view} onSaved={setView} video={content?.video ?? false} />
          {content && <TrainerContentSettings content={content} onContent={setContent} />}
        </>
      )}

      {view.trainer.checksPlans && !openId && <PlansToCheck samples={samples} onChecked={() => void load()} />}

      {openId ? (
        <ThreadView userId={openId} trainerName={view.trainer.name} content={content} onContent={setContent} samples={samples} onBack={() => { setOpenId(null); void load() }} />
      ) : (
        <InboxList rows={view.inbox} onOpen={setOpenId} />
      )}
    </div>
  )
}

function InboxList({ rows, onOpen }: { rows: InboxRow[]; onOpen: (id: string) => void }) {
  if (!rows.length) {
    return (
      <Card padding="roomy">
        <p style={BODY}>No questions yet. When a member asks, it lands here, and the trainer’s alert email goes out if one is set.</p>
      </Card>
    )
  }
  return (
    <ul className="flex flex-col" style={{ gap: 'var(--space-2)' }} aria-label="Questions">
      {rows.map((r) => (
        <li key={r.userId} data-inbox-row={r.userId} data-waiting={r.waiting}>
          <Card padding="normal" interactive solid>
            <div className="flex items-start justify-between" style={{ gap: 'var(--space-3)' }}>
              <div className="min-w-0" style={{ flex: 1 }}>
                <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
                  <p style={STRONG}>{r.firstName ?? r.email}</p>
                  {r.waiting && <Badge tone="attention">{r.waitingSince ? `Waiting ${ago(r.waitingSince)}` : 'Waiting'}</Badge>}
                  {r.unread && <Badge tone="accent" dot>New</Badge>}
                  {r.waiting && r.drafted && <Badge tone="info">{DRAFT_COPY.badge}</Badge>}
                </div>
                <p style={{ ...META, marginTop: 'var(--space-1)' }}>{`${r.email} · ${r.messages} message${r.messages === 1 ? '' : 's'} · ${stamp(r.lastAt)}`}</p>
                <p style={{ ...BODY, marginTop: 'var(--space-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.preview}</p>
              </div>
              <Button variant={r.waiting ? 'primary' : 'secondary'} size="sm" onClick={() => onOpen(r.userId)} data-open-thread={r.userId}>
                {r.waiting ? 'Answer' : 'Open'}
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  )
}

function ThreadView({
  userId,
  trainerName,
  content,
  onContent,
  samples = false,
  onBack,
}: {
  userId: string
  trainerName: string
  content: Content | null
  onContent: (c: Content) => void
  samples?: boolean
  onBack: () => void
}) {
  const [opened, setOpened] = useState<Opened | null>(null)
  const [missing, setMissing] = useState(false)
  const [text, setText] = useState('')
  const [note, setNote] = useState<NoteClip | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoTitle, setVideoTitle] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/portal/trainer/${encodeURIComponent(userId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((o: Opened) => {
        setOpened(o)
        // A draft waiting: it goes in the box, to check, edit or clear. Nothing is sent until Answer.
        if (o.draft) setText((t) => t || o.draft!.text)
      })
      .catch(() => setMissing(true))
  }, [userId])

  async function answer() {
    setSending(true)
    setError(null)
    try {
      const r = await fetch(`/api/portal/trainer/${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, videoUrl, videoTitle, videoId: note?.id ?? null }),
      })
      const d = (await r.json()) as { thread?: TrainerThread; error?: string }
      if (!r.ok || !d.thread) {
        setError(
          d.error === 'video'
            ? 'Use an https link to YouTube or Vimeo, or a video note.'
            : d.error === 'clip'
              ? 'That video note can’t go to this member. Record or upload it again.'
              : d.error === 'too-long'
                ? `Keep it under ${TRAINER_MAX} characters.`
                : 'That didn’t send.',
        )
        return
      }
      setOpened((o) => (o ? { ...o, thread: d.thread!, draft: null } : o))
      setText('')
      setNote(null)
      setVideoUrl('')
      setVideoTitle('')
    } finally {
      setSending(false)
    }
  }

  async function tag(messageId: string, value: TriageTag | null) {
    const r = await fetch(`/api/portal/trainer/${encodeURIComponent(userId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId, tag: value }) })
    if (r.ok) {
      const d = (await r.json()) as { thread: TrainerThread }
      setOpened((o) => (o ? { ...o, thread: d.thread } : o))
    }
  }

  // The questions since the last answer: what the pain reply and the library look at.
  const lastQuestion = (() => {
    const msgs = opened?.thread.messages ?? []
    const out: string[] = []
    for (let i = msgs.length - 1; i >= 0 && msgs[i].from === 'member'; i--) out.unshift(msgs[i].text)
    return out.join('\n\n')
  })()
  const questionBefore = (i: number) => {
    const msgs = opened?.thread.messages ?? []
    const out: string[] = []
    let about: string | null = null
    for (let j = i - 1; j >= 0 && msgs[j].from === 'member'; j--) {
      out.unshift(msgs[j].text)
      about = about ?? msgs[j].about
    }
    return { text: out.join('\n\n'), about }
  }

  async function mark(waiting: boolean) {
    const r = await fetch(`/api/portal/trainer/${encodeURIComponent(userId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ waiting }) })
    if (r.ok) {
      const d = (await r.json()) as { thread: TrainerThread }
      setOpened((o) => (o ? { ...o, thread: d.thread } : o))
    }
  }

  return (
    <section className="flex flex-col" style={{ gap: 'var(--space-3)' }} data-thread={userId}>
      <div>
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={onBack}>
          All questions
        </Button>
      </div>
      {missing && <Note tone="critical">That member’s questions aren’t here.</Note>}
      {opened && (
        <>
          <Card padding="normal">
            <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--space-2)' }}>
              <div>
                <p style={STRONG}>{opened.member.firstName ?? opened.member.email}</p>
                <p style={META}>{opened.member.email}</p>
              </div>
              <Badge tone={opened.member.hub === 'member' || opened.member.hub === 'subscriber' ? 'positive' : 'neutral'}>
                {opened.member.hub === 'subscriber' ? 'Monthly member' : opened.member.hub === 'member' ? `Hub open until ${opened.member.hubUntil}` : 'Hub closed'}
              </Badge>
            </div>
            <p style={{ ...BODY, marginTop: 'var(--space-3)' }} data-thread-training>
              {opened.training
                ? `Training plan: ${opened.training.setup}. ${opened.training.done} of ${opened.training.sessions} sessions done this week.${
                    opened.training.checked === 'waiting' ? ' Waiting for your check.' : opened.training.checked === 'checked' ? ' Checked.' : ''
                  }`
                : 'No training plan built yet.'}
            </p>
          </Card>

          {opened.plan && <PlanEditor userId={userId} plan={opened.plan} onChanged={(plan, thread) => setOpened((o) => (o ? { ...o, plan, thread } : o))} />}

          <ol className="flex flex-col" style={{ gap: 'var(--space-2)' }} aria-label="Messages">
            {opened.thread.messages.map((m, i) => (
              <li key={m.id} className={m.from === 'trainer' ? 'flex justify-end' : 'flex'}>
                <div style={{ maxWidth: '85%' }}>
                  <Card padding="tight" tone={m.from === 'trainer' ? 'accent' : undefined} solid={m.from !== 'trainer'}>
                    {m.kind === 'welcome' && <p style={META}>The welcome every new member gets</p>}
                    {m.about && <p style={{ ...META, color: 'var(--accent)', fontWeight: 'var(--weight-strong)' }}>{`About: ${m.about}`}</p>}
                    {m.context && <p style={META} data-thread-context>{TRAINER_COPY.contextLine(m.context)}</p>}
                    <p style={{ ...BODY, color: 'var(--ink-1)', whiteSpace: 'pre-line' }}>{m.text}</p>
                    {m.rating && (
                      <p style={{ ...META, marginTop: 'var(--space-1)' }} data-thread-rating={m.rating}>
                        {m.rating === 'helpful' ? 'They found this helpful' : 'They said: not quite'}
                      </p>
                    )}
                    {m.video?.media ? (
                      m.video.until && Date.parse(m.video.until) <= Date.now() ? (
                        <p style={{ ...META, marginTop: 'var(--space-2)' }}>The clip was deleted after 30 days.</p>
                      ) : (
                        <video src={m.video.url} poster={`${m.video.url}?still=1`} controls playsInline preload="metadata" style={{ width: '100%', marginTop: 'var(--space-2)', borderRadius: 'var(--radius-card)' }} data-thread-clip />
                      )
                    ) : (
                      m.video && (
                        <p style={{ ...META, marginTop: 'var(--space-2)' }}>
                          <a href={m.video.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                            {m.video.title ?? m.video.url}
                          </a>
                        </p>
                      )
                    )}
                    {m.from === 'member' && content?.video && <TagSelect value={m.tag} onChange={(t) => void tag(m.id, t)} />}
                  </Card>
                  {m.from === 'trainer' && !m.kind && content?.video && (
                    <AnswerActions
                      userId={userId}
                      messageId={m.id}
                      question={questionBefore(i).text}
                      about={questionBefore(i).about}
                      answer={m.text}
                      shareOk={m.shareOk}
                      featured={content.featured?.source.messageId === m.id}
                      onContent={onContent}
                      samples={samples}
                    />
                  )}
                  <p style={{ ...META, marginTop: 'var(--space-1)', textAlign: m.from === 'trainer' ? 'right' : 'left' }}>
                    {m.from === 'trainer' ? `${trainerName || 'Trainer'}${m.by ? ` (sent by ${m.by})` : ''}` : opened.member.firstName ?? 'Member'} · {stamp(m.at)}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <Card padding="normal" elevation={2}>
            <div className="flex flex-col" style={{ gap: 'var(--space-3)' }} data-answer>
              {content?.video && <SavedReplyPicker replies={content.replies} pain={opened.thread.waiting && mentionsPain(lastQuestion)} onPick={(t) => setText((x) => (x.trim() ? `${x.trim()}\n\n${t}` : t))} />}
              {opened.draft && opened.thread.waiting && (
                <div data-ai-draft={opened.draft.kind}>
                  <Note tone="info" icon="info">
                    <span style={{ display: 'block', fontWeight: 'var(--weight-strong)' }}>{DRAFT_COPY.noteTitle}</span>
                    <span style={{ display: 'block' }}>{draftFrom(opened.draft)}</span>
                    <span style={{ display: 'block' }}>{DRAFT_COPY.noteNothingSent}</span>
                    <span style={{ display: 'block', marginTop: 'var(--space-2)' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (text === opened.draft?.text) setText('')
                          setOpened((o) => (o ? { ...o, draft: null } : o))
                        }}
                        data-ai-draft-clear
                      >
                        {DRAFT_COPY.discard}
                      </Button>
                    </span>
                  </Note>
                </div>
              )}
              <Textarea label="Your answer" rows={6} value={text} onChange={(e) => setText(e.target.value)} hint={`Goes out as ${trainerName || 'the trainer'}. Coaching, not medical advice: for pain or a condition, point them to a GP or physio.`} />
              <div className="grid sm:grid-cols-2" style={{ gap: 'var(--space-3)' }}>
                <Input label="Video link (optional)" placeholder="https://youtu.be/…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} hint="YouTube or Vimeo" />
                <Input label="Video title (optional)" placeholder="Squat set-up" value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} />
              </div>
              {content?.video && !videoUrl.trim() && <VideoNoteRow clip={note} onClip={setNote} />}
              {error && <Note tone="critical">{error}</Note>}
              <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
                <Button variant="primary" icon="send" disabled={!text.trim() || sending} loading={sending} onClick={() => void answer()} data-send-answer>
                  Send answer
                </Button>
                {opened.thread.waiting ? (
                  <Button variant="ghost" size="sm" onClick={() => void mark(false)}>
                    Mark as answered
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => void mark(true)}>
                    Back on the waiting list
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </>
      )}
    </section>
  )
}

// Switches and uploads save on their own; the form's copy of them may be stale.
const withoutChecks = <T extends { checksPlans?: unknown; qualificationsConfirmed?: unknown; welcomeVideo?: unknown; introVideo?: unknown; aiDrafts?: unknown }>(d: T) => {
  const { checksPlans: _a, qualificationsConfirmed: _b, welcomeVideo: _c, introVideo: _d, aiDrafts: _e, ...rest } = d
  return rest
}

function ProfileSettings({ view, onSaved, video }: { view: Inbox; onSaved: (v: Inbox) => void; video: boolean }) {
  const [draft, setDraft] = useState({ ...view.trainer, photoUrl: view.trainer.photoUrl ?? '', notifyEmail: view.trainer.notifyEmail ?? '', replyHours: String(view.trainer.replyHours), dailyLimit: String(view.trainer.dailyLimit) })
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const set = (k: keyof typeof draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }))

  async function save(on?: boolean, extra: Partial<TrainerProfile> = {}) {
    setSaving(true)
    setNote(null)
    try {
      const r = await fetch('/api/portal/trainer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(on === undefined ? {} : { on }),
          // The checks switch saves on its own; the form's copy of it may be stale.
          trainer: { ...withoutChecks(draft), replyHours: Number(draft.replyHours), dailyLimit: Number(draft.dailyLimit), photoUrl: draft.photoUrl || null, notifyEmail: draft.notifyEmail || null, ...extra },
        }),
      })
      if (!r.ok) throw new Error()
      onSaved((await r.json()) as Inbox)
      setNote('Saved.')
    } catch {
      setNote('Couldn’t save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card padding="normal">
      <Disclosure summary="The trainer’s profile and switch" defaultOpen={!view.trainer.name}>
        <div className="flex flex-col" style={{ gap: 'var(--space-3)', paddingTop: 'var(--space-3)' }} data-trainer-profile>
          <Checkbox
            label="Members can ask the trainer"
            hint="Shows in every open hub, on each exercise, and on the results page as part of the hub. Needs a name below."
            checked={view.on}
            disabled={saving}
            onChange={(e) => void save(e.target.checked)}
            data-trainer-on
          />
          <Checkbox
            label="The trainer checks every new training plan"
            hint="New plans, new setups and rebuilt weeks wait under Plans to check. Members see “being checked” until it’s ticked, and the results page says every plan is checked."
            checked={view.trainer.checksPlans}
            disabled={saving}
            onChange={(e) => void save(undefined, { checksPlans: e.target.checked })}
            data-trainer-checks
          />
          <Checkbox
            label={DRAFT_COPY.settingLabel}
            hint={DRAFT_COPY.settingHint}
            checked={view.trainer.aiDrafts}
            disabled={saving}
            onChange={(e) => void save(undefined, { aiDrafts: e.target.checked })}
            data-trainer-ai-drafts
          />
          <div className="grid sm:grid-cols-2" style={{ gap: 'var(--space-3)' }}>
            <Input label="Name members see" value={draft.name} onChange={set('name')} placeholder="Your first name" data-trainer-name />
            <Input label="One line under it" value={draft.role} onChange={set('role')} placeholder="Co-founder · fitness expert" />
          </div>
          <Textarea label="About them, in their own words" rows={3} value={draft.bio} onChange={set('bio')} hint="Shown at the top of the chat. Who they are and how they train; nothing about products or health." />
          <Input label="Photo (https link or a path on this site)" value={draft.photoUrl} onChange={set('photoUrl')} placeholder="https://…" />
          <Textarea
            label="Welcome for new members"
            rows={3}
            value={draft.welcome}
            onChange={set('welcome')}
            hint="Written once, sent to each member as their hub opens (coaching tools on), and labelled as one you send everyone. Coaching only: nothing about products or health."
          />
          <div className="grid sm:grid-cols-2" style={{ gap: 'var(--space-3)' }}>
            <Input label="Days you answer" value={draft.answersOn} onChange={set('answersOn')} placeholder="Monday to Friday" hint="Said on screen, so a weekend wait isn’t a broken promise." />
            <Input label="Qualifications you hold" value={draft.qualifications} onChange={set('qualifications')} placeholder="Level 3 Personal Trainer" hint="Exactly as on the certificate. Shown only once confirmed below." />
          </div>
          <Checkbox
            label="These qualifications are confirmed"
            hint="Tick once the certificate and professional liability insurance are checked. Until then, nothing about qualifications shows anywhere."
            checked={view.trainer.qualificationsConfirmed}
            disabled={saving}
            onChange={(e) => void save(undefined, { qualificationsConfirmed: e.target.checked })}
            data-trainer-qualifications-confirmed
          />
          {video && (
            <div className="grid sm:grid-cols-2" style={{ gap: 'var(--space-4)' }} data-trainer-videos>
              <TrainerVideoRow
                label="Intro video"
                hint="A minute on who they are and how they coach. Shows on their About page and, with Video on, on the results page."
                id={view.trainer.introVideo}
                onSet={(id) => save(undefined, { introVideo: id })}
              />
              <TrainerVideoRow label="Welcome video" hint="Plays with the welcome every new member gets." id={view.trainer.welcomeVideo} onSet={(id) => save(undefined, { welcomeVideo: id })} />
            </div>
          )}
          <div className="grid sm:grid-cols-3" style={{ gap: 'var(--space-3)' }}>
            <Input label="Answers within (hours)" inputMode="numeric" value={draft.replyHours} onChange={set('replyHours')} />
            <Input label="Questions a day, per member" inputMode="numeric" value={draft.dailyLimit} onChange={set('dailyLimit')} />
            <Input label="Alert email" type="email" value={draft.notifyEmail} onChange={set('notifyEmail')} placeholder="trainer@…" hint="Private. Emailed when a question starts a wait." />
          </div>
          <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
            <Button variant="primary" size="sm" loading={saving} onClick={() => void save()} data-trainer-save>
              Save profile
            </Button>
            {note && <p style={META}>{note}</p>}
          </div>
        </div>
      </Disclosure>
    </Card>
  )
}

/**
 * Plans to check: each new plan, new setup or rebuilt week, longest wait first,
 * with who it's for, their setup and the week exercise by exercise. "Looks
 * good" ticks it; a note goes to their chat with it, and emails them.
 */
function PlansToCheck({ samples = false, onChecked }: { samples?: boolean; onChecked: () => void }) {
  const [plans, setPlans] = useState<PlanRow[] | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(samples ? '/api/portal/trainer/plans?samples=1' : '/api/portal/trainer/plans')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { plans: PlanRow[] }) => setPlans(d.plans))
      .catch(() => setPlans([]))
  }, [samples])
  useEffect(() => load(), [load])

  async function check(userId: string) {
    setBusy(userId)
    try {
      const r = await fetch('/api/portal/trainer/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, note: notes[userId] ?? '' }) })
      if (r.ok) {
        setPlans((ps) => (ps ?? []).filter((p) => p.userId !== userId))
        onChecked()
      }
    } finally {
      setBusy(null)
    }
  }

  if (!plans) return null
  return (
    <section id="plans" className="flex flex-col" style={{ gap: 'var(--space-2)' }} aria-labelledby="plans-heading" data-plans-to-check>
      <h2 id="plans-heading" style={HEADING}>{`Plans to check (${plans.length})`}</h2>
      {plans.length === 0 ? (
        <p style={BODY}>Every plan is checked.</p>
      ) : (
        plans.map((p) => (
          <Card key={p.userId} padding="normal" solid>
            <div className="flex flex-col" style={{ gap: 'var(--space-3)' }} data-plan-row={p.userId}>
              <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--space-2)' }}>
                <div>
                  <p style={STRONG}>{p.firstName ?? p.email ?? 'Member'}</p>
                  <p style={META}>{`${p.email ?? ''} · waiting ${ago(p.since)} · built by ${p.source === 'ai' ? 'the AI builder' : 'the rules'}`}</p>
                </div>
              </div>
              <p style={BODY}>{p.setup}</p>
              <Disclosure summary={`See the week (${p.sessions.length} sessions)`}>
                <ol className="flex flex-col" style={{ gap: 'var(--space-2)', paddingTop: 'var(--space-2)' }}>
                  {p.sessions.map((s, i) => (
                    <li key={`${s.day}-${i}`} style={BODY}>
                      <span style={{ ...STRONG, fontSize: 'var(--text-body-sm)' }}>{`${DAYS[s.day]} · ${s.title}`}</span>
                      <span style={{ display: 'block' }}>{s.moves.join(', ')}</span>
                    </li>
                  ))}
                </ol>
              </Disclosure>
              <Textarea
                label="A note for them (optional)"
                rows={2}
                value={notes[p.userId] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [p.userId]: e.target.value }))}
                hint="Goes to their chat with you, and emails them. Leave it empty to just tick it."
              />
              <div>
                <Button variant="primary" size="sm" icon="check" loading={busy === p.userId} disabled={busy !== null} onClick={() => void check(p.userId)} data-check-plan={p.userId}>
                  {(notes[p.userId] ?? '').trim() ? 'Checked: send the note' : 'Looks good'}
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}
    </section>
  )
}

/**
 * The trainer changes the plan directly: swap an exercise for one that suits
 * the member, or change its sets and reps, with a reason the member sees as
 * "Changed by [Name]". A note in their chat says what changed and why.
 */
function PlanEditor({ userId, plan, onChanged }: { userId: string; plan: EditablePlan; onChanged: (plan: EditablePlan, thread: TrainerThread) => void }) {
  const [editing, setEditing] = useState<{ sessionId: string; exerciseId: string } | null>(null)
  const [draft, setDraft] = useState({ swapTo: '', sets: '', low: '', high: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!editing) return
    setBusy(true)
    setError(null)
    const n = (v: string) => (v.trim() ? Number(v) : null)
    const r = await fetch(`/api/portal/trainer/${encodeURIComponent(userId)}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editing, swapTo: draft.swapTo || null, sets: n(draft.sets), low: n(draft.low), high: n(draft.high), reason: draft.reason }),
    }).catch(() => null)
    const d = r ? ((await r.json().catch(() => null)) as { plan?: EditablePlan; thread?: TrainerThread; error?: string } | null) : null
    setBusy(false)
    if (!r?.ok || !d?.plan || !d.thread) {
      setError(d?.error ?? 'That didn’t save.')
      return
    }
    onChanged(d.plan, d.thread)
    setEditing(null)
  }

  return (
    <Card padding="normal">
      <Disclosure summary="Their plan: change it directly">
        <div className="flex flex-col" style={{ gap: 'var(--space-4)', paddingTop: 'var(--space-3)' }} data-plan-editor>
          {plan.sessions.map((s) => (
            <section key={s.id} className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
              <p style={STRONG}>{`${s.title}${s.done ? ' · done' : ''}`}</p>
              {s.exercises.map((e) => {
                const open = editing?.sessionId === s.id && editing.exerciseId === e.id
                return (
                  <div key={e.id} className="flex flex-col" style={{ gap: 'var(--space-2)' }} data-plan-exercise={e.id}>
                    <div className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--space-2)' }}>
                      <p style={BODY}>
                        {`${e.name} · ${e.sets} × ${e.low === e.high ? e.high : `${e.low}–${e.high}`}`}
                        {e.changedBy && <span style={META}>{` · changed by ${e.changedBy.name}: ${e.changedBy.reason}`}</span>}
                      </p>
                      {!open && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing({ sessionId: s.id, exerciseId: e.id })
                            setDraft({ swapTo: '', sets: String(e.sets), low: String(e.low), high: String(e.high), reason: '' })
                          }}
                          data-plan-edit={e.id}
                        >
                          Change
                        </Button>
                      )}
                    </div>
                    {open && (
                      <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
                        <Select label="Swap for" value={draft.swapTo} onChange={(ev) => setDraft((d) => ({ ...d, swapTo: ev.target.value }))}>
                          <option value="">Keep {e.name}</option>
                          {e.alternatives.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </Select>
                        <div className="grid grid-cols-3" style={{ gap: 'var(--space-2)' }}>
                          <Input label="Sets" inputMode="numeric" value={draft.sets} onChange={(ev) => setDraft((d) => ({ ...d, sets: ev.target.value }))} />
                          <Input label="Reps from" inputMode="numeric" value={draft.low} onChange={(ev) => setDraft((d) => ({ ...d, low: ev.target.value }))} />
                          <Input label="Reps to" inputMode="numeric" value={draft.high} onChange={(ev) => setDraft((d) => ({ ...d, high: ev.target.value }))} />
                        </div>
                        <Input label="Why (the member sees this)" value={draft.reason} onChange={(ev) => setDraft((d) => ({ ...d, reason: ev.target.value }))} placeholder="Fewer sets while your knee settles." data-plan-reason />
                        {error && <Note tone="critical">{error}</Note>}
                        <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
                          <Button variant="primary" size="sm" loading={busy} disabled={!draft.reason.trim()} onClick={() => void save()} data-plan-save>
                            Change their plan
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      </Disclosure>
    </Card>
  )
}
