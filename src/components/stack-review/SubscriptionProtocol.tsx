'use client'

import type { SubscriptionLine } from '@/lib/stack-blueprint/pricing'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import type { QuizAnswers } from '@/lib/types'

const ACCENT = '#00D4FF'

const FREQ_LABEL: Record<string, string> = {
  '1-2x': '1–2× a week',
  '3-4x': '3–4× a week',
  '5-6x': '5–6× a week',
  daily: 'every day',
}

function unitNoun(formats: string[]): string {
  const f = (formats[0] ?? '').toLowerCase()
  if (f.includes('powder')) return 'tub'
  return 'pack'
}

function quantityLabel(line: SubscriptionLine): string {
  const noun = unitNoun(line.product.formats)
  if (line.shipEveryMonths > 1) return `1 ${noun} every ${line.shipEveryMonths} months`
  if (line.unitsPerShipment > 1) return `${line.unitsPerShipment} ${noun}s a month`
  return `1 ${noun} a month`
}

function cadenceLabel(line: SubscriptionLine): string {
  return line.cadence === 'daily'
    ? 'Take every day'
    : `Take on training days (~${line.occasionsPerMonth}/month)`
}

interface Props {
  plan: SubscriptionLine[]
  answers?: QuizAnswers | null
  slotTitleById: Record<string, string>
}

export function SubscriptionProtocol({ plan, answers, slotTitleById }: Props) {
  if (plan.length === 0) return null

  const freq = answers?.trainingFrequency ? FREQ_LABEL[answers.trainingFrequency] : null

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] overflow-hidden mb-4">
      <div className="p-5">
        <p
          className="text-[10px] font-bold tracking-widest uppercase mb-1"
          style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
        >
          Your monthly protocol
        </p>
        <p className="text-xs text-[var(--color-muted)] mb-4 leading-relaxed">
          {freq
            ? `Sized to how you train — ${freq}. Daily staples come monthly; training-day items scale to your sessions.`
            : 'Daily staples come monthly; training-day items scale to how often you train.'}
        </p>

        <div className="space-y-3">
          {plan.map((line) => {
            const covers = line.coversSlotIds
              .map((id) => slotTitleById[id])
              .filter(Boolean)
              .join(' + ')
            return (
              <div key={line.product.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="text-sm font-bold leading-snug"
                    style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
                  >
                    {covers || line.product.title}
                  </p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5 truncate">
                    {line.product.title}
                  </p>
                  <p className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--color-text-2)' }}>
                    {cadenceLabel(line)} · {quantityLabel(line)}
                  </p>
                </div>
                <span
                  className="text-sm font-black flex-shrink-0"
                  style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}
                >
                  {formatGBP(line.monthlyPrice)}/mo
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
