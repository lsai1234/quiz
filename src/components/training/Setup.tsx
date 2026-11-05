'use client'

import { useEffect, useState } from 'react'
import { Button, Card, Note } from '@/components/system'
import { TRAINING_COPY as C } from '@/lib/training/copy'
import type { PrefsDraft } from '@/lib/training/prefs'
import type { TrainingPrefs } from '@/lib/training/types'
import { ActivitiesField, Field, PrefsFields } from './PrefsFields'
import { body, display, eyebrow, stack } from './styles'

/** A draft with nothing left to choose, as a setup. */
export function completePrefs(d: PrefsDraft): TrainingPrefs | null {
  if (!d.equipment || !d.experience) return null
  if (d.days.length === 0 && d.activities.length === 0) return null
  return { ...d, equipment: d.equipment, experience: d.experience }
}

/** The first setup, filled in from their answers; theirs to change before the first plan. */
export function Setup({ draft, onBuild, busy, error }: { draft: PrefsDraft; onBuild: (p: TrainingPrefs) => void; busy: boolean; error: string | null }) {
  const [value, setValue] = useState<PrefsDraft>(draft)
  const [slow, setSlow] = useState(false)
  const prefs = completePrefs(value)

  useEffect(() => {
    if (!busy) return
    const t = setTimeout(() => setSlow(true), 5000)
    return () => {
      clearTimeout(t)
      setSlow(false)
    }
  }, [busy])

  return (
    <div style={stack('var(--stack)')} data-setup>
      <header>
        <p style={eyebrow}>{C.eyebrow}</p>
        <h1 style={{ ...display, marginTop: 'var(--space-2)' }}>{C.setupTitle}</h1>
        <p style={{ ...body, marginTop: 'var(--space-2)' }}>{C.setupBody}</p>
      </header>

      <Card padding="roomy">
        <div style={stack('var(--space-6)')}>
          <PrefsFields value={value} onChange={setValue} />
          <Field title={C.activitiesLabel} hint={C.activitiesHint}>
            <ActivitiesField
              activities={value.activities}
              onAdd={(a) => setValue((v) => ({ ...v, activities: [...v.activities, a].sort((x, y) => x.day - y.day) }))}
              onRemove={(a) => setValue((v) => ({ ...v, activities: v.activities.filter((x) => !(x.day === a.day && x.kind === a.kind)) }))}
            />
          </Field>
        </div>
      </Card>

      <div style={stack('var(--space-2)')}>
        {value.days.length === 0 && value.activities.length === 0 && <Note tone="attention">{C.needOne}</Note>}
        {error && (
          <Note tone="critical" live="assertive">
            {error}
          </Note>
        )}
        {busy && <Note tone="info" live="polite">{slow ? C.buildingSlow : C.building}</Note>}
        <Button variant="primary" size="lg" fullWidth disabled={!prefs} loading={busy} onClick={() => prefs && onBuild(prefs)} data-build>
          {C.buildCta}
        </Button>
      </div>
    </div>
  )
}
