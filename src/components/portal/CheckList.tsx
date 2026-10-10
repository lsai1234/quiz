'use client'

import { Badge, Card } from '@/components/system'
import { Icon, type IconName } from '@/components/ui/Icon'

/**
 * A list of named checks, each with its verdict.
 *
 * Shared by the two places the hub runs checks against PowerBody — the account
 * (Settings → Supplier) and a single order that will not send — so a verdict
 * looks the same wherever it is read.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

export interface CheckItem {
  id: string
  title: string
  status: CheckStatus
  detail: string
  evidence?: string
  /** How long the call took, when it is worth saying. */
  ms?: number
}

/** Tone and glyph per outcome. `skip` stays neutral — it is not a result. */
export const CHECK_TONE: Record<
  CheckStatus,
  { tone: 'positive' | 'attention' | 'critical' | 'neutral'; icon: IconName; label: string }
> = {
  pass: { tone: 'positive', icon: 'check', label: 'Pass' },
  warn: { tone: 'attention', icon: 'alert-triangle', label: 'Read this' },
  fail: { tone: 'critical', icon: 'x', label: 'Failed' },
  skip: { tone: 'neutral', icon: 'minus', label: 'Not run' },
}

/** The `Note` tone that matches a verdict. */
export function noteToneFor(status: CheckStatus): 'positive' | 'attention' | 'critical' | 'info' {
  return status === 'pass' ? 'positive' : status === 'fail' ? 'critical' : status === 'warn' ? 'attention' : 'info'
}

export function CheckList({ checks }: { checks: CheckItem[] }) {
  return (
    <ul className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
      {checks.map((check) => {
        const tone = CHECK_TONE[check.status]
        return (
          <li key={check.id}>
            <Card elevation={1} padding="tight">
              <div className="flex items-start" style={{ gap: 'var(--space-3)' }}>
                <Icon name={tone.icon} size={16} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                    <span
                      style={{
                        fontSize: 'var(--text-body-sm)',
                        fontWeight: 'var(--weight-strong)',
                        fontFamily: 'var(--font-display)',
                        color: 'var(--ink-1)',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {check.title}
                    </span>
                    <Badge tone={tone.tone}>{tone.label}</Badge>
                    {check.ms != null && check.ms > 0 && (
                      <span style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)' }}>{check.ms}ms</span>
                    )}
                  </div>
                  <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-2)' }}>
                    {check.detail}
                  </p>
                  {check.evidence && (
                    <p
                      style={{
                        fontSize: 'var(--text-meta)',
                        color: 'var(--ink-3)',
                        marginTop: 'var(--space-1)',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {check.evidence}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
