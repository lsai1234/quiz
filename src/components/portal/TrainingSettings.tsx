'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, Input, Note } from '@/components/system'

/**
 * Settings → Training plan: whether the hub's training plan is on, how many
 * members have one, and a tutorial link for each exercise and activity.
 * Members see "Watch the tutorial" once a link is here, and "coming soon"
 * until then.
 */

interface Item {
  id: string
  name: string
  group: string
  url: string | null
}
interface View {
  enabled: boolean
  plans: number
  items: Item[]
}

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

  const save = useCallback(async (id: string, url: string | null) => {
    const res = await fetch('/api/portal/training', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, url }) })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error ?? 'That did not save.')
    setView(data as View)
  }, [])

  const groups = useMemo(() => {
    const out = new Map<string, Item[]>()
    for (const item of view?.items ?? []) out.set(item.group, [...(out.get(item.group) ?? []), item])
    return [...out.entries()]
  }, [view])

  if (error && !view) return <Note tone="critical" icon="alert-triangle">{error}</Note>
  if (!view) return <Note tone="neutral" icon="clock">Reading the training settings…</Note>
  const withVideo = view.items.filter((i) => i.url).length

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
        <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
          <div>
            <h2 style={HEADING}>Tutorial videos</h2>
            <p style={{ ...META, marginTop: 'var(--space-1)' }}>
              A link per exercise or activity: YouTube, Vimeo or our own storage, https only. Members see &ldquo;Watch the tutorial&rdquo; once a link is
              here, and &ldquo;Video tutorial coming soon&rdquo; until then. {withVideo} of {view.items.length} have one.
            </p>
          </div>
          {groups.map(([group, items]) => (
            <section key={group} style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <h3 style={{ ...BODY, fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>{GROUP_LABEL[group] ?? group}</h3>
              {items.map((item) => (
                <TutorialRow key={item.id} item={item} onSave={save} />
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
