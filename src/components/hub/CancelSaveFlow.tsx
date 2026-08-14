'use client'

import { useEffect, useState } from 'react'
import { Sheet, SheetBody, SheetHeader } from '@/components/ui/Sheet'
import { GLASS, tint } from '@/lib/ui/tokens'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Note } from '@/components/ui/Note'
import { OptionRow } from '@/components/ui/OptionRow'
import type { IconName } from '@/components/ui/Icon'
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

/** A glyph per reason — the same scan-by-shape the quiz's option lists give. */
const REASON_ICON: Record<Reason, IconName> = {
  expensive: 'trending-down',
  'too-much': 'box',
  'not-working': 'alert-triangle',
  break: 'pause',
  'dont-need': 'minus',
  other: 'info',
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
  const [outcome, setOutcome] = useState<{
    settlement: number
    paid: boolean
    scheduledFor: number | null
    /** The statutory return: what is coming back, and where to send the goods. */
    returning?: { refundDue: number; reference: string; returnBy: string } | null
  } | null>(null)

  useEffect(() => {
    if (step !== 'cancel' || quote) return
    let live = true
    fetch('/api/hub/subscription/cancel')
      .then((r) => r.json())
      .then((d) => { if (live) d.quote ? setQuote(d.quote) : setQuoteError(d.error ?? 'Could not work out your balance.') })
      .catch(() => { if (live) setQuoteError('Could not work out your balance.') })
    return () => { live = false }
  }, [step, quote])

  async function submitExit(mode: 'now' | 'scheduled' | 'return') {
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
        returning: data.returnRequested
          ? { refundDue: data.refundDue ?? 0, reference: data.reference, returnBy: data.returnBy }
          : null,
      })
      setStep('done')
      onExited()
    } catch {
      setQuoteError('That did not go through. Nothing has changed.')
    } finally {
      setSubmitting(false)
    }
  }

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
      <Card variant="tone" tone={tone} padding="tight">
        <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>{title}</p>
        <div className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed">{body}</div>
        <Button variant="tone" tone={tone} onClick={onClick} className="mt-3">{cta}</Button>
      </Card>
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

  return (
    <Sheet onClose={onClose}>
      <SheetHeader eyebrow="Your subscription" title={heading} />

      <SheetBody className="space-y-3">
        {/* Step 1: reason */}
        {step === 'reason' && (
          <>
            <p className="text-xs text-[var(--color-muted)] mb-1">What’s prompting this? We’ll see if there’s a better option than cancelling.</p>
            {REASONS.map((r) => (
              <OptionRow
                key={r.id}
                label={r.label}
                icon={REASON_ICON[r.id]}
                navigates
                onClick={() => { setReason(r.id); setStep(r.id === 'break' ? 'snooze' : 'save') }}
              />
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
              <Card variant="tone" tone={AMBER} padding="tight">
                <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Let’s fix what’s not landing</p>
                <p className="text-xs text-[var(--color-text-2)] mt-1 leading-relaxed">Before you drop everything, swap the {reviewItems.length === 1 ? 'one product' : 'products'} that hasn’t worked for you:</p>
                <div className="mt-3 space-y-2">
                  {reviewItems.map((r) => (
                    <OptionRow
                      key={r.lineId}
                      label={r.productTitle}
                      icon="swap"
                      navigates
                      onClick={() => { onSwap(r.lineId); onClose() }}
                    />
                  ))}
                </div>
              </Card>
            ) : (
              <Primary tone={ACCENT} title="Most of your stack is still settling in" body={<>Some products (like vitamins and omega-3) work quietly over weeks. Snooze if you need to, rather than stopping before they’ve had a fair go.</>} cta="Snooze instead" onClick={() => setStep('snooze')} />
            ))}

            {(reason === 'dont-need' || reason === 'other') && (
              <p className="text-xs text-[var(--color-text-2)] leading-relaxed">No problem. If it’s temporary, a snooze keeps everything in place — otherwise you can cancel below.</p>
            )}

            {/* Universal snooze offer (except where it's already the primary) */}
            {reason !== 'not-working' && <SnoozeOption />}

            {/* Honest exit */}
            <Button variant="ghost" onClick={() => setStep('cancel')} className="underline">
              No thanks — cancel my subscription
            </Button>
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
                  <button
                    key={m}
                    type="button"
                    onClick={() => { onSnooze(m); onClose() }}
                    className="rounded-2xl p-4 text-center transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2"
                    style={{ background: GLASS.surface, border: `1px solid ${GLASS.hairline}`, ['--tw-ring-color' as string]: tint(ACCENT, 45) }}
                  >
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
              <Note icon="alert-triangle" color={AMBER} live>{quoteError}</Note>
            )}

            {quote && (
              <>
                <p className="text-sm text-[var(--color-text-2)] leading-relaxed">
                  You can cancel now — there’s no minimum term and no cancellation fee{reasonLabel ? `. You said “${reasonLabel.toLowerCase()}”` : ''}.
                </p>

                {/* ── Inside the statutory 14 days: a real choice ──────────
                    The Consumer Contracts Regulations give a new member a right
                    the rest of the year does not — send it back and have their
                    money returned. This flow used to offer only the keep half
                    and describe the return in a sentence nobody could act on, so
                    the option the law is actually about was never on the screen.
                    Both halves are priced, because "keep £64 of product and pay
                    nothing" against "send it back for £41.74" is a decision, and
                    it is not obvious which way it goes. */}
                {quote.coolingOff && (
                  <>
                    <Card variant="tone" tone={ACCENT} padding="tight">
                      <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                        You&apos;re still inside your 14 days
                      </p>
                      <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">
                        Until {new Date(quote.coolingOff.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} you
                        can send everything back for a full refund. Or keep it and settle the balance on what
                        we&apos;ve already sent — whichever suits you.
                      </p>
                    </Card>

                    <Card variant="tone" tone={GREEN} padding="tight">
                      <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                        {quote.coolingOff.keepSettlement > 0
                          ? `Keep what you've got · settle ${formatGBP(quote.coolingOff.keepSettlement)}`
                          : 'Keep what you’ve got · nothing to pay'}
                      </p>
                      <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">
                        {quote.coolingOff.keepValue <= 0
                          ? 'Nothing has shipped yet, so there is nothing to send back and nothing to pay.'
                          : quote.coolingOff.keepSettlement > 0
                            // The whole basis on which this is chargeable is that
                            // it is a debt for goods, not a fee for leaving — so
                            // the sentence has to show the two figures it comes
                            // from rather than announce a number.
                            ? `We've sent you ${formatGBP(quote.coolingOff.keepValue)} of product and you've paid ${formatGBP(quote.coolingOff.returnRefund)}, because your monthly spreads the longer-lasting items over the months they last. Keep everything and this settles the difference — ${formatGBP(quote.coolingOff.keepSettlement)} — and nothing else.`
                            : `The ${formatGBP(quote.coolingOff.keepValue)} of product already sent to you is yours to keep, and your payments have covered it — there is nothing further to pay.`}
                      </p>
                      <Button variant="tone" tone={GREEN} onClick={() => submitExit('now')} disabled={submitting} className="mt-3">
                        {submitting
                          ? 'One moment…'
                          : quote.coolingOff.keepSettlement > 0
                            ? `Keep it — pay ${formatGBP(quote.coolingOff.keepSettlement)}`
                            : 'Cancel and keep it'}
                      </Button>
                    </Card>

                    {quote.coolingOff.returnRefund > 0 && (
                      <Card variant="tone" tone={ACCENT} padding="tight">
                        <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                          Send it back · up to {formatGBP(quote.coolingOff.returnRefund)} refunded
                        </p>
                        <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">
                          Post it back and we&apos;ll refund what you paid for everything that comes back{' '}
                          <strong>unopened</strong> — up to {formatGBP(quote.coolingOff.returnRefund)}, if the whole box returns — to
                          the card you paid with, as soon as it reaches us. We&apos;ll email you the address and what to put in the box.
                        </p>
                        {/* Said here rather than discovered when a smaller refund
                            lands. It is in the Terms, it is the reason the figure
                            above is a ceiling, and someone deciding between two
                            options needs it before they decide, not after. */}
                        <p className="text-xs text-[var(--color-text-2)] mt-2 leading-relaxed">
                          Supplements you&apos;ve already opened can&apos;t be refunded — food hygiene rules — unless
                          they arrived faulty or damaged, in which case tell us and we&apos;ll refund them and cover
                          the postage. Return postage is otherwise yours.
                        </p>
                        <Button variant="tone" tone={ACCENT} onClick={() => submitExit('return')} disabled={submitting} className="mt-3">
                          {submitting ? 'One moment…' : 'Cancel and send it back'}
                        </Button>
                      </Card>
                    )}
                  </>
                )}

                {/* Nothing to pay, and why. A waiver is a promise being kept,
                    so it says which promise rather than just showing £0.00.
                    Suppressed inside the window, where the two cards above have
                    already said it with more to act on. */}
                {quote.waiver && !quote.coolingOff && (
                  <Card variant="tone" tone={GREEN} padding="tight">
                    <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Nothing to pay</p>
                    <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">{quote.waiver.explanation}</p>
                  </Card>
                )}

                {!quote.waiver && settlement > 0 && (
                  <Card variant="tone" tone={AMBER} padding="tight">
                    <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                      One last payment: {formatGBP(settlement)}
                    </p>
                    <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">
                      Your monthly is a smoothed average, so longer-lasting items are spread over the months they last. You’ve had more product than your payments have covered so far — this settles that difference, and nothing else. Everything already sent to you is yours to keep.
                    </p>
                  </Card>
                )}

                {quote.overpayment > 0 && (
                  <Card variant="tone" tone={GREEN} padding="tight">
                    <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                      We owe you {formatGBP(quote.overpayment)}
                    </p>
                    <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">
                      You’ve paid for more than we’ve sent. We’ll refund the difference to your card.
                    </p>
                  </Card>
                )}

                {quote.statement && <ExitStatementView statement={quote.statement} />}

                {/* The alternative. The balance is a sawtooth, so there is
                    almost always a near month where leaving is free — and
                    saying so turns a bill into a choice. */}
                {quote.freeExitMonth != null && (
                  <Card variant="tone" tone={ACCENT} padding="tight">
                    <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                      Or leave free in {monthsAway(quote.freeExitMonth, sub.monthsActive)}
                    </p>
                    <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">
                      Nothing changes in the meantime — your boxes still arrive and your payments carry on, which is what clears the balance. Then your plan ends by itself with nothing to pay.
                    </p>
                    <Button variant="primary" onClick={() => submitExit('scheduled')} disabled={submitting} className="mt-3">
                      {submitting ? 'One moment…' : 'End it free on that date'}
                    </Button>
                  </Card>
                )}

                {/* The plain exit. Inside the 14 days the two cards above are
                    the choice, and a third unlabelled "cancel" underneath them
                    would only be a way to pick one by accident. */}
                {!quote.coolingOff && (
                  <Button variant="danger" onClick={() => submitExit('now')} disabled={submitting} className="mt-2">
                    {submitting ? 'One moment…' : settlement > 0 ? `Confirm — pay ${formatGBP(settlement)} and cancel` : 'Confirm cancellation'}
                  </Button>
                )}
              </>
            )}

            <Button variant="primary" onClick={onClose}>Keep my subscription</Button>
            <Button variant="secondary" icon="pause" onClick={() => setStep('snooze')}>
              Snooze instead — nothing to settle
            </Button>
          </>
        )}

        {/* Step: done */}
        {step === 'done' && outcome && (
          <>
            {outcome.returning ? (
              <Card variant="tone" tone={ACCENT} padding="tight">
                <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                  Your subscription has ended — send it back for up to {formatGBP(outcome.returning.refundDue)}
                </p>
                <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">
                  We&apos;ve emailed you the return address. Put <strong>{outcome.returning.reference}</strong> in
                  with the parcel so we can match it to your account, and post it by{' '}
                  {new Date(outcome.returning.returnBy).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} — keep
                  your proof of postage. We&apos;ll refund what you paid for everything that comes back unopened, to the
                  card you paid with, as soon as it reaches us — and tell you the exact figure when we do.
                </p>
                <p className="text-xs text-[var(--color-text-2)] mt-2 leading-relaxed">
                  Nothing further will be billed, whether you post it or change your mind and keep it.
                </p>
              </Card>
            ) : outcome.scheduledFor != null ? (
              <Card variant="tone" tone={ACCENT} padding="tight">
                <p className="text-sm font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
                  Your plan ends in {monthsAway(outcome.scheduledFor, sub.monthsActive)}
                </p>
                <p className="text-xs text-[var(--color-text-2)] mt-1.5 leading-relaxed">
                  Nothing to pay. Everything carries on as normal until then, and you can change your mind any time from your plan.
                </p>
              </Card>
            ) : (
              <Card variant="tone" tone={GREEN} padding="tight">
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
              </Card>
            )}
            <p className="text-xs text-[var(--color-muted)] leading-relaxed">
              Thanks for giving us a go. Your account stays open — you can start a new plan whenever you like.
            </p>
            <Button variant="primary" size="lg" onClick={onClose}>Done</Button>
          </>
        )}
      </SheetBody>
    </Sheet>
  )
}
