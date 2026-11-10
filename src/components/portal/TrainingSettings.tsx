'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, Checkbox, Input, Note, Textarea } from '@/components/system'
import { uploadVideo } from '@/lib/media/client'
import { FilePickButton } from './FilePickButton'

/**
 * Settings → Training plan: whether the hub's training plan is on and which
 * coaching phases are, how many members have one, and for each exercise and
 * activity: a tutorial link, the trainer's tip, and an uploaded video. Nothing
 * needs filming: an exercise without a video leads with its steps.
 */

interface Item {
  id: string
  name: string
  group: string
  url: string | null
  tip: string | null
  video: string | null
}
interface LiveQa {
  title: string
  startsAt: string
  minutes: number
  joinUrl: string | null
  recordingUrl: string | null
}
interface View {
  enabled: boolean
  phases: { coaching: boolean; video: boolean; programmes: boolean }
  liveQa?: LiveQa | null
  plans: number
  items: Item[]
}

const PHASES: { key: keyof View['phases']; label: string; hint: string }[] = [
  { key: 'coaching', label: 'Coaching tools', hint: 'Workout mode, how it felt, busy and away weeks, a lighter session, the live calendar, the trainer’s tips and changes, questions in context, nudges and the week-one recap.' },
  { key: 'video', label: 'Video and form checks', hint: 'Uploaded videos on exercises, video notes, members’ form checks (deleted after 30 days), saved replies, the answers library and the results page’s proof.' },
  { key: 'programmes', label: 'Programmes and goals', hint: '8- and 12-week programmes, goals with milestones, missed sessions finding a home, warm-ups and cool-downs, the progress page and the monthly live Q&A.' },
]

const HEADING = { fontSize: 'var(--text-title)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' } as const
const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' } as const
const BODY = { fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-2)' } as const

const GROUP_LABEL: Record<string, string> = {
  squat: 'Squats',
  hinge: 'Hinges',
  lunge: 'Lunges',
  glute: 'Glutes',
  calf: 'Calves',
  'push-h': 'Presses',
  'push-v': 'Overhead presses',
  'pull-h': 'Rows',
  'pull-v': 'Pulldowns and pull-ups',
  raise: 'Shoulder raises',
  rear: 'Upper back',
  biceps: 'Biceps',
  triceps: 'Triceps',
  core: 'Core',
  conditioning: 'Conditioning',
  mobility: 'Mobility',
  activity: 'Activities and classes',
}

