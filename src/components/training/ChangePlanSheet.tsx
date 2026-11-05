'use client'

import { useState } from 'react'
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, Note } from '@/components/system'
import { TRAINING_COPY as C } from '@/lib/training/copy'
import type { PrefsDraft } from '@/lib/training/prefs'
import type { TrainingAction } from '@/lib/training/state'
import type { TrainingPlan, TrainingPrefs } from '@/lib/training/types'
import { ActivitiesField, Field, PrefsFields } from './PrefsFields'
import { body, eyebrow, stack } from './styles'

type Act = (a: TrainingAction) => Promise<boolean>

const KEYS = ['days', 'minutes', 'focus', 'split', 'equipment', 'experience', 'avoid'] as const

/**
 * "Change your plan": the setup again, on the plan they have. Saving sends
 * only what changed, and the server re-plans only what that touches.
 * Activities are added and removed straight away; the week rebuilds from the
 * same setup.
 */
export function ChangePlanSheet({ plan, act, busy, error, onClose }: { plan: TrainingPlan; act: Act; busy: string | null; error: string | null; onClose: () => void }) {
  const [value, setValue] = useState<PrefsDraft>(plan.prefs)
  const patch: Partial<TrainingPrefs> = {}
  for (const k of KEYS) {
    if (JSON.stringify(value[k]) !== JSON.stringify(plan.prefs[k])) Object.assign(patch, { [k]: value[k] })
  }
  const changed = Object.keys(patch).length > 0
  const empty = value.days.length === 0 && plan.prefs.activities.length === 0

  return (
    <Modal onClose={onClose} presentation="sheet" size="md" label={C.changeTitle}>
      <ModalHeader eyebrow={C.eyebrow} title={C.changeTitle} subtitle={C.changeBody} />
      <ModalBody>
        <div style={stack('var(--space-6)')} data-change-plan>
          <PrefsFields value={value} onChange={setValue} />
          <Field title={C.activitiesLabel} hint={C.activitiesHint}>
            <ActivitiesField
              activities={plan.prefs.activities}
              busy={busy !== null}
              onAdd={(a) => void act({ action: 'add-activity', day: a.day, kind: a.kind, minutes: a.minutes })}
              onRemove={(a) => {
                const s = plan.sessions.find((x) => x.type === 'activity' && !x.suggested && x.day === a.day && x.activity === a.kind)
                if (s) void act({ action: 'remove', sessionId: s.id })
              }}
            />
          </Field>
          <section style={{ ...stack('var(--space-3)'), paddingTop: 'var(--space-5)', borderTop: '1px solid var(--edge)' }}>
            <h3 style={eyebrow}>{C.rebuildWeek}</h3>
            <p style={body}>{C.rebuildWeekBody}</p>
            <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
              <Button variant="secondary" size="sm" icon="refresh" loading={busy === 'rebuild-week:'} disabled={busy !== null} onClick={() => void act({ action: 'rebuild-week' })} data-rebuild-week>
                {C.rebuildWeek}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={async () => {
                  if (await act({ action: 'reset' })) onClose()
                }}
              >
                {C.startAgain}
              </Button>
            </div>
          </section>
        </div>
      </ModalBody>
      <ModalFooter>
        <div style={{ ...stack('var(--space-2)'), width: '100%' }}>
          {empty && <Note tone="attention">{C.needOne}</Note>}
          {error && (
            <Note tone="critical" live="assertive">
              {error}
            </Note>
          )}
          <Button
            variant="primary"
            fullWidth
            disabled={!changed || empty}
            loading={busy === 'prefs:'}
            onClick={async () => {
              if (await act({ action: 'prefs', patch })) onClose()
            }}
            data-save-plan
          >
            {busy === 'prefs:' ? C.saving : C.save}
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  )
}
