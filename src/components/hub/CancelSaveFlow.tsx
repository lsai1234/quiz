'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { downsizePreview } from '@/lib/recharge/mock'
import { ExitStatementView } from './ExitStatement'
import type { ExitQuote } from '@/lib/recharge/exit'
import { BillingImpact } from './BillingImpact'
import type { MemberSubscription } from '@/lib/recharge/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { LineRecommendation } from '@/lib/feedback'

const ACCENT = '#00D4FF'
const GREEN = '#34d399'
const AMBER = '#fbbf24'

type Reason = 'expensive' | 'too-much' | 'not-working' | 'break' | 'dont-need' | 'other'

/** "in 2 months" / "next month" — a cycle count the member can act on. */
function monthsAway(target: number, current: number): string {
  const gap = Math.max(0, target - current)
  if (gap === 0) return 'this month'
  if (gap === 1) return 'a month'
  return `${gap} months`
}

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
  /** Called once the exit has actually happened, so the hub can refresh. */
  onExited: () => void
  onClose: () => void
}

export function CancelSaveFlow({ subscription: sub, catalogue, recommendations, onSnooze, onDownsize, onSkipNext, onSwap, onExited, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const [step, setStep] = useState<'reason' | 'save' | 'snooze' | 'cancel' | 'done'>('reason')
  const [reason, setReason] = useState<Reason | null>(null)

  /**
   * The quote comes from the SERVER, not from the subscription in the browser.
   *
   * The figure decides a charge, so it is recomputed from the stored plan and
   * the member's own order history — the client's copy is a display, and a
   * display is not a thing to bill from. See the cancel route.
   */
  const [quote, setQuote] = useState<ExitQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [outcome, setOutcome] = useState<{ settlement: number; paid: boolean; scheduledFor: number | null } | null>(null)

  useEffect(() => {
    if (step !== 'cancel' || quote) return
    let live = true
    fetch('/api/hub/subscription/cancel')
      .then((r) => r.json())
      .then((d) => { if (live) d.quote ? setQuote(d.quote) : setQuoteError(d.error ?? 'Could not work out your balance.') })
      .catch(() => { if (live) setQuoteError('Could not work out your balance.') })
    return () => { live = false }
  }, [step, quote])

  async function submitExit(mode: 'now' | 'scheduled') {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/hub/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          reason: REASONS.find((r) => r.id === reason)?.label ?? 'unspecified',
          // A check, not an instruction — the server bills its own figure and
          // tells us if it has moved since this screen loaded.
          expectedSettlement: mode === 'now' ? quote?.settlement : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.settlementChanged && quote) {
          setQuote({ ...quote, settlement: data.settlement })
          setQuoteError('Your balance changed while this was open — here is the new figure.')
        } else {
          setQuoteError(data.error ?? 'That did not go through. Nothing has changed.')
        }
        return
      }
      setOutcome({
        settlement: data.settlement ?? 0,
        paid: data.paid !== false,
        scheduledFor: data.scheduledExitMonth ?? null,
      })
      setStep('done')
      onExited()
    } catch {
      setQuoteError('That did not go through. Nothing has changed.')
    } finally {
      setSubmitting(false)
    }
  }

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

  // Cancelling is unconditional — there is no term to serve out and nothing to
  // refuse. What there can be is a balance on product already sent that the flat
  // monthly hasn't covered yet; the terms promise the member sees that figure,
  // and what it's made of, before they confirm.
  const settlement = quote?.settlement ?? 0
  const downsize = downsizePreview(sub, catalogue)
  const reviewItems = recommendations.filter((r) => r.phase === 'review')
  const reasonLabel = REASONS.find((r) => r.id === reason)?.label ?? ''

  const heading = step === 'reason' ? 'Before you go'
    : step === 'snooze' ? 'Snooze instead'
    : step === 'cancel' ? 'Cancel subscription'
    : step === 'done' ? 'That’s done'
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
          <IconButton icon="x" label="Close" size="sm" filled onClick={onClose} className="mt-0.5" />
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
              <Button variant="ghost" size="sm" icon="arrow-left" fullWidth={false} onClick={() => setStep('reason')} className="mb-1 -ml-2 underline">Back</Button>

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
              <Button variant="ghost" size="sm" icon="arrow-left" fullWidth={false} onClick={() => setStep(reason && reason !== 'break' ? 'save' : 'reason')} className="mb-1 -ml-2 underline">Back</Button>
              <p className="text-xs text-[var(--color-text-2)] leading-relaxed">Pick how long. Billing and deliveries pause; your stack and prices are untouched; there’s nothing to settle — so you lose nothing.</p>
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
              <Button variant="ghost" size="sm" icon="arrow-left" fullWidth={false} onClick={() => setStep(reason ? 'save' : 'reason')} className="mb-1 -ml-2 underline">Back</Button>

              {!quote && !quoteError && (
                <p className="text-sm text-[var(--color-muted)]">Working out where you stand…</p>
              )}

              {quoteError && (
                <p className="text-xs rounded-xl px-3 py-2" style={{ background: `color-mix(in srgb, ${AMBER} 12%, transparent)`, color: AMBER }}>
                  {quoteError}
                </p>
              )}

              {quote && (
                <>
                  <p className="text-sm text-[var(--color-text-2)] leading-relaxed">
                    You can cancel now — there’s no minimum term and no cancellation fee{reasonLabel ? `. You said “${reasonLabel.toLowerCase()}”` : ''}.
                  </p>

                  {/* Nothing to pay, and why. A waiver is a promise being kept,
                      so it says which promise rather than just showing £0.00. */}
                  {quote.waiver && (
                    <div className="rounded-2xl p-4" style={{ border: `1px solid color-mix(in srgb, ${GREEN} 35%, transparent)`, background: `color-mix(in srgb, ${GREEN} 6%, transparent)` }}>
                      <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Nothing to pay</p>
                      <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">{quote.waiver.explanation}</p>
                    </div>
                  )}

                  {!quote.waiver && settlement > 0 && (
                    <div className="rounded-2xl p-4" style={{ border: `1px solid color-mix(in srgb, ${AMBER} 35%, transparent)`, background: `color-mix(in srgb, ${AMBER} 6%, transparent)` }}>
                      <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                        One last payment: {formatGBP(settlement)}
                      </p>
                      <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">
                        Your monthly is a smoothed average, so longer-lasting items are spread over the months they last. You’ve had more product than your payments have covered so far — this settles that difference, and nothing else. Everything already sent to you is yours to keep.
                      </p>
                    </div>
                  )}

                  {quote.overpayment > 0 && (
                    <div className="rounded-2xl p-4" style={{ border: `1px solid color-mix(in srgb, ${GREEN} 35%, transparent)`, background: `color-mix(in srgb, ${GREEN} 6%, transparent)` }}>
                      <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                        We owe you {formatGBP(quote.overpayment)}
                      </p>
                      <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">
                        You’ve paid for more than we’ve sent. We’ll refund the difference to your card.
                      </p>
                    </div>
                  )}

                  {quote.statement && <ExitStatementView statement={quote.statement} />}

                  {/* The alternative. The balance is a sawtooth, so there is
                      almost always a near month where leaving is free — and
                      saying so turns a bill into a choice. */}
                  {quote.freeExitMonth != null && (
                    <div className="rounded-2xl p-4" style={{ border: `1px solid color-mix(in srgb, ${ACCENT} 35%, transparent)`, background: `color-mix(in srgb, ${ACCENT} 6%, transparent)` }}>
                      <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                        Or leave free in {monthsAway(quote.freeExitMonth, sub.monthsActive)}
                      </p>
                      <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">
                        Nothing changes in the meantime — your boxes still arrive and your payments carry on, which is what clears the balance. Then your plan ends by itself with nothing to pay.
                      </p>
                      <button
                        onClick={() => submitExit('scheduled')}
                        disabled={submitting}
                        className="mt-3 w-full py-3 rounded-xl text-sm font-bold active:scale-95 transition-all disabled:opacity-60"
                        style={{ background: ACCENT, color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
                      >
                        {submitting ? 'One moment…' : 'End it free on that date'}
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => submitExit('now')}
                    disabled={submitting}
                    className="mt-2 w-full py-3.5 rounded-2xl text-sm font-bold active:scale-95 transition-all disabled:opacity-60"
                    style={{ background: AMBER, color: 'var(--color-bg)', fontFamily: 'var(--font-display)' }}
                  >
                    {submitting ? 'One moment…' : settlement > 0 ? `Confirm — pay ${formatGBP(settlement)} and cancel` : 'Confirm cancellation'}
                  </button>
                </>
              )}

              <button onClick={onClose} className="w-full py-3 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>
                Keep my subscription
              </button>
              <button onClick={() => setStep('snooze')} className="w-full py-3 rounded-2xl text-sm font-bold border border-[var(--color-border)] text-[var(--color-text-2)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>
                Snooze instead — nothing to settle
              </button>
            </>
          )}

          {/* Step: done */}
          {step === 'done' && outcome && (
            <>
              {outcome.scheduledFor != null ? (
                <div className="rounded-2xl p-4" style={{ border: `1px solid color-mix(in srgb, ${ACCENT} 35%, transparent)`, background: `color-mix(in srgb, ${ACCENT} 6%, transparent)` }}>
                  <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                    Your plan ends in {monthsAway(outcome.scheduledFor, sub.monthsActive)}
                  </p>
                  <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">
                    Nothing to pay. Everything carries on as normal until then, and you can change your mind any time from your plan.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl p-4" style={{ border: `1px solid color-mix(in srgb, ${GREEN} 35%, transparent)`, background: `color-mix(in srgb, ${GREEN} 6%, transparent)` }}>
                  <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                    Your subscription has ended
                  </p>
                  <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">
                    {outcome.settlement > 0
                      ? outcome.paid
                        ? `We’ve taken ${formatGBP(outcome.settlement)} for the balance on what was already sent. Everything you have is yours to keep, and nothing further will be billed.`
                        : `We couldn’t take the ${formatGBP(outcome.settlement)} balance from your card, so we’ve left it as an invoice you can pay from your billing page. Your plan has ended either way.`
                      : 'There was nothing left to pay. Everything you have is yours to keep, and nothing further will be billed.'}
                  </p>
                </div>
              )}
              <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                Thanks for giving us a go. Your account stays open — you can start a new plan whenever you like.
              </p>
              <button onClick={onClose} className="w-full py-3.5 rounded-2xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
