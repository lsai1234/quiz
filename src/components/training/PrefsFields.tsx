'use client'

import { useState, type ReactNode } from 'react'
import { Button, Segmented, Select } from '@/components/system'
import {
  ACTIVITY_LABEL,
  AREA_COPY,
  EQUIPMENT_COPY,
  EXPERIENCE_COPY,
  FOCUS_COPY,
  SPLIT_COPY,
  TRAINING_COPY as C,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
} from '@/lib/training/copy'
import { ACTIVITIES } from '@/lib/training/library'
import type { PrefsDraft } from '@/lib/training/prefs'
import {
  ACTIVITY_KINDS,
  AREAS,
  EQUIPMENT,
  EXPERIENCES,
  FOCUSES,
  MINUTES,
  SPLITS,
  WEEKDAYS,
  type ActivityChoice,
  type ActivityKind,
  type Area,
  type Weekday,
} from '@/lib/training/types'
import { body, label, meta, stack } from './styles'

/**
 * The setup's fields, shared by the first setup and "Change your plan". Every
 * control is the system's own; the multi-picks (days, areas) are buttons that
 * say whether they're on (`aria-pressed`).
 */

export function Field({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p style={label}>{title}</p>
      {hint && <p style={{ ...meta, marginTop: 'calc(-1 * var(--space-2))', marginBottom: 'var(--space-3)' }}>{hint}</p>}
      {children}
    </div>
  )
}

export function DayToggles({ value, onChange, label: name }: { value: Weekday[]; onChange: (days: Weekday[]) => void; label: string }) {
  return (
    <div role="group" aria-label={name} className="grid grid-cols-7" style={{ gap: 'var(--space-1)' }}>
      {WEEKDAYS.map((d) => {
        const on = value.includes(d)
        return (
          <Button
            key={d}
            size="sm"
            variant={on ? 'primary' : 'secondary'}
            aria-pressed={on}
            aria-label={WEEKDAY_LONG[d]}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b))}
            data-day={d}
          >
            {WEEKDAY_SHORT[d].slice(0, 2)}
          </Button>
        )
      })}
    </div>
  )
}

function AreaToggles({ value, onChange }: { value: Area[]; onChange: (a: Area[]) => void }) {
  return (
    <div role="group" aria-label={C.avoidLabel} className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
      {AREAS.map((a) => {
        const on = value.includes(a)
        const word = AREA_COPY[a]
        return (
          <Button
            key={a}
            size="sm"
            variant={on ? 'primary' : 'secondary'}
            aria-pressed={on}
            icon={on ? 'check' : undefined}
            onClick={() => onChange(on ? value.filter((x) => x !== a) : [...value, a])}
            data-area={a}
          >
            {word.charAt(0).toUpperCase() + word.slice(1)}
          </Button>
        )
      })}
    </div>
  )
}

const ACTIVITY_MINUTES = [15, 20, 30, 45, 60, 75, 90]