export function TrainingSettings() {
  const [view, setView] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/portal/training')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((v: View) => setView(v))
      .catch(() => setError('Could not load the training settings. Reload the page to try again.'))
  }, [])

  const post = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/portal/training', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error ?? 'That did not save.')
    setView(data as View)
  }, [])
  const save = useCallback((id: string, url: string | null) => post({ id, url }), [post])

  const groups = useMemo(() => {
    const out = new Map<string, Item[]>()
    for (const item of view?.items ?? []) out.set(item.group, [...(out.get(item.group) ?? []), item])
    return [...out.entries()]
  }, [view])

  if (error && !view) return <Note tone="critical" icon="alert-triangle">{error}</Note>
  if (!view) return <Note tone="neutral" icon="clock">Reading the training settings…</Note>
  const withVideo = view.items.filter((i) => i.url || i.video).length

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <Card elevation={1}>
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <h2 style={HEADING}>Training plan</h2>
            <Badge tone={view.enabled ? 'positive' : 'neutral'} dot>
              {view.enabled ? 'On' : 'Off'}
            </Badge>
          </div>
          <p style={BODY}>
            {view.enabled
              ? `On for every member with a hub. ${view.plans} ${view.plans === 1 ? 'member has' : 'members have'} a plan.`
              : 'Off: no member sees it, and the box doesn’t mention it. Turn it on once a qualified coach has reviewed the exercise library in the review pack.'}
          </p>
          <p style={META}>
            The switch is with the other box services: <Link href="/founderhub/settings/offer" style={{ textDecoration: 'underline' }}>Offer → Box services</Link>.
          </p>
        </div>
      </Card>

      <Card elevation={1}>
        <div style={{ display: 'grid', gap: 'var(--space-3)' }} data-coaching-phases>
          <h2 style={HEADING}>Coaching phases</h2>
          <p style={BODY}>All three are on, and each can be switched off here. Every phase needs the training plan on. Try any of them in Settings → Test views.</p>
          {PHASES.map((p) => (
            <Checkbox
              key={p.key}
              label={p.label}
              hint={p.hint}
              checked={view.phases[p.key]}
              onChange={(e) => void post({ services: { [p.key]: e.target.checked } }).catch((err) => setError(err.message))}
              data-phase={p.key}
            />
          ))}
        </div>
      </Card>

      {view.phases.programmes && <LiveQaSettings qa={view.liveQa ?? null} onSave={(liveQa) => post({ liveQa })} />}

      <Card elevation={1}>
        <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
          <div>
            <h2 style={HEADING}>Exercises: videos and tips</h2>
            <p style={{ ...META, marginTop: 'var(--space-1)' }}>
              For each exercise or activity, any of: a video uploaded from your phone (MP4 or MOV), a YouTube or Vimeo link, and the trainer’s tip in their own
              words. Nothing has to be filmed: without a video, the exercise leads with its steps. A video shows on that exercise straight away, as a silent
              loop in workout mode. {withVideo} of {view.items.length} have a video or link.
            </p>
          </div>
          {groups.map(([group, items]) => (
            <section key={group} style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <h3 style={{ ...BODY, fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>{GROUP_LABEL[group] ?? group}</h3>
              {items.map((item) => (
                <div key={item.id} style={{ display: 'grid', gap: 'var(--space-2)', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--edge)' }}>
                  <TutorialRow item={item} onSave={save} />
                  <VideoRow item={item} onSet={(videoId) => post({ id: item.id, videoId })} />
                  <TipRow item={item} onSave={(tip) => post({ id: item.id, tip })} />
                </div>
              ))}
            </section>
          ))}
        </div>
      </Card>
    </div>
  )
}

function TutorialRow({ item, onSave }: { item: Item; onSave: (id: string, url: string | null) => Promise<void> }) {
  const [value, setValue] = useState(item.url ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const dirty = value.trim() !== (item.url ?? '')
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }} data-tutorial={item.id}>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Input label={item.name} compact type="url" inputMode="url" placeholder="https://" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!dirty}
          loading={busy}
          onClick={async () => {
            setBusy(true)
            setMessage(null)
            try {
              await onSave(item.id, value.trim() || null)
              setMessage('Saved.')
            } catch (err) {
              setMessage(err instanceof Error ? err.message : 'That did not save.')
            } finally {
              setBusy(false)
            }
          }}
        >
          Save
        </Button>
      </div>
      {message && <p style={META} role="status">{message}</p>}
    </div>
  )
}

/** Upload a video for an exercise, or take it off. */
function VideoRow({ item, onSet }: { item: Item; onSet: (videoId: string | null) => Promise<void> }) {
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  async function pick(file: File | undefined) {
    if (!file) return
    setMessage(null)
    setProgress(0)
    try {
      const up = await uploadVideo(file, { endpoint: '/api/portal/media', kind: 'exercise', title: item.name, maxBytes: 60 * 1024 * 1024, onProgress: setProgress })
      await onSet(up.id)
      setMessage('Uploaded. It shows on this exercise now.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'The upload didn’t go through.')
    } finally {
      setProgress(null)
    }
  }
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }} data-exercise-video-row={item.id}>
      {item.video && <video src={item.video} muted loop playsInline controls style={{ width: 'calc(var(--space-8) * 6)', maxWidth: '100%', borderRadius: 'var(--radius-card)' }} />}
      <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
        <FilePickButton accept="video/mp4,video/quicktime,video/webm" onFile={(f) => void pick(f)} variant="secondary" size="sm" icon="plus" loading={progress !== null} aria-label={`Upload a video for ${item.name}`}>
          {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : item.video ? 'Replace video' : 'Upload video'}
        </FilePickButton>
        {item.video && (
          <Button variant="ghost" size="sm" icon="trash" onClick={() => void onSet(null)}>
            Remove video
          </Button>
        )}
      </div>
      {message && <p style={META} role="status">{message}</p>}
    </div>
  )
}

