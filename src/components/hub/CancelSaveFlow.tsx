'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { downsizePreview, monthsRemainingOnTerm, canCancel } from '@/lib/recharge/mock'
import { BillingImpact } from './BillingImpact'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { LineRecommendation } from '@/lib/feedback'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'

type Reason = 'expensive' | 'too-much' | 'not-working' | 'break' | 'dont-need' | 'other'

const REASONS: { id: Reason; label: string }[] = [
  { id: 'expensive', label: 'It’s too expensive right now' },
  { id: 'too-much', label: 'I’ve got too much piling up' },
  { id: 'not-working', label: 'I’m not seeing results' },
  { id: 'break', label: 'I need a break / going away' },
  { id: 'dont-need', label: 'I don’t need it anymore' },
  { id: 'other', label: 'Something else' },
]

interface Props {
  subscription: MemberSubscription
  catalogue: CatalogueProduct[]
  recommendations: LineRecommendation[]
  onSnooze: (months: number) => void
  onDownsize: (dropLineIds: string[]) => void
  onSkipNext: () => void
  onSwap: (lineId: string) => void
  onCancel: (reason: string) => void
  onClose: () => void
}

export function CancelSaveFlow({ subscription: sub, catalogue, recommendations, onSnooze, onDownsize, onSkipNext, onSwap, onCancel, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const [step, setStep] = useState<'reason' | 'save' | 'snooze' | 'cancel'>('reason')
  const [reason, setReason] = useState<Reason | null>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  if (!mounted) return null

  const remaining = monthsRemainingOnTerm(sub)
  const cancellable = canCancel(sub)
  const downsize = downsizePreview(sub, catalogue)
  const reviewItems = recommendations.filter((r) => r.phase === 'review')
  const reasonLabel = REASONS.find((r) => r.id === reason)?.label ?? ''

  const heading = step === 'reason' ? 'Before you go'
    : step === 'snooze' ? 'Snooze instead'
    : step === 'cancel' ? 'Cancel subscription'
    : 'A few options first'

  function Primary({ title, body, cta, tone = ACCENT, onClick }: { title: string; body: React.ReactNode; cta: string; tone?: string; onClick: () => void }) {
    return (
      <div className="rounded-2xl border p-4" style={{ borderColor: `color-mix(in srgb, ${tone} 35%, transparent)`, background: `color-mix(in srgb, ${tone} 6%, transparent)` }}>
        <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>{title}</p>
        <div className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed">{body}</div>
        <button onClick={onClick} className="mt-3 w-full py-3 rounded-xl text-sm font-bold active:scale-95 transition-all" style={{ background: tone, color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}>
          {cta}
        </button>
      </div>
    )
  }

  function SnoozeOption() {
    return (
      <Primary
        tone={ACCENT}
        title="Pause, don’t cancel"
        body={<>Going away or just need a breather? Snooze for up to 3 months — billing and deliveries stop, your stack stays exactly as it is, and your term simply moves back. Nothing lost.</>}
        cta="Snooze my plan"
        onClick={() => setStep('snooze')}
      />
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }} style={{ background: 'rgba(0,0,0,0.72)' }}>
      <div className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col" style={{ background: 'var(--color-surface)', maxHeight: '92dvh' }}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border-2)]" />
        </div>

        <div className="px-5 pt-2 pb-4 flex items-start justify-between gap-3 flex-shrink-0 border-b border-[var(--color-border)]">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase mb-0.5" style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}>Your subscription</p>
            <h3 className="text-lg font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>{heading}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-muted)] bg-[var(--color-surface-2)] active:scale-90 flex-shrink-0 mt-0.5" aria-label="Close">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {/* Step 1: reason */}
          {step === 'reason' && (
            <>
              <p className="text-xs text-[var(--color-muted)] mb-1">What’s prompting this? We’ll see if there’s a better option than cancelling.</p>
              {REASONS.map((r) => (
                <button key={r.id} onClick={() => { setReason(r.id); setStep(r.id === 'break' ? 'snooze' : 'save') }}
                  className="w-full text-left px-4 py-3.5 rounded-2xl text-sm font-semibold active:scale-[0.98] transition-all"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                  {r.label}
                </button>
              ))}
            </>
          )}

          {/* Step 2: tailored save */}
          {step === 'save' && (
            <>
              <button onClick={() => setStep('reason')} className="text-xs font-semibold text-[var(--color-muted)] underline mb-1">← Back</button>

              {reason === 'expensive' && (
                <Primary
                  tone={GREEN}
                  title={`Trim to essentials · ${formatGBP(downsize.newMonthly)}/mo`}
                  body={downsize.droppedLines.length > 0
                    ? <>Keep what you won’t want to miss and drop the rest for now: {downsize.droppedLines.map((d) => d.productTitle).join(', ')}. You can re-add anytime.</>
                    : <>Your stack is already lean — try snoozing or skipping a box instead.</>}
                  cta={downsize.droppedLines.length > 0 ? `Switch to ${formatGBP(downsize.newMonthly)}/mo` : 'See other options'}
                  onClick={() => { if (downsize.droppedLines.length > 0) { onDownsize(downsize.droppedLines.map((d) => d.id)); onClose() } else setStep('snooze') }}
                />
              )}
              {reason === 'expensive' && downsize.droppedLines.length > 0 && (
                <BillingImpact monthlyBefore={downsize.currentMonthly} monthlyAfter={downsize.newMonthly} note="Trims your plan from your next box — re-add anything whenever you like." />
              )}

              {reason === 'too-much' && (
                <Primary
                  tone={ACCENT}
                  title="Skip your next box"
                  body={<>Got plenty? Skip the next delivery — you won’t be charged for it and your term moves back a month. Slow individual items down anytime from Manage.</>}
                  cta="Skip my next box"
                  onClick={() => { onSkipNext(); onClose() }}
                />
              )}

              {reason === 'not-working' && (reviewItems.length > 0 ? (
                <div className="rounded-2xl border p-4" style={{ borderColor: `color-mix(in srgb, ${AMBER} 35%, transparent)`, background: `color-mix(in srgb, ${AMBER} 6%, transparent)` }}>
                  <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Let’s fix what’s not landing</p>
                  <p className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed">Before you drop everything, swap the {reviewItems.length === 1 ? 'one product' : 'products'} that hasn’t worked for you:</p>
                  <div className="mt-3 space-y-2">
                    {reviewItems.map((r) => (
                      <button key={r.lineId} onClick={() => { onSwap(r.lineId); onClose() }} className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-left active:scale-[0.98]" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                        <span className="text-sm font-semibold text-[var(--color-text)] truncate">{r.productTitle}</span>
                        <span className="text-xs font-bold flex-shrink-0" style={{ color: AMBER }}>Find a better fit →</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <Primary tone={ACCENT} title="Most of your stack is still settling in" body={<>Some products (like vitamins and omega-3) work quietly over weeks. Snooze if you need to, rather than stopping before they’ve had a fair go.</>} cta="Snooze instead" onClick={() => setStep('snooze')} />
              ))}

              {(reason === 'dont-need' || reason === 'other') && (
                <p className="text-xs text-[var(--color-text-2)] leading-relaxed">No problem. If it’s temporary, a snooze keeps everything in place — otherwise you can cancel below.</p>
              )}

              {/* Universal snooze offer (except where it's already the primary) */}
              {reason !== 'not-working' && <SnoozeOption />}

              {/* Honest exit */}
              <button onClick={() => setStep('cancel')} className="w-full py-3 rounded-2xl text-sm font-semibold text-[var(--color-muted)] underline">
                No thanks — cancel my subscription
              </button>
            </>
          )}

          {/* Step: snooze */}
          {step === 'snooze' && (
            <>
              <button onClick={() => setStep(reason && reason !== 'break' ? 'save' : 'reason')} className="text-xs font-semibold text-[var(--color-muted)] underline mb-1">← Back</button>
              <p className="text-xs text-[var(--color-text-2)] leading-relaxed">Pick how long. Billing and deliveries pause; your stack and prices are untouched; your minimum term moves back to match — so you lose nothing.</p>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[1, 2, 3].map((m) => {
                  const until = new Date(); until.setMonth(until.getMonth() + m)
                  return (
                    <button key={m} onClick={() => { onSnooze(m); onClose() }} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-center active:scale-95 transition-all">
                      <p className="text-2xl font-black text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>{m}</p>
                      <p className="text-[10px] text-[var(--color-muted)]">month{m > 1 ? 's' : ''}</p>
                      <p className="text-[10px] mt-1" style={{ color: ACCENT }}>back {until.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Step: cancel */}
          {step === 'cancel' && (
            <>
              <button onClick={() => setStep(reason ? 'save' : 'reason')} className="text-xs font-semibold text-[var(--color-muted)] underline mb-1">← Back</button>
              {cancellable ? (
                <>
                  <p className="text-sm text-[var(--color-text-2)] leading-relaxed">You can cancel now and you won’t be charged again. We’d love to know why{reasonLabel ? ` — you said “${reasonLabel.toLowerCase()}”` : ''}.</p>
                  <button onClick={() => { onCancel(reasonLabel || 'unspecified'); onClose() }} className="mt-2 w-full py-3.5 rounded-2xl text-sm font-bold active:scale-95 transition-all" style={{ background: AMBER, color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}>
                    Confirm cancellation
                  </button>
                  <button onClick={onClose} className="w-full py-3 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>
                    Keep my subscription
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-[var(--color-text-2)] leading-relaxed">
                    You’re still within your minimum term ({remaining} {remaining === 1 ? 'month' : 'months'} left). You can’t cancel just yet, but a <span className="font-semibold text-[var(--color-text)]">snooze</span> pauses everything and pushes the term back — so you’re not paying for nothing.
                  </p>
                  <button onClick={() => setStep('snooze')} className="mt-2 w-full py-3.5 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>
                    Snooze instead
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
