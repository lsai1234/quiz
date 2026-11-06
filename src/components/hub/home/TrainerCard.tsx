'use client'

import Link from 'next/link'
import { Badge, Card, buttonSurface } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import type { HubHome } from '@/lib/hub/home-types'
import { TRAINER_COPY as C } from '@/lib/trainer/copy'
import { RealBadge, TrainerAvatar } from '../trainer/TrainerBits'
import { body, meta, strong } from './ui'

/**
 * Your trainer, on the home: their face, that they're a real person, and
 * where the conversation is (a new answer, a question with them, or none yet),
 * one tap from the chat.
 */
export function TrainerCard({ trainer: t }: { trainer: NonNullable<HubHome['trainer']> }) {
  const cta = buttonSurface(t.unread ? 'primary' : 'secondary', 'md')
  const status = t.unread
    ? { line: C.homeAnswered(t.name), sub: t.last?.from === 'trainer' ? t.last.text : null }
    : t.waiting
      ? { line: C.homeWaiting(t.name), sub: C.replyWithin(t.replyHours) }
      : { line: C.intro(t.name), sub: null }
  return (
    <div data-trainer-card>
      <Card padding="roomy" glow={t.unread ? 'accent' : undefined}>
        <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
          <TrainerAvatar name={t.name} photoUrl={t.photoUrl} size={52} />
          <div className="min-w-0" style={{ flex: 1 }}>
            <div className="flex items-center" style={{ gap: 'var(--space-2)', color: 'var(--accent)' }}>
              <Icon name="chat" size={14} />
              <p
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-micro)',
                  fontWeight: 'var(--weight-strong)',
                  letterSpacing: 'var(--tracking-eyebrow)',
                  textTransform: 'uppercase',
                }}
              >
                {C.homeTitle}
              </p>
            </div>
            <p style={{ ...strong, fontSize: 'var(--text-lead)', fontFamily: 'var(--font-display)', marginTop: 'var(--space-1)' }}>{t.name}</p>
            <p style={meta}>{t.role}</p>
          </div>
          {t.unread > 0 && <Badge tone="accent" dot>{C.newBadge}</Badge>}
        </div>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <RealBadge />
        </div>
        <p style={{ ...strong, fontSize: 'var(--text-body-sm)', marginTop: 'var(--space-3)' }}>{status.line}</p>
        {status.sub && (
          <p style={{ ...body, marginTop: 'var(--space-1)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{status.sub}</p>
        )}
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Link href="/myhub/trainer" className={cta.className} style={{ ...cta.style, width: '100%', justifyContent: 'center' }} data-trainer-open>
            {t.last ? C.homeOpen : C.homeAsk}
          </Link>
        </div>
      </Card>
    </div>
  )
}
