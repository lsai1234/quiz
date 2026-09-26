'use client'

import { useRef, useState } from 'react'
import { TRACKER_APPS, trackerCards, type TrackerApp, type TrackerRead } from '@/lib/consult/ai/scan'
import type { ConsultAnswers } from '@/lib/consult/types'
import { Chip } from './controls'
import { UploadSheet, type UploadCard } from './UploadSheet'
import { scanTracker } from './scanRequest'

/**
 * "Fill from my tracker" (build U2): a screenshot from a sleep or fitness app
 * pre-fills the training week and the sleep window.
 *
 * Pick the app, see which screen to grab, upload it. What was read comes back
 * as cards — "Sleep 23:15 → 06:45", "4 workouts this week" — and only the
 * confirmed ones are written. Every other number on the screen (heart rate,
 * HRV, temperature) is never asked for and never kept.
 */

export const TRACKER_CONSENT =
  'Send this screenshot to be read once. It isn’t stored, and only bedtimes and workouts are taken from it.'

/** Confirmed cards → the answers they fill. Sleep keeps a quality already given unless the app has one. */
export function trackerPatch(read: TrackerRead, keys: string[], answers: ConsultAnswers): Partial<ConsultAnswers> {
  const patch: Partial<ConsultAnswers> = {}
  if (keys.includes('sleep') && read.bed !== null && read.wake !== null) {
    patch.sleep = { bed: read.bed, wake: read.wake, quality: read.quality ?? answers.sleep?.quality ?? null }
  }
  if (keys.includes('week') && read.week) patch.week = read.week
  return patch
}

interface Props {
  answers: ConsultAnswers
  onFill: (patch: Partial<ConsultAnswers>) => void
  onReading: (reading: boolean) => void
  onClose: () => void
  scan?: (app: TrackerApp, image: string) => Promise<TrackerRead | null>
  shrink?: (file: File) => Promise<string>
}

export function TrackerSheet({ answers, onFill, onReading, onClose, scan = scanTracker, shrink }: Props) {
  const [app, setApp] = useState<TrackerApp | null>(null)
  const last = useRef<TrackerRead | null>(null)

  const read = async (image: string): Promise<UploadCard[] | null> => {
    if (!app) return null
    const result = await scan(app, image)
    last.current = result
    return result && trackerCards(result)
  }

  return (
    <UploadSheet
      title="Fill from my tracker"
      ready={app !== null}
      consent={TRACKER_CONSENT}
      read={read}
      shrink={shrink}
      onReading={onReading}
      onConfirm={(keys) => last.current && onFill(trackerPatch(last.current, keys, answers))}
      onClose={onClose}
    >
      <div role="group" aria-label="Your app" className="flex flex-wrap" style={{ gap: 'var(--amp-space-2)' }}>
        {(Object.keys(TRACKER_APPS) as TrackerApp[]).map((a) => (
          <Chip key={a} label={TRACKER_APPS[a].name} selected={app === a} onToggle={() => setApp(app === a ? null : a)} />
        ))}
      </div>
      <p aria-live="polite" style={{ color: 'var(--amp-ink-2)', fontSize: 'var(--amp-text-meta)', lineHeight: 'var(--amp-leading-body)' }}>
        {app ? `Screenshot this: ${TRACKER_APPS[app].screen}` : 'Which app do you use?'}
      </p>
    </UploadSheet>
  )
}
