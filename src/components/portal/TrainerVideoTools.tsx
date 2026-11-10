'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, Checkbox, Disclosure, Input, Note, Select, Textarea } from '@/components/system'
import { uploadVideo } from '@/lib/media/client'
import type { SavedReply, Featured } from '@/lib/trainer/content'
import { TRIAGE_TAGS, type LibraryEntry, type TriageTag } from '@/lib/trainer/types'
import { VIDEO_COPY } from '@/lib/trainer/video-copy'
import { FilePickButton } from './FilePickButton'

/**
 * Founders Hub → Trainer, the video phase: a video note recorded in the
 * browser or uploaded, the saved replies (with the built-in pain reply),
 * sorting a question, the answers library, and featuring an exchange a
 * member said yes to sharing.
 */

export interface Content {
  replies: SavedReply[]
  library: LibraryEntry[]
  featured: Featured | null
  video: boolean
}

const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' } as const
const BODY = { fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-2)' } as const
const STRONG = { fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' } as const
const NOTE_BYTES = 40 * 1024 * 1024
const RECORD_SECONDS = 120

export const TAG_LABEL: Record<TriageTag, string> = { form: 'Form', plan: 'Plan', pain: 'Pain or injury', kit: 'Kit', other: 'Other' }

/** `samples`: the sample inbox, whose library entries and exchange show only in test views. */
const contentUrl = (samples: boolean, query = '') => `/api/portal/trainer/content${samples || query ? '?' : ''}${[samples ? 'samples=1' : '', query].filter(Boolean).join('&')}`

export async function postContent(body: Record<string, unknown>, samples = false): Promise<Content> {
  const r = await fetch(contentUrl(samples), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = (await r.json().catch(() => null)) as (Content & { error?: string }) | null
  if (!r.ok || !d) throw new Error(d?.error ?? 'That didn’t save.')
  return d
}

async function deleteContent(query: string): Promise<Content> {
  const r = await fetch(contentUrl(false, query), { method: 'DELETE' })
  if (!r.ok) throw new Error('That didn’t go.')
  return (await r.json()) as Content
}

export function useContent(samples = false): [Content | null, (c: Content) => void] {
  const [content, setContent] = useState<Content | null>(null)
  useEffect(() => {
    fetch(contentUrl(samples))
      .then((r) => (r.ok ? r.json() : null))
      .then((c: Content | null) => c && setContent(c))
      .catch(() => {})
  }, [samples])
  return [content, setContent]
}

/* ── A video note ─────────────────────────────────────────────────────────── */

export interface NoteClip {
  id: string
  url: string
}

/** Record a note in the browser (camera and mic), or upload one from the phone. It becomes the member's when the answer goes. */
export function VideoNoteRow({ clip, onClip }: { clip: NoteClip | null; onClip: (c: NoteClip | null) => void }) {
  const [progress, setProgress] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [recording, setRecording] = useState<{ stream: MediaStream; recorder: MediaRecorder; started: number } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const live = useRef<HTMLVideoElement>(null)
  const canRecord = typeof window !== 'undefined' && typeof window.MediaRecorder === 'function' && Boolean(navigator.mediaDevices?.getUserMedia)

  async function upload(file: File) {
    setProblem(null)
    setProgress(0)
    try {
      onClip(await uploadVideo(file, { endpoint: '/api/portal/media', kind: 'note', title: 'Video note', maxBytes: NOTE_BYTES, onProgress: setProgress }))
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'The upload didn’t go through.')
    } finally {
      setProgress(null)
    }
  }

  async function start() {
    setProblem(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
      const type = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
      const parts: Blob[] = []
      recorder.ondataavailable = (e) => e.data.size && parts.push(e.data)
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(null)
        const mime = (recorder.mimeType || 'video/webm').split(';')[0]
        void upload(new File(parts, `note.${mime === 'video/mp4' ? 'mp4' : 'webm'}`, { type: mime }))
      }
      recorder.start(1000)
      setRecording({ stream, recorder, started: Date.now() })
      if (live.current) live.current.srcObject = stream
    } catch {
      setProblem('The camera didn’t start. Allow the camera and microphone, or upload a clip instead.')
    }
  }

  useEffect(() => {
    if (!recording) return
    if (live.current) live.current.srcObject = recording.stream
    const tick = setInterval(() => {
      const s = Math.round((Date.now() - recording.started) / 1000)
      setElapsed(s)
      if (s >= RECORD_SECONDS && recording.recorder.state === 'recording') recording.recorder.stop()
    }, 500)
    return () => clearInterval(tick)
  }, [recording])

  if (clip) {
    return (
      <div className="flex flex-col" style={{ gap: 'var(--space-2)' }} data-video-note="ready">
        <video src={clip.url} controls playsInline preload="metadata" style={{ width: 'calc(var(--space-8) * 6)', maxWidth: '100%', borderRadius: 'var(--radius-card)' }} />
        <div>
          <Button variant="ghost" size="sm" icon="trash" onClick={() => onClip(null)}>
            Remove video note
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-2)' }} data-video-note="pick">
      {recording && <video ref={live} muted autoPlay playsInline style={{ width: 'calc(var(--space-8) * 6)', maxWidth: '100%', borderRadius: 'var(--radius-card)' }} />}
      <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
        {canRecord &&
          (recording ? (
            <Button variant="primary" size="sm" icon="pause" onClick={() => recording.recorder.stop()} data-video-note-stop>
              {`Stop and use it (${elapsed}s of ${RECORD_SECONDS}s)`}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" icon="play" disabled={progress !== null} onClick={() => void start()} data-video-note-record>
              Record a video note
            </Button>
          ))}
        {!recording && (
          <FilePickButton accept="video/mp4,video/quicktime,video/webm" onFile={(f) => void upload(f)} variant="secondary" size="sm" icon="plus" loading={progress !== null} data-video-note-upload>
            {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : 'Upload a video note'}
          </FilePickButton>
        )}
      </div>
      <p style={META}>Up to 2 minutes. Only this member and the team can watch it.</p>
      {problem && <Note tone="critical">{problem}</Note>}
    </div>
  )
}

