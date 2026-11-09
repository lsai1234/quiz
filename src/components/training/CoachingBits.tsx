'use client'

import { useState } from 'react'
import { Badge, Button, Card, Note, Segmented, buttonSurface } from '@/components/system'
import { COACHING_COPY as W } from '@/lib/training/coaching-copy'
import type { PublicTrainer } from '@/lib/trainer/types'
import { WEEKDAY_LONG } from '@/lib/training/copy'
import type { TrainingAction } from '@/lib/training/state'
import type { Session, TrainerChange, TrainingPlan, WeekMode } from '@/lib/training/types'
import { body, eyebrow, meta, stack, strong } from './styles'

type Act = (a: TrainingAction) => Promise<boolean>

const clock = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
}

/** This week: normal, busy (shorter sessions) or away (bodyweight only). Back to normal on Monday. */
export function WeekModeCard({ plan, act, busy }: { plan: TrainingPlan; act: Act; busy: string | null }) {
  const mode: WeekMode | 'normal' = plan.weekMode?.kind ?? 'normal'
  return (
    <div data-week-mode={mode}>
      <Card padding="normal">
        <div style={stack('var(--space-3)')}>
          <Segmented<WeekMode | 'normal'>
            label={W.weekTitle}
            columns={3}
            value={mode}
            options={[
              { value: 'normal', label: W.weekNormal, disabled: busy !== null },
              { value: 'busy', label: W.weekBusy, disabled: busy !== null },
              { value: 'away', label: W.weekAway, disabled: busy !== null },
            ]}
            onChange={(v) => void act({ action: 'week-mode', kind: v === 'normal' ? null : v })}
          />
          {mode !== 'normal' && <p style={meta}>{mode === 'busy' ? W.weekBusyLine : W.weekAwayLine}</p>}
        </div>
      </Card>
    </div>
  )
}

/** Subscribe once, and the calendar follows every change. */
export function LiveCalendarCard({ url, act, busy }: { url: string | null; act: Act; busy: string | null }) {
  const [copied, setCopied] = useState(false)
  const add = buttonSurface('primary', 'sm')
  return (
    <div data-live-calendar={url ? 'on' : 'off'}>
      <Card padding="normal">
        <div style={stack('var(--space-2)')}>
          <p style={eyebrow}>{W.calendarTitle}</p>
          <p style={body}>{W.calendarLine}</p>
          {url ? (
            <>
              <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
                <a href={url.replace(/^https?:\/\//, 'webcal://')} className={add.className} style={add.style} data-calendar-add>
                  {W.calendarAdd}
                </a>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(url).then(() => setCopied(true))
                  }}
                  data-calendar-copy
                >
                  {copied ? W.calendarCopied : W.calendarCopy}
                </Button>
                <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void act({ action: 'calendar-link' })} data-calendar-new>
                  {W.calendarNew}
                </Button>
              </div>
              <p style={meta}>{W.calendarPrivate}</p>
            </>
          ) : (
            <div>
              <Button variant="secondary" size="sm" icon="calendar" loading={busy === 'calendar-link:'} disabled={busy !== null} onClick={() => void act({ action: 'calendar-link' })} data-calendar-get>
                {W.calendarGet}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

/** After the first setup: who checks the plan, and when the first session is. */
export function MeetTrainerCard({ trainer, plan, act, busy }: { trainer: PublicTrainer; plan: TrainingPlan; act: Act; busy: string | null }) {
  const today = (new Date().getUTCDay() + 6) % 7
  const first = [...plan.sessions].filter((s) => !s.done).sort((a, b) => ((a.day - today + 7) % 7) - ((b.day - today + 7) % 7))[0] ?? null
  return (
    <div data-meet-trainer>
      <Card padding="roomy" tone="accent">
        <div style={stack('var(--space-2)')}>
          <p style={eyebrow}>{W.metTitle(trainer.name)}</p>
          <p style={strong}>{trainer.role}</p>
          {trainer.bio && <p style={body}>{trainer.bio}</p>}
          <p style={body}>{W.metLine(trainer.name)}</p>
          {first && <p style={strong}>{plan.prefs.trainAt != null ? W.metFirst(WEEKDAY_LONG[first.day], clock(plan.prefs.trainAt)) : W.metFirstNoTime(WEEKDAY_LONG[first.day])}</p>}
          <div>
            <Button variant="primary" size="sm" disabled={busy !== null} onClick={() => void act({ action: 'intro-seen' })} data-meet-done>
              {W.metCta}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

/** Two weeks with nothing done and none yet this week: ease back in, never a backlog. */
export function backAfterGap(plan: TrainingPlan): boolean {
  const [a, b] = plan.history
  return Boolean(a && b && a.done === 0 && b.done === 0 && !plan.sessions.some((s) => s.done))
}

export function BackAfterGapCard({ next, act, busy }: { next: Session | null; act: Act; busy: string | null }) {
  if (!next || next.type !== 'strength') return null
  return (
    <div data-back-after-gap>
      <Note tone="info">
        <span style={{ ...strong, display: 'block' }}>{W.gapTitle}</span>
        <span style={{ display: 'block', marginTop: 'var(--space-1)' }}>{W.gapBody}</span>
        {!next.lighter && (
          <span style={{ display: 'block', marginTop: 'var(--space-2)' }}>
            <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => void act({ action: 'lighter', sessionId: next.id, on: true })} data-gap-lighter>
              {W.gapCta}
            </Button>
          </span>
        )}
      </Note>
    </div>
  )
}

/** "Changed by [Name]", with the reason a tap away. */
export function ChangedBy({ change }: { change: TrainerChange }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="inline-flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }} data-changed-by>
      <Badge tone="info" dot>
        {W.changedBy(change.name)}
      </Badge>
      {change.reason && (
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? W.changedWhy(change.reason) : W.changedAsk}
        </Button>
      )}
    </span>
  )
}
