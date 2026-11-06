'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { HubLogin } from '@/components/hub/HubLogin'
import { HubShell } from '@/components/hub/HubShell'
import { HubSkeleton } from '@/components/hub/HubSkeleton'
import { Card, Note, buttonSurface } from '@/components/system'
import { useHubStore } from '@/lib/hub-store'
import { TRAINING_COPY as C } from '@/lib/training/copy'
import type { TrainingAction, TrainingState } from '@/lib/training/state'
import { Readiness } from './Readiness'
import { Setup } from './Setup'
import { Week } from './Week'
import { body, display, eyebrow, stack } from './styles'

/**
 * /myhub/training: the member's training plan.
 *
 *   signed out          the hub's own sign-in
 *   hub closed / off    what it is and how to get it
 *   first time          the readiness check, then the setup (from their answers)
 *   after that          the week
 *
 * Every change is one POST to `/api/hub/training`, which answers with the
 * whole state; `busy` names what's running so only that control spins.
 */
export function TrainingPage() {
  const session = useHubStore((s) => s.session)
  const hydrated = useHubStore((s) => s.hydrated)
  const providers = useHubStore((s) => s.providers)
  const canResetPassword = useHubStore((s) => s.canResetPassword)
  const hydrate = useHubStore((s) => s.hydrate)
  const authenticate = useHubStore((s) => s.authenticate)
  const logout = useHubStore((s) => s.logout)

  const [state, setState] = useState<TrainingState | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  const signedIn = Boolean(session)
  useEffect(() => {
    if (!signedIn) return
    let live = true
    fetch('/api/hub/training')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((s: TrainingState) => live && setState(s))
      .catch(() => live && setLoadError(true))
    return () => {
      live = false
    }
  }, [signedIn])

  const act = useCallback(async (a: TrainingAction): Promise<boolean> => {
    const key = `${a.action}:${'sessionId' in a ? a.sessionId : ''}`
    setBusy(key)
    setError(null)
    try {
      const res = await fetch('/api/hub/training', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) })
      if (!res.ok) throw new Error()
      setState((await res.json()) as TrainingState)
      return true
    } catch {
      setError(C.error)
      return false
    } finally {
      setBusy(null)
    }
  }, [])

  if (!hydrated) {
    return (
      <HubShell>
        <HubSkeleton />
      </HubShell>
    )
  }
  if (!session) return <HubLogin onAuthenticate={authenticate} providers={providers} canResetPassword={canResetPassword} />

  const back = buttonSurface('ghost', 'sm')
  return (
    <HubShell onSignOut={logout} nav="training">
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link href="/myhub" className={back.className} style={back.style} data-back-hub>
          ← {C.backToHub}
        </Link>
      </div>
      {loadError ? (
        <Note tone="critical">{C.error}</Note>
      ) : !state ? (
        <HubSkeleton />
      ) : !state.access.enabled ? (
        <Closed title={C.offTitle} body={C.offBody} />
      ) : !state.access.allowed ? (
        <Closed title={C.noAccessTitle} body={C.noAccessBody} cta={{ href: '/', label: C.noAccessCta }} />
      ) : !state.readiness ? (
        <Readiness busy={busy === 'ready:'} onCleared={() => void act({ action: 'ready' })} />
      ) : !state.plan ? (
        state.draft && <Setup draft={state.draft} busy={busy === 'build:'} error={error} onBuild={(prefs) => void act({ action: 'build', prefs })} />
      ) : (
        <Week state={state} plan={state.plan} act={act} busy={busy} error={error} />
      )}
    </HubShell>
  )
}

function Closed({ title, body: text, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  const primary = buttonSurface('primary', 'md')
  return (
    <div style={stack('var(--stack)')} data-training-closed>
      <header>
        <p style={eyebrow}>{C.eyebrow}</p>
        <h1 style={{ ...display, marginTop: 'var(--space-2)' }}>{title}</h1>
      </header>
      <Card padding="roomy">
        <p style={body}>{text}</p>
        {cta && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Link href={cta.href} className={primary.className} style={primary.style}>
              {cta.label}
            </Link>
          </div>
        )}
      </Card>
    </div>
  )
}