/* ── Saved replies ────────────────────────────────────────────────────────── */

/** Pick a saved reply into the answer; a question that mentions pain gets the pain reply offered first. */
export function SavedReplyPicker({ replies, pain, onPick }: { replies: SavedReply[]; pain: boolean; onPick: (text: string) => void }) {
  const painReply = replies.find((r) => r.id === 'pain')
  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-2)' }} data-saved-replies>
      {pain && painReply && (
        <Note tone="attention" icon="alert-triangle">
          <span className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
            {VIDEO_COPY.painFlag}
            <Button variant="secondary" size="sm" onClick={() => onPick(painReply.text)} data-use-pain-reply>
              Use the pain reply
            </Button>
          </span>
        </Note>
      )}
      {replies.length > 0 && (
        <Select
          label="Saved replies"
          compact
          value=""
          onChange={(e) => {
            const r = replies.find((x) => x.id === e.target.value)
            if (r) onPick(r.text)
          }}
        >
          <option value="">Insert a saved reply…</option>
          {replies.map((r) => (
            <option key={r.id} value={r.id}>
              {r.tag ? `${r.title} (${TAG_LABEL[r.tag]})` : r.title}
            </option>
          ))}
        </Select>
      )}
    </div>
  )
}

/** Sort a member's question. Only the Founders Hub sees it. */
export function TagSelect({ value, onChange }: { value: TriageTag | null | undefined; onChange: (t: TriageTag | null) => void }) {
  return (
    <div style={{ maxWidth: 'calc(var(--space-8) * 4)', marginTop: 'var(--space-2)' }}>
      <Select label="Sort as" compact hideLabel value={value ?? ''} onChange={(e) => onChange((e.target.value || null) as TriageTag | null)} data-tag-select>
        <option value="">Not sorted</option>
        {TRIAGE_TAGS.map((t) => (
          <option key={t} value={t}>
            {TAG_LABEL[t]}
          </option>
        ))}
      </Select>
    </div>
  )
}

/* ── From an answer: the library, or the results page ─────────────────────── */

