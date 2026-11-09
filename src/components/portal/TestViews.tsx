'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Checkbox, Note, buttonSurface } from '@/components/system'
import { TEST_VIEWS, type TestViewDef } from '@/lib/samples/views'
import type { TestSwitches } from '@/lib/samples/session'

/**
 * Settings → Test views: a button for every screen, each opening in a new tab
 * with sample data. The switches choose which parts test views show, whatever
 * is live; they change nothing for anyone else.
 */
interface State {
  open: boolean
  switches: TestSwitches
  live: Record<keyof TestSwitches, boolean>
}

const HEADING = { fontSize: 'var(--text-title)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' } as const
const META = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' } as const
const BODY = { fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-2)' } as const

const SWITCHES: { key: keyof TestSwitches; label: string }[] = [
  { key: 'training', label: 'Training plan' },
  { key: 'trainer', label: 'Ask your trainer' },
  { key: 'deals', label: 'Member prices' },
  { key: 'checkIns', label: 'Amp check-ins' },
  { key: 'hubOnSale', label: 'The hub on sale on its own (and its saving)' },
  { key: 'coaching', label: 'Coaching tools: workout mode, how it felt, busy and away, live calendar' },
  { key: 'video', label: 'Video, form checks and the answers library' },
  { key: 'programmes', label: 'Programmes, goals and the progress page' },
]

export function TestViews() {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/portal/test-views', { cache: 'no-store' }).catch(() => null)
    if (res?.ok) setState((await res.json()) as State)
    else setNote('Could not load test views. Reload the page to try again.')
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function setSwitch(key: keyof TestSwitches, on: boolean) {
    if (!state) return
    setBusy(true)
    const res = await fetch('/api/portal/test-views', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ switches: { ...state.switches, [key]: on } }) }).catch(() => null)
    if (res?.ok) setState((await res.json()) as State)
    setBusy(false)
  }

  async function reset() {
    setBusy(true)
    const res = await fetch('/api/portal/test-views', { method: 'DELETE' }).catch(() => null)
    setNote(res?.ok ? 'Sample data cleared. Each view builds it again when you open it.' : 'That didn’t clear. Try again.')
    setBusy(false)
  }

  async function leave() {
    setBusy(true)
    await fetch('/api/test-view/leave', { method: 'POST' }).catch(() => null)
    await load()
    setBusy(false)
  }

  const groups = [...new Set(TEST_VIEWS.map((v) => v.group))]
  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }} data-test-views>
      <Card elevation={1}>
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-3)' }}>
            <h2 style={HEADING}>In test views</h2>
            <Badge tone={state?.open ? 'accent' : 'neutral'} dot>
              {state?.open ? 'A test view is open in this browser' : 'No test view open'}
            </Badge>
          </div>
          <p style={BODY}>
            Each button opens a page in a new tab with sample data and a banner saying so. Sample members can’t pay, are never emailed and never count in your
            numbers. While a test view is open, this browser sees the parts switched on below whatever is live; nobody else does. Leave it from the banner or
            here.
          </p>
          {state && (
            <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
              {SWITCHES.map((s) => (
                <Checkbox
                  key={s.key}
                  label={s.label}
                  hint={state.live[s.key] ? 'On for customers too' : 'Off for customers'}
                  checked={state.switches[s.key]}
                  disabled={busy}
                  onChange={(e) => void setSwitch(s.key, e.target.checked)}
                  data-test-switch={s.key}
                />
              ))}
            </div>
          )}
          <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void reset()} data-test-reset>
              Reset sample data
            </Button>
            {state?.open && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void leave()} data-test-leave>
                Leave test view
              </Button>
            )}
          </div>
          {note && <p style={META}>{note}</p>}
        </div>
      </Card>

      {groups.map((g) => (
        <Card key={g} elevation={1}>
          <div style={{ display: 'grid', gap: 'var(--space-3)' }} data-test-group={g}>
            <h2 style={HEADING}>{g}</h2>
            <ul style={{ display: 'grid', gap: 'var(--space-2)' }}>
              {TEST_VIEWS.filter((v) => v.group === g).map((v) => (
                <ViewRow key={v.id} view={v} />
              ))}
            </ul>
          </div>
        </Card>
      ))}

      <Note tone="info" icon="info">
        Opening a member view signs this browser into that sample account, so you’ll be signed out of any member account you were using here. The Meta pixel is
        left as it is, so it still counts page views on test views.
      </Note>
    </div>
  )
}

function ViewRow({ view }: { view: TestViewDef }) {
  const open = buttonSurface('secondary', 'sm')
  return (
    <li className="flex flex-wrap items-center justify-between" style={{ gap: 'var(--space-3)' }} data-test-view={view.id}>
      <span className="min-w-0" style={{ flex: 1 }}>
        <span style={{ display: 'block', color: 'var(--ink-1)', fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)' }}>{view.label}</span>
        <span style={{ ...META, display: 'block' }}>{view.note}</span>
      </span>
      <a href={`/api/portal/test-views/open?view=${view.id}`} target="_blank" rel="noopener" className={open.className} style={open.style}>
        Open
      </a>
    </li>
  )
}
