'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { Button, Card } from '@/components/system'
import { Icon, type IconName } from '@/components/ui/Icon'
import { HUB_COPY as C } from '@/lib/hub/copy'
import type { HubHome } from '@/lib/hub/home-types'
import { body, Dot, eyebrow, meta, strong } from './ui'

/**
 * The home's bento: small cards, each one thing at a glance (one big figure,
 * one line) and one tap to it. Member prices and tips run the full width;
 * this week and the check-in sit side by side.
 */

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const shortDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** A tile: icon and label, a figure, a line; the whole tile is the link. */
function Tile({
  icon,
  label,
  figure,
  line,
  sub,
  href,
  linkLabel,
  glow,
  children,
  data,
}: {
  icon: IconName
  label: string
  figure?: ReactNode
  line: ReactNode
  sub?: ReactNode
  href?: string
  linkLabel?: string
  glow?: 'accent' | 'positive'
  children?: ReactNode
  data: string
}) {
  return (
    <div className="relative h-full" data-tile={data}>
      <Card padding="normal" glow={glow} interactive={Boolean(href)}>
        <div className="flex h-full flex-col" style={{ gap: 'var(--space-2)' }}>
          <div className="flex items-center" style={{ gap: 'var(--space-2)', color: glow === 'positive' ? 'var(--tone-positive)' : 'var(--accent)' }}>
            <Icon name={icon} size={14} />
            <p style={{ ...eyebrow, color: 'inherit' }}>{label}</p>
          </div>
          {figure !== undefined && (
            <p className="hub-figure" style={{ fontSize: 'var(--text-display)', color: 'var(--ink-1)' }}>
              {figure}
            </p>
          )}
          <p style={{ ...strong, fontSize: 'var(--text-body-sm)' }}>{line}</p>
          {sub && <p style={meta}>{sub}</p>}
          {children}
        </div>
      </Card>
      {href && (
        // The whole tile is the link: a stretched anchor over it.
        <Link href={href} aria-label={linkLabel ?? label} className="absolute inset-0" style={{ borderRadius: 'var(--radius-card)' }} data-tile-link={data} />
      )}
    </div>
  )
}

export function DealsTile({ deals }: { deals: NonNullable<HubHome['deals']> }) {
  if (deals.best) {
    return (
      <Tile
        data="deals"
        icon="star"
        label={C.dealsTitle}
        glow="positive"
        figure={`£${deals.best.total.toFixed(2)}`}
        line={`${deals.best.short} · ${deals.best.line}`}
        sub={deals.open > 1 ? C.dealsOpen(deals.open) : deals.next ? C.dealsNext(deals.next.short, deals.next.line, deals.next.opensInDays) : undefined}
        href="#deals"
      />
    )
  }
  if (deals.next) {
    return (
      <Tile
        data="deals"
        icon="star"
        label={C.dealsTitle}
        figure={C.dealsDays(deals.next.opensInDays)}
        line={C.dealsOpensIn(deals.next.short, deals.next.opensInDays)}
        sub={deals.next.line}
        href="#deals"
      />
    )
  }
  return <Tile data="deals" icon="star" label={C.dealsTitle} line={C.dealsNone} />
}

export function WeekTile({ training }: { training: NonNullable<HubHome['training']> }) {
  const today = (new Date().getDay() + 6) % 7
  if (!training.hasPlan) {
    return <Tile data="week" icon="dumbbell" label={C.trainingTitle} figure="+" line={C.trainingStart} sub={C.trainingNew} href="/myhub/training" glow="accent" />
  }
  return (
    <Tile
      data="week"
      icon="dumbbell"
      label={C.trainingTitle}
      figure={`${training.done}/${training.planned}`}
      line={training.next ? C.trainingNext(training.next.title, LONG[training.next.day]) : C.trainingAllDone}
      href="/myhub/training"
      linkLabel={C.trainingOpen}
    >
      <div className="flex items-center justify-between" style={{ marginTop: 'var(--space-1)' }} aria-hidden>
        {WEEK.map((d, i) => {
          const sessions = training.week.filter((s) => s.day === i)
          return (
            <span key={i} className="flex flex-col items-center" style={{ gap: 'var(--space-1)' }}>
              <span style={{ ...meta, fontSize: 'var(--text-micro)', color: i === today ? 'var(--accent)' : 'var(--ink-3)', fontWeight: 'var(--weight-strong)' }}>{d}</span>
              {sessions.length ? <Dot on={sessions.every((s) => s.done)} /> : <span style={{ width: 'var(--space-2)', height: 'var(--space-2)' }} />}
            </span>
          )
        })}
      </div>
    </Tile>
  )
}

export function CheckInTile({ checkIn }: { checkIn: NonNullable<HubHome['checkIn']> }) {
  return (
    <Tile
      data="checkin"
      icon="sparkle"
      label={C.checkInTitle}
      glow={checkIn.due ? 'accent' : undefined}
      figure={checkIn.due ? C.checkInNow : checkIn.nextDue ? shortDate(checkIn.nextDue) : '—'}
      line={checkIn.due ? C.checkInDue : C.checkInNextShort}
      sub={checkIn.answered > 0 ? C.checkInHistory(checkIn.answered) : undefined}
      href={`/checkin/${checkIn.token}`}
      linkLabel={C.checkInCta}
    />
  )
}

export function TipsTile({ tips }: { tips: HubHome['tips'] }) {
  const [i, setI] = useState(0)
  const tip = tips[i]
  if (!tip) return null
  return (
    <div data-tile="tips" className="h-full">
      <Card padding="normal">
        <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
          <div className="flex items-center justify-between" style={{ gap: 'var(--space-2)' }}>
            <div className="flex items-center" style={{ gap: 'var(--space-2)', color: 'var(--accent)' }}>
              <Icon name="bolt" size={14} />
              <p style={{ ...eyebrow, color: 'inherit' }}>{C.tipsTitle}</p>
            </div>
            <div className="flex items-center" style={{ gap: 'var(--space-1)' }}>
              <Button variant="ghost" size="sm" icon="chevron-left" aria-label="Previous tip" disabled={i === 0} onClick={() => setI((x) => Math.max(0, x - 1))} />
              <span style={{ ...meta, fontVariantNumeric: 'tabular-nums' }}>{`${i + 1}/${tips.length}`}</span>
              <Button variant="ghost" size="sm" icon="chevron-right" aria-label="Next tip" disabled={i === tips.length - 1} onClick={() => setI((x) => Math.min(tips.length - 1, x + 1))} />
            </div>
          </div>
          <p style={{ ...strong, fontSize: 'var(--text-lead)', fontFamily: 'var(--font-display)' }} aria-live="polite">
            {tip.title}
          </p>
          <p style={body}>{tip.text}</p>
        </div>
      </Card>
    </div>
  )
}