/** Rewrite an exchange for the answers library, or feature one the member said yes to sharing. */
export function AnswerActions({
  userId,
  messageId,
  question,
  about,
  answer,
  shareOk,
  featured,
  onContent,
  samples = false,
}: {
  userId: string
  messageId: string
  question: string
  about: string | null
  answer: string
  shareOk: boolean | null | undefined
  featured: boolean
  onContent: (c: Content) => void
  /** The sample inbox: what's added here shows only in test views. */
  samples?: boolean
}) {
  const [mode, setMode] = useState<'library' | 'feature' | null>(null)
  const [q, setQ] = useState(question)
  const [a, setA] = useState(answer)
  const [anonymised, setAnonymised] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function save() {
    setProblem(null)
    try {
      onContent(mode === 'library' ? await postContent({ kind: 'library', about, question: q, answer: a }, samples) : await postContent({ kind: 'featured', userId, messageId, question: q, answer: a }, samples))
      setDone(
        samples
          ? mode === 'library'
            ? 'Added to the answers library in test views only.'
            : 'On the results page in test views only.'
          : mode === 'library'
            ? 'Added to the answers library.'
            : 'On the results page now.',
      )
      setMode(null)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That didn’t save.')
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }} data-answer-actions={messageId}>
      <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
        {shareOk === true && <Badge tone="positive">They said yes to sharing</Badge>}
        {featured && <Badge tone="accent" dot>On the results page</Badge>}
        <Button variant="ghost" size="sm" onClick={() => setMode(mode === 'library' ? null : 'library')} data-add-library>
          Add to the answers library
        </Button>
        {shareOk === true && !featured && (
          <Button variant="ghost" size="sm" onClick={() => setMode(mode === 'feature' ? null : 'feature')} data-feature>
            Show on the results page
          </Button>
        )}
      </div>
      {done && <p style={META}>{done}</p>}
      {mode && (
        <Card padding="tight" solid>
          <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
            <p style={META}>
              {mode === 'library'
                ? 'Rewrite it so nobody could tell who asked: no names, places, ages, jobs or anything about their health. Members see it before they ask.'
                : 'Tidy a name or a place out if you need to. Don’t add to their words or yours. It shows without their name, and comes down if they change their mind.'}
            </p>
            <Textarea label="Question" rows={3} value={q} onChange={(e) => setQ(e.target.value)} />
            <Textarea label="Answer" rows={4} value={a} onChange={(e) => setA(e.target.value)} />
            {mode === 'library' && <Checkbox label="I’ve taken out anything that could identify them" checked={anonymised} onChange={(e) => setAnonymised(e.target.checked)} data-library-anonymised />}
            {problem && <Note tone="critical">{problem}</Note>}
            <div>
              <Button variant="primary" size="sm" disabled={mode === 'library' && !anonymised} onClick={() => void save()} data-save-answer-action>
                {mode === 'library' ? 'Add to the library' : 'Show it'}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ── Managing it all ──────────────────────────────────────────────────────── */

export function TrainerContentSettings({ content, onContent }: { content: Content; onContent: (c: Content) => void }) {
  const [draft, setDraft] = useState<{ id?: string; title: string; text: string; tag: TriageTag | '' }>({ title: '', text: '', tag: '' })
  const [problem, setProblem] = useState<string | null>(null)
  const run = async (p: Promise<Content>) => {
    setProblem(null)
    try {
      onContent(await p)
      return true
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That didn’t save.')
      return false
    }
  }
  return (
    <Card padding="normal">
      <Disclosure summary={`Saved replies, the answers library and the results page (${content.replies.length} replies, ${content.library.length} in the library)`}>
        <div className="flex flex-col" style={{ gap: 'var(--space-5)', paddingTop: 'var(--space-3)' }} data-trainer-content>
          {!content.video && <Note tone="neutral" icon="info">The answers library and the results page’s exchange show once Video and form checks is on (Settings → Training plan).</Note>}
          <section className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
            <p style={STRONG}>Saved replies</p>
            {content.replies.map((r) => (
              <div key={r.id} className="flex items-start justify-between" style={{ gap: 'var(--space-3)', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--edge)' }}>
                <div className="min-w-0">
                  <p style={{ ...BODY, color: 'var(--ink-1)', fontWeight: 'var(--weight-strong)' }}>
                    {r.title}
                    {r.tag ? ` · ${TAG_LABEL[r.tag]}` : ''}
                    {r.builtIn ? ' · built in, from the review pack' : ''}
                  </p>
                  <p style={{ ...META, whiteSpace: 'pre-line' }}>{r.text}</p>
                </div>
                {!r.builtIn && (
                  <div className="flex" style={{ gap: 'var(--space-1)' }}>
                    <Button variant="ghost" size="sm" onClick={() => setDraft({ id: r.id, title: r.title, text: r.text, tag: r.tag ?? '' })}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" icon="trash" aria-label={`Delete ${r.title}`} onClick={() => void run(deleteContent(`kind=reply&id=${encodeURIComponent(r.id)}`))} />
                  </div>
                )}
              </div>
            ))}
            <div className="grid sm:grid-cols-2" style={{ gap: 'var(--space-2)' }}>
              <Input label={draft.id ? 'Edit the reply: title' : 'New reply: title'} compact value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} data-reply-title />
              <Select label="Fits questions about" compact value={draft.tag} onChange={(e) => setDraft((d) => ({ ...d, tag: e.target.value as TriageTag | '' }))}>
                <option value="">Anything</option>
                {TRIAGE_TAGS.map((t) => (
                  <option key={t} value={t}>
                    {TAG_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
            <Textarea label="The reply" rows={3} value={draft.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} hint="In the trainer’s words. Coaching only: nothing about products or health." data-reply-text />
            <div className="flex" style={{ gap: 'var(--space-2)' }}>
              <Button
                variant="secondary"
                size="sm"
                disabled={!draft.title.trim() || !draft.text.trim()}
                onClick={async () => {
                  if (await run(postContent({ kind: 'reply', id: draft.id, title: draft.title, text: draft.text, tag: draft.tag || null }))) setDraft({ title: '', text: '', tag: '' })
                }}
                data-reply-save
              >
                {draft.id ? 'Save the reply' : 'Add the reply'}
              </Button>
              {draft.id && (
                <Button variant="ghost" size="sm" onClick={() => setDraft({ title: '', text: '', tag: '' })}>
                  Cancel
                </Button>
              )}
            </div>
          </section>

          <section className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
            <p style={STRONG}>The answers library</p>
            <p style={META}>Add from any answer in a member’s questions. Members see these before they ask.</p>
            {content.library.length === 0 && <p style={BODY}>Nothing yet.</p>}
            {content.library.map((e) => (
              <div key={e.id} className="flex items-start justify-between" style={{ gap: 'var(--space-3)', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--edge)' }} data-library-row>
                <div className="min-w-0">
                  <p style={{ ...BODY, color: 'var(--ink-1)', fontWeight: 'var(--weight-strong)' }}>{e.question}</p>
                  <p style={{ ...META, whiteSpace: 'pre-line' }}>{e.answer}</p>
                </div>
                <Button variant="ghost" size="sm" icon="trash" aria-label="Take it out of the library" onClick={() => void run(deleteContent(`kind=library&id=${encodeURIComponent(e.id)}`))} />
              </div>
            ))}
          </section>

          <section className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
            <p style={STRONG}>On the results page</p>
            {content.featured ? (
              <>
                <p style={{ ...BODY, color: 'var(--ink-1)' }}>{content.featured.question}</p>
                <p style={{ ...META, whiteSpace: 'pre-line' }}>{content.featured.answer}</p>
                <div>
                  <Button variant="ghost" size="sm" icon="trash" onClick={() => void run(deleteContent('kind=featured'))} data-featured-remove>
                    Take it down
                  </Button>
                </div>
              </>
            ) : (
              <p style={META}>No exchange shown. Pick one a member said yes to sharing, from their questions.</p>
            )}
          </section>
          {problem && <Note tone="critical">{problem}</Note>}
        </div>
      </Disclosure>
    </Card>
  )
}

/* ── The trainer's own videos ─────────────────────────────────────────────── */

/** Upload the trainer's intro or welcome video, or take it off. Saves on its own. */
export function TrainerVideoRow({ label, hint, id, onSet }: { label: string; hint: string; id: string | null; onSet: (id: string | null) => Promise<void> }) {
  const [progress, setProgress] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  async function pick(file: File) {
    setProblem(null)
    setProgress(0)
    try {
      const up = await uploadVideo(file, { endpoint: '/api/portal/media', kind: 'trainer', title: label, maxBytes: 60 * 1024 * 1024, onProgress: setProgress })
      await onSet(up.id)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'The upload didn’t go through.')
    } finally {
      setProgress(null)
    }
  }
  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-2)' }} data-trainer-video-row={label}>
      <p style={{ ...BODY, color: 'var(--ink-1)', fontWeight: 'var(--weight-strong)' }}>{label}</p>
      <p style={META}>{hint}</p>
      {id && <video src={`/api/media/${id}`} controls playsInline preload="metadata" style={{ width: 'calc(var(--space-8) * 6)', maxWidth: '100%', borderRadius: 'var(--radius-card)' }} />}
      <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
        <FilePickButton accept="video/mp4,video/quicktime,video/webm" onFile={(f) => void pick(f)} variant="secondary" size="sm" icon="plus" loading={progress !== null}>
          {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : id ? 'Replace video' : 'Upload video'}
        </FilePickButton>
        {id && (
          <Button variant="ghost" size="sm" icon="trash" onClick={() => void onSet(null)}>
            Remove
          </Button>
        )}
      </div>
      {problem && <Note tone="critical">{problem}</Note>}
    </div>
  )
}