export function ActivitiesField({
  activities,
  onAdd,
  onRemove,
  busy = false,
}: {
  activities: ActivityChoice[]
  onAdd: (a: ActivityChoice) => void
  onRemove: (a: ActivityChoice) => void
  busy?: boolean
}) {
  const [kind, setKind] = useState<ActivityKind>('walk')
  const [day, setDay] = useState<Weekday>(5)
  const [minutes, setMinutes] = useState<number>(ACTIVITIES.walk.minutes)
  const taken = activities.some((a) => a.day === day && a.kind === kind)
  return (
    <div style={stack('var(--space-3)')} data-activities>
      {activities.length > 0 && (
        <ul style={stack('var(--space-2)')}>
          {activities.map((a) => (
            <li key={`${a.day}-${a.kind}`} className="flex items-center justify-between" style={{ gap: 'var(--space-2)' }} data-activity={a.kind}>
              <span style={body}>
                <strong style={{ color: 'var(--ink-1)' }}>{ACTIVITY_LABEL[a.kind]}</strong> · {WEEKDAY_LONG[a.day]} · {a.minutes} min
              </span>
              <Button variant="ghost" size="sm" icon="x" aria-label={C.removeActivity(ACTIVITY_LABEL[a.kind], WEEKDAY_LONG[a.day])} disabled={busy} onClick={() => onRemove(a)} />
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-3" style={{ gap: 'var(--space-2)' }}>
        <Select
          label={C.activityKind}
          compact
          value={kind}
          onChange={(e) => {
            const k = e.target.value as ActivityKind
            setKind(k)
            setMinutes(ACTIVITIES[k].minutes)
          }}
        >
          {ACTIVITY_KINDS.map((k) => (
            <option key={k} value={k}>
              {ACTIVITY_LABEL[k]}
            </option>
          ))}
        </Select>
        <Select label={C.activityDay} compact value={day} onChange={(e) => setDay(Number(e.target.value) as Weekday)}>
          {WEEKDAYS.map((d) => (
            <option key={d} value={d}>
              {WEEKDAY_SHORT[d]}
            </option>
          ))}
        </Select>
        <Select label={C.activityMinutes} compact value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          {[...new Set([...ACTIVITY_MINUTES, minutes])].sort((a, b) => a - b).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Button variant="secondary" size="sm" icon="plus" disabled={taken || busy} onClick={() => onAdd({ day, kind, minutes })} data-add-activity>
          {C.addActivity} {ACTIVITY_LABEL[kind].toLowerCase()} on {WEEKDAY_LONG[day]}
        </Button>
      </div>
    </div>
  )
}

/** Everything but the activities. */
export function PrefsFields({ value, onChange }: { value: PrefsDraft; onChange: (next: PrefsDraft) => void }) {
  const set = <K extends keyof PrefsDraft>(k: K, v: PrefsDraft[K]) => onChange({ ...value, [k]: v })
  return (
    <div style={stack('var(--space-6)')}>
      <Field title={C.daysLabel} hint={C.daysHint}>
        <DayToggles label={C.daysLabel} value={value.days} onChange={(d) => set('days', d)} />
      </Field>
      <Field title={C.minutesLabel}>
        <Segmented label={C.minutesLabel} columns={4} value={value.minutes} onChange={(m) => set('minutes', m)} options={MINUTES.map((m) => ({ value: m, label: C.minutesOption(m) }))} />
      </Field>
      <Field title={C.focusLabel}>
        <Segmented
          label={C.focusLabel}
          columns={2}
          value={value.focus}
          onChange={(f) => set('focus', f)}
          options={FOCUSES.map((f) => ({ value: f, label: FOCUS_COPY[f].label, sub: FOCUS_COPY[f].sub }))}
        />
      </Field>
      {value.focus !== 'mobility' && (
        <Field title={C.splitLabel}>
          <Segmented
            label={C.splitLabel}
            columns={2}
            value={value.split}
            onChange={(s) => set('split', s)}
            options={SPLITS.map((s) => ({ value: s, label: SPLIT_COPY[s].label, sub: SPLIT_COPY[s].sub }))}
          />
        </Field>
      )}
      <Field title={C.equipmentLabel}>
        <Segmented
          label={C.equipmentLabel}
          columns={3}
          value={value.equipment}
          onChange={(e) => set('equipment', e)}
          options={EQUIPMENT.map((e) => ({ value: e, label: EQUIPMENT_COPY[e].label, sub: EQUIPMENT_COPY[e].sub }))}
        />
      </Field>
      <Field title={C.experienceLabel}>
        <Segmented
          label={C.experienceLabel}
          columns={3}
          value={value.experience}
          onChange={(e) => set('experience', e)}
          options={EXPERIENCES.map((e) => ({ value: e, label: EXPERIENCE_COPY[e].label, sub: EXPERIENCE_COPY[e].sub }))}
        />
      </Field>
      <Field title={C.avoidLabel} hint={C.avoidHint}>
        <AreaToggles value={value.avoid} onChange={(a) => set('avoid', a)} />
      </Field>
    </div>
  )
}
