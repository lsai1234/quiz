'use client'

import { useMemo, useState } from 'react'
import { FilePickButton } from '@/components/portal/FilePickButton'
import { Button, Card, Checkbox, Input, Note, buttonSurface } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import { durationOf, uploadVideo } from '@/lib/media/client'
import { TRAINER_COPY } from '@/lib/trainer/copy'
import { DRAFT_COPY } from '@/lib/trainer/draft-copy'
import type { LibraryEntry, TrainerVideo } from '@/lib/trainer/types'
import { VIDEO_COPY as V } from '@/lib/trainer/video-copy'
import { body, col, meta, strong } from '../home/ui'

/**
 * The video phase in the member's thread: clips that play in place (a form
 * check, a video note, the trainer's welcome), sending a form check, saying
 * yes or no to sharing an answer, and the answers library before asking.
 */

const FORM_CHECK_SECONDS = 30
const FORM_CHECK_BYTES = 30 * 1024 * 1024

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

/** A clip from our own storage plays here; a YouTube or Vimeo link opens there. */
export function MessageVideo({ video, label }: { video: TrainerVideo; label?: string }) {
  if (!video.media) {
    const link = buttonSurface('secondary', 'sm')
    return (
      <div style={{ marginTop: 'var(--space-3)' }}>
        <a href={video.url} target="_blank" rel="noopener noreferrer" className={link.className} style={link.style} data-trainer-video>
          <Icon name="play" size={14} />
          {video.title ? `${TRAINER_COPY.video}: ${video.title}` : TRAINER_COPY.video}
        </a>
      </div>
    )
  }
  if (video.until && Date.parse(video.until) <= Date.now()) {
    return <p style={{ ...meta, marginTop: 'var(--space-2)' }}>{V.formCheckGone}</p>
  }
  return <Clip src={video.url} label={label ?? video.title ?? TRAINER_COPY.video} until={video.until ?? null} />
}

export function Clip({ src, label, until }: { src: string; label: string; until?: string | null }) {
  return (
    <figure style={{ ...col('var(--space-1)'), marginTop: 'var(--space-3)' }} data-clip>
      <video
        src={src}
        poster={`${src}?still=1`}
        controls
        playsInline
        preload="metadata"
        aria-label={label}
        style={{ width: '100%', maxHeight: 'calc(var(--space-8) * 7)', borderRadius: 'var(--radius-card)', background: 'var(--surface-1)' }}
      />
      <figcaption style={meta}>{until ? `${label} · ${V.formCheckUntil(day(until))}` : label}</figcaption>
    </figure>
  )
}

export interface PickedClip {
  id: string
  url: string
}

/** Send a form check: their yes first, then a clip of up to 30 seconds, uploaded before they send. */
export function FormCheckPicker({
  trainer,
  clip,
  onClip,
  ai = false,
}: {
  trainer: string
  clip: PickedClip | null
  onClip: (c: PickedClip | null) => void
  /** AI drafts are on: a few stills go with it, and the consent says so. */
  ai?: boolean
}) {
  const [agree, setAgree] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  async function pick(file: File) {
    setProblem(null)
    const seconds = await durationOf(file)
    if (seconds !== null && seconds > FORM_CHECK_SECONDS + 0.5) {
      setProblem(V.formCheckTooLong)
      return
    }
    setProgress(0)
    try {
      const up = await uploadVideo(file, {
        endpoint: '/api/hub/media',
        kind: 'form-check',
        maxBytes: FORM_CHECK_BYTES,
        // Unreadable length (some phones' files): the size cap still holds it.
        extra: { consent: true, seconds: seconds ?? FORM_CHECK_SECONDS },
        onProgress: setProgress,
        frames: ai,
      })
      onClip(up)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : TRAINER_COPY.failed)
    } finally {
      setProgress(null)
    }
  }

  if (clip) {
    return (
      <div style={col('var(--space-2)')} data-form-check="ready">
        <Clip src={clip.url} label={V.formCheckLabel} />
        <p style={meta}>{V.formCheckReady}</p>
        <div>
          <Button variant="ghost" size="sm" icon="trash" onClick={() => onClip(null)} data-form-check-remove>
            {V.formCheckRemove}
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div style={col('var(--space-2)')} data-form-check="pick">
      <p style={{ ...strong, fontSize: 'var(--text-body-sm)' }}>{V.formCheck}</p>
      <p style={meta}>{V.formCheckHint}</p>
      <Checkbox label={V.formCheckAgree} hint={ai ? DRAFT_COPY.consentAi(trainer) : V.formCheckConsent(trainer)} checked={agree} onChange={(e) => setAgree(e.target.checked)} data-form-check-agree />
      <div>
        <FilePickButton
          accept="video/mp4,video/quicktime,video/webm"
          onFile={(f) => void pick(f)}
          variant="secondary"
          size="sm"
          icon="play"
          disabled={!agree || progress !== null}
          loading={progress !== null}
          data-form-check-pick
        >
          {progress !== null ? V.formCheckUploading(Math.round(progress * 100)) : V.formCheck}
        </FilePickButton>
      </div>
      {problem && (
        <Note tone="critical" live="assertive">
          {problem}
        </Note>
      )}
    </div>
  )
}

