'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card, Note, buttonSurface } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import { HubLogin } from '@/components/hub/HubLogin'
import { HubShell } from '@/components/hub/HubShell'
import { HubSkeleton } from '@/components/hub/HubSkeleton'
import { useHubStore } from '@/lib/hub-store'
import { TRAINER_COPY as C } from '@/lib/trainer/copy'
import type { MemberTrainerView } from '@/lib/trainer/types'
import { VIDEO_COPY as V } from '@/lib/trainer/video-copy'
import { body, col, eyebrow, meta, strong } from '../home/ui'
import { RealBadge, TrainerAvatar } from './TrainerBits'
import { Clip } from './TrainerVideo'

/**
 * /myhub/trainer/about: who the trainer is, before or after asking. Their
 * photo, what they hold (once confirmed), when they answer and how fast,
 * and their intro video when there is one. Reading it never marks their
 * answers read.
 */
export function TrainerAboutPage() {
  const session = useHubStore((s) => s.session)
  const hydrated = useHubStore((s) => s.hydrated)
  const providers = useHubStore((s) => s.providers)
  const canResetPassword = useHubStore((s) => s.canResetPassword)
  const hydrate = useHubStore((s) => s.hydrate)
  const authenticate = useHubStore((s) => s.authenticate)
  const logout = useHubStore((s) => s.logout)
  const [view, setView] = useState<MemberTrainerView | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    void hydrate()
  }, [hydrate])
  useEffect(() => {
    if (!session) return
    fetch('/api/hub/trainer?peek=1')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((v: MemberTrainerView) => setView(v))
      .catch(() => setFailed(true))
  }, [session])

  if (!hydrated) {
    return (
      <HubShell>
        <HubSkeleton />
      </HubShell>
    )
  }
  if (!session) return <HubLogin onAuthenticate={authenticate} providers={providers} canResetPassword={canResetPassword} />

  const back = buttonSurface('ghost', 'sm')
  const ask = buttonSurface('primary', 'md')
  const t = view?.trainer
  return (
    <HubShell onSignOut={logout} nav="trainer">
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link href="/myhub/trainer" className={back.className} style={back.style} data-back-trainer>
          ← {V.aboutBack}
        </Link>
      </div>
      {failed ? (
        <Note tone="critical">{C.failed}</Note>
      ) : !view ? (
        <HubSkeleton />
      ) : !view.live || !t ? (
        <Card padding="roomy">
          <p style={eyebrow}>{C.offTitle}</p>
          <p style={{ ...body, marginTop: 'var(--space-2)' }}>{C.offBody}</p>
        </Card>
      ) : (
        <div style={col('var(--stack)')} data-trainer-about>
          <Card padding="roomy" glow="accent">
            <div style={col('var(--space-3)')}>
              <div className="flex items-center" style={{ gap: 'var(--space-4)' }}>
                <TrainerAvatar name={t.name} photoUrl={t.photoUrl} size={96} />
                <div className="min-w-0" style={col('var(--space-1)')}>
                  <p style={eyebrow}>{C.title}</p>
                  <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-display)', fontWeight: 'var(--weight-strong)', lineHeight: 'var(--leading-tight)', color: 'var(--ink-1)' }}>
                    {V.aboutTitle(t.name)}
                  </h1>
                  <p style={meta}>{t.role}</p>
                </div>
              </div>
              <div>
                <RealBadge />
              </div>
              <p style={{ ...strong, fontSize: 'var(--text-body-sm)' }}>{V.aboutRealPerson}</p>
              {t.introVideo && <Clip src={t.introVideo} label={V.introVideo(t.name)} />}
              {t.bio && <p style={{ ...body, whiteSpace: 'pre-line' }}>{t.bio}</p>}
            </div>
          </Card>
          <Card padding="normal">
            <ul style={col('var(--space-2)')} data-trainer-facts>
              {t.qualifications && <Fact icon="shield" text={C.qualifications(t.qualifications)} />}
              <Fact icon="clock" text={view.replyStat ? C.medianReply(view.replyStat.medianHours) : V.aboutReply(t.replyHours)} />
              {t.answersOn && <Fact icon="calendar" text={C.answersOn(t.name, t.answersOn)} />}
              {t.checksPlans && <Fact icon="check" text={V.aboutChecks} />}
            </ul>
          </Card>
          {view.open && (
            <div>
              <Link href="/myhub/trainer" className={ask.className} style={ask.style} data-trainer-about-ask>
                {V.aboutAsk(t.name)}
              </Link>
            </div>
          )}
          <p style={meta}>{C.medical}</p>
        </div>
      )}
    </HubShell>
  )
}

function Fact({ icon, text }: { icon: 'shield' | 'clock' | 'calendar' | 'check'; text: string }) {
  return (
    <li className="flex items-start" style={{ gap: 'var(--space-2)', ...body }}>
      <span style={{ color: 'var(--accent)', marginTop: 'var(--space-1)' }}>
        <Icon name={icon} size={14} />
      </span>
      {text}
    </li>
  )
}
