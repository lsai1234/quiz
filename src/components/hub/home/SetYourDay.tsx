'use client'

import { useState } from 'react'
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, Note, Select } from '@/components/system'
import { spokenClock } from '@/lib/routine/ring'
import type { HubHome } from '@/lib/hub/home-types'

/**
 * "Set your day": when they get up, go to bed and train, so the guide's times
 * are theirs (`/api/hub/guide-day`). Offered from the Today card; said more
 * plainly when the day is still assumed, because then every time on the card
 * is a guess.
 */
type Day = NonNullable<HubHome['guide']>['day']

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const steps = (from: number, to: number) => {
  const out: number[] = []
  for (let m = from; m <= to; m += 30) out.push(m % 1440)
  return out
}
const WAKE = steps(4 * 60, 11 * 60 + 30)
const BED = steps(19 * 60, 26 * 60)
const TRAIN = steps(5 * 60, 22 * 60 + 30)

export function SetYourDayButton({ day, onSaved }: { day: Day; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" icon="clock" onClick={() => setOpen(true)} data-set-day>
        {day.assumed ? 'Not your times? Set your day' : 'Change your day'}
      </Button>
      {open && (
        <SetYourDaySheet
          day={day}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            onSaved()
          }}
        />
      )}
    </>
  )
}

function SetYourDaySheet({ day, onClose, onSaved }: { day: Day; onClose: () => void; onSaved: () => void }) {
  const [wake, setWake] = useState(day.wake)
  const [bed, setBed] = useState(day.bed)
  const [trainAt, setTrainAt] = useState<number | null>(day.trainAt)
  const [weekdays, setWeekdays] = useState<number[]>(day.trainWeekdays ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()))

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/hub/guide-day', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wake, bed, trainAt, trainWeekdays: weekdays, trainDays: weekdays.length || null }),
      })
      if (res.ok) return onSaved()
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      setError(data.error ?? 'That didn’t save. Please try again.')
    } catch {
      setError('We couldn’t reach your account. Check your connection and try again.')
    }
    setSaving(false)
  }

  const options = (list: number[], current: number | null) => {
    const all = current !== null && !list.includes(current) ? [...list, current].sort((a, b) => a - b) : list
    return all.map((m) => (
      <option key={m} value={m}>
        {spokenClock(m)}
      </option>
    ))
  }

  return (
    <Modal onClose={onClose} presentation="sheet">
      <ModalHeader eyebrow="Your guide" title="Your day" subtitle="Your guide times each product around it. Change it whenever your week changes." />
      <ModalBody>
        <div style={{ display: 'grid', gap: 'var(--space-4)' }} data-day-sheet>
          <div className="grid grid-cols-2" style={{ gap: 'var(--space-3)' }}>
            <Select label="You get up at" value={wake} onChange={(e) => setWake(Number(e.target.value))}>
              {options(WAKE, wake)}
            </Select>
            <Select label="You go to bed at" value={bed} onChange={(e) => setBed(Number(e.target.value))}>
              {options(BED, bed)}
            </Select>
          </div>
          <Select
            label="You usually train at"
            value={trainAt === null ? '' : trainAt}
            onChange={(e) => setTrainAt(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">It varies</option>
            {options(TRAIN, trainAt)}
          </Select>
          <fieldset>
            <legend style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)', marginBottom: 'var(--space-2)' }}>
              Which days you train
            </legend>
            <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
              {WEEKDAYS.map((label, d) => (
                <Button
                  key={label}
                  type="button"
                  size="sm"
                  variant={weekdays.includes(d) ? 'primary' : 'secondary'}
                  aria-pressed={weekdays.includes(d)}
                  aria-label={WEEKDAY_NAMES[d]}
                  onClick={() => toggle(d)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </fieldset>
          {error && (
            <Note tone="critical" live="assertive">
              {error}
            </Note>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={saving} onClick={save}>
          Save my day
        </Button>
      </ModalFooter>
    </Modal>
  )
}