/** After an answer they found helpful: may we show it, without their name? A no (or a later change of mind) takes it down. */
export function ShareAsk({ shareOk, onAnswer }: { shareOk: boolean | null | undefined; onAnswer: (ok: boolean) => void }) {
  if (shareOk === true) {
    return (
      <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }} data-share="yes">
        <p style={meta}>{V.shareDone}</p>
        <Button variant="ghost" size="sm" onClick={() => onAnswer(false)} data-share-undo>
          {V.shareUndo}
        </Button>
      </div>
    )
  }
  if (shareOk === false) return <p style={{ ...meta, marginTop: 'var(--space-2)' }} data-share="no">{V.shareNoDone}</p>
  return (
    <div style={{ ...col('var(--space-2)'), marginTop: 'var(--space-2)' }} data-share="ask">
      <p style={meta}>{V.shareAsk}</p>
      <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
        <Button variant="secondary" size="sm" onClick={() => onAnswer(true)} data-share-yes>
          {V.shareYes}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onAnswer(false)} data-share-no>
          {V.shareNo}
        </Button>
      </div>
    </div>
  )
}

/** Questions asked before, rewritten without anyone's details: searchable, a few at a time. */
export function AnswersLibrary({ entries, trainer }: { entries: LibraryEntry[]; trainer: string }) {
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(3)
  const found = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return entries
    return entries.filter((e) => words.every((w) => `${e.about ?? ''} ${e.question} ${e.answer}`.toLowerCase().includes(w)))
  }, [q, entries])
  if (!entries.length) return null
  return (
    <Card padding="normal">
      <section aria-label={V.libraryTitle} style={col('var(--space-3)')} data-answers-library>
        <div style={col('var(--space-1)')}>
          <p style={strong}>{V.libraryTitle}</p>
          <p style={meta}>{V.libraryLine(trainer)}</p>
        </div>
        <Input label={V.librarySearch} compact type="search" value={q} onChange={(e) => setQ(e.target.value)} data-library-search />
        {found.length === 0 && <p style={meta}>{V.libraryEmpty}</p>}
        {found.slice(0, shown).map((e) => (
          <div key={e.id} style={{ ...col('var(--space-1)'), paddingTop: 'var(--space-3)', borderTop: '1px solid var(--edge)' }} data-library-entry>
            {e.about && <p style={{ ...meta, color: 'var(--accent)', fontWeight: 'var(--weight-strong)' }}>{TRAINER_COPY.about(e.about)}</p>}
            <p style={{ ...strong, fontSize: 'var(--text-body-sm)', whiteSpace: 'pre-line' }}>{e.question}</p>
            <p style={{ ...body, whiteSpace: 'pre-line' }}>{e.answer}</p>
          </div>
        ))}
        {found.length > shown && (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setShown((n) => n + 5)} data-library-more>
              {V.libraryMore(Math.min(5, found.length - shown))}
            </Button>
          </div>
        )}
      </section>
    </Card>
  )
}