/** The trainer's tip, in their own words: shown to every member as "[Name]'s tip". */
function TipRow({ item, onSave }: { item: Item; onSave: (tip: string | null) => Promise<void> }) {
  const [value, setValue] = useState(item.tip ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const dirty = value.trim() !== (item.tip ?? '')
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }} data-trainer-tip-row={item.id}>
      <Textarea label="The trainer’s tip" hint="A sentence or two, in the trainer’s own words. Coaching only: no health claims or products." rows={2} maxLength={280} value={value} onChange={(e) => setValue(e.target.value)} />
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!dirty}
          onClick={async () => {
            try {
              await onSave(value.trim() || null)
              setMessage('Saved.')
            } catch (err) {
              setMessage(err instanceof Error ? err.message : 'That did not save.')
            }
          }}
        >
          Save tip
        </Button>
      </div>
      {message && <p style={META} role="status">{message}</p>}
    </div>
  )
}

/** A Date as the `datetime-local` input takes it, in this browser's time. */
function localInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The monthly live Q&A (Programmes and goals): when, how long, the join link, and the recording afterwards. */
function LiveQaSettings({ qa, onSave }: { qa: LiveQa | null; onSave: (qa: Record<string, unknown> | null) => Promise<void> }) {
  const [draft, setDraft] = useState({
    title: qa?.title ?? 'Live Q&A',
    startsAt: localInput(qa?.startsAt),
    minutes: String(qa?.minutes ?? 60),
    joinUrl: qa?.joinUrl ?? '',
    recordingUrl: qa?.recordingUrl ?? '',
  })
  const [message, setMessage] = useState<string | null>(null)
  const set = (k: keyof typeof draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }))
  const recordingEnds = qa?.recordingUrl ? new Date(Date.parse(qa.startsAt) + 90 * 86_400_000) : null
  return (
    <Card elevation={1}>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }} data-live-qa-settings>
        <h2 style={HEADING}>Monthly live Q&A</h2>
        <p style={BODY}>
          An hour a month with the trainer, open to every member with an open hub. Members see the date, can add it to their calendar, and get the join link the day
          before. Say at the start that it’s being recorded. Add the recording afterwards: it shows for 90 days from the session, then it’s gone from the hub, so delete it where it’s hosted then.
        </p>
        <div className="grid sm:grid-cols-2" style={{ gap: 'var(--space-3)' }}>
          <Input label="Title" compact value={draft.title} onChange={set('title')} />
          <Input label="When (UK time)" compact type="datetime-local" value={draft.startsAt} onChange={set('startsAt')} data-live-qa-when />
          <Input label="Minutes" compact inputMode="numeric" value={draft.minutes} onChange={set('minutes')} />
          <Input label="Join link" compact type="url" placeholder="https://" value={draft.joinUrl} onChange={set('joinUrl')} hint="Zoom, Meet, Teams or a YouTube live link" />
        </div>
        <Input label="Recording (after it’s happened)" compact type="url" placeholder="https://" value={draft.recordingUrl} onChange={set('recordingUrl')} hint="An unlisted link. Delete it where it’s hosted after 90 days." />
        {recordingEnds && <p style={META}>{`The recording shows until ${recordingEnds.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`}</p>}
        <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
          <Button
            variant="secondary"
            size="sm"
            disabled={!draft.startsAt}
            onClick={async () => {
              try {
                await onSave({ ...draft, startsAt: new Date(draft.startsAt).toISOString(), minutes: Number(draft.minutes) })
                setMessage('Saved.')
              } catch (err) {
                setMessage(err instanceof Error ? err.message : 'That did not save.')
              }
            }}
            data-live-qa-save
          >
            Save
          </Button>
          {qa && (
            <Button
              variant="ghost"
              size="sm"
              icon="trash"
              onClick={async () => {
                await onSave(null).catch(() => {})
                setDraft({ title: 'Live Q&A', startsAt: '', minutes: '60', joinUrl: '', recordingUrl: '' })
                setMessage('Cleared.')
              }}
            >
              Clear
            </Button>
          )}
          {message && <p style={META} role="status">{message}</p>}
        </div>
      </div>
    </Card>
  )
}
