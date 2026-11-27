'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Modal, ModalBody, ModalHeader, Note, Segmented } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import { formatGBP, USAGE_LEVELS, type UsageLevel } from '@/lib/stack-blueprint/pricing'
import { computeRemoveImpact, lineMonthly, MAX_LINE_UNITS, setLineChoice, type LineChoice } from '@/lib/recharge/mock'
import { routineRhythmFor, rhythmFor, servingsPerTime, usageWords } from '@/lib/recharge/routine'
import { planRateChange, ratePct, withPlanRate } from '@/lib/recharge/plan-rate'
import { upcomingBoxesForLine } from '@/lib/recharge/schedule'
import { boxDateLabel, everyLabel, lastsLabel, rhythmLabel, supplyFit, supplyFitSentence } from '@/lib/hub/line-facts'
import { usePricingConfig } from '@/hooks/usePricingConfig'
import { policyForLine } from '@/lib/changes/policy'
import { constraintsFor, describeConstraints } from '@/lib/changes/safety'
import { ChangePolicyChoice } from '@/components/subscription/ChangePolicyChoice'
import { BillingImpact } from './BillingImpact'
import type { ChangePolicy, MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * One product on a plan, and everything a member does with it, in one sheet:
 * how often it comes and how many, one in the next box, skipping the next one,
 * what happens if it's out of stock, and taking it off.
 *
 * The same sheet whichever way the plan started. It used to offer "how much do
 * you get through?" (a little, as recommended, a lot), which meant nothing for a
 * shop basket and hid the answer people want, which is how often it comes; and a
 * "Get one now" that showed a charge and then only closed. Every action here does
 * what it says: changes go through the review screen and the server, the extra
 * goes in the box and on its payment (`/api/hub/next-box`), and a skipped product
 * comes out of its box (`skipNextDelivery`).
 */

interface Props {
  subscription: MemberSubscription
  line: MemberSubscriptionLine
  product?: CatalogueProduct
  /** The catalogue, for the plan saving a change could move. */
  catalogue?: CatalogueProduct[]
  /** Review a new choice (the dashboard raises the confirmation). */
  onReviewChoice: (choice: LineChoice) => void
  /** Open "Your routine", which every rhythm is worked out from. */
  onOpenRoutine?: () => void
  onSkip: () => void
  /** Put one in the next box, on that box's payment. */
  onAddToNextBox: () => Promise<{ ok: boolean; message: string }>
  onRemove: () => void
  /** What to do with this line if its product becomes unavailable. */
  onSetChangePolicy?: (policy: ChangePolicy) => void
  onClose: () => void
}

/** "½ scoop", "1 scoop", "1½ scoops": an amount to choose. */
function servingsLabel(n: number, product: CatalogueProduct): string {
  const quarters = Math.max(1, Math.round(n * 4))
  const whole = Math.floor(quarters / 4)
  const part = ['', '¼', '½', '¾'][quarters % 4]
  const powder = (product.formats ?? []).some((f) => f.toLowerCase().includes('powder'))
  const noun = powder ? 'scoop' : 'serving'
  return `${whole === 0 ? part : `${whole}${part}`} ${n > 1 ? `${noun}s` : noun}`
}

/** What the server says one more in the next box costs, or why it can't go in. */
type Quote = { price: number; date: string } | { refusal: string } | null

const heading = { fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' } as const
const body = { fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-2)' } as const
const meta = { fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-snug)', color: 'var(--ink-3)' } as const

export function LineManageSheet({ subscription, line, product, catalogue = [], onReviewChoice, onOpenRoutine, onSkip, onAddToNextBox, onRemove, onSetChangePolicy, onClose }: Props) {
  const config = usePricingConfig()
  const maxEvery = Math.max(1, config.maxDeliveryMonths)
  const startUsage: UsageLevel = line.usageLevel ?? 'standard'
  const follows = line.rhythm !== 'chosen'
  const [usage, setUsage] = useState<UsageLevel>(startUsage)
  const [quantity, setQuantity] = useState(line.quantity)
  // 'routine' is "when you'd run out", whatever that works out at; a number is a rhythm they chose.
  const [choice, setChoice] = useState<'routine' | number>(follows ? 'routine' : Math.min(maxEvery, Math.max(1, Math.round(line.deliveryIntervalMonths))))
  const [refining, setRefining] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [quote, setQuote] = useState<Quote>(null)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<{ ok: boolean; message: string } | null>(null)

  const active = subscription.status === 'active'
  // How long one lasts at the usage chosen, from the plan's routine.
  const sized = product ? routineRhythmFor(line, product, subscription.routine, usage, config) : null
  const lastsMonths = sized?.lastsMonths ?? line.lastsMonths
  // The routine's rhythm for this many at a time: about when they'd run out.
  const routineEvery = lastsMonths ? rhythmFor(lastsMonths, quantity, config) : line.deliveryIntervalMonths
  const fractional = !Number.isInteger(routineEvery)
  const every = choice === 'routine' ? routineEvery : choice
  const followsNow = choice === 'routine' || (!fractional && choice === routineEvery)
  const pending: LineChoice = { usageLevel: usage, quantity, every, follows: followsNow, lastsMonths }
  const changed =
    usage !== startUsage ||
    quantity !== line.quantity ||
    Math.abs(every - line.deliveryIntervalMonths) > 0.001 ||
    followsNow !== follows
  // The pending choice, priced and timed the way it will be once confirmed, the plan saving included.
  const preview = useMemo(
    () => (changed ? withPlanRate(subscription, setLineChoice(subscription, line.id, pending, config), catalogue, config) : subscription),
    // `pending` is rebuilt every render from the values listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [changed, subscription, line.id, usage, quantity, every, followsNow, lastsMonths, catalogue, config],
  )
  const rateMove = changed ? planRateChange(subscription, setLineChoice(subscription, line.id, pending, config), catalogue, config) : null
  const previewLine = preview.lines.find((l) => l.id === line.id) ?? line
  const [next, following] = useMemo(() => (active ? upcomingBoxesForLine(subscription, line.id, 2) : []), [active, subscription, line.id])
  const [previewNext] = useMemo(() => (active ? upcomingBoxesForLine(preview, line.id, 1) : []), [active, preview, line.id])
  const lasts = lastsLabel(lastsMonths)
  const fit = supplyFit(lastsMonths, quantity, every)
  const removeImpact = computeRemoveImpact(subscription, line.id, catalogue)
  const constraintsLabel = describeConstraints(constraintsFor(subscription))
  const everyOptions = [
    ...(fractional ? [{ value: 'routine' as const, label: everyLabel(routineEvery).replace(/^./, (c) => c.toUpperCase()), sub: 'When you’d run out' }] : []),
    ...Array.from({ length: maxEvery }, (_, i) => i + 1).map((m) => ({
      value: m,
      label: m === 1 ? 'Every month' : `Every ${m} months`,
      ...(!fractional && m === routineEvery ? { sub: 'When you’d run out' } : {}),
    })),
  ]
  const choiceValue: 'routine' | number = choice === 'routine' && !fractional ? routineEvery : choice

  /* What one more in the next box costs: asked of the server, which prices and
     places it the same way it will when it's added. */
  useEffect(() => {
    if (!active) return
    let live = true
    const params = new URLSearchParams({ productId: line.productId })
    if (line.variantId) params.set('variantId', line.variantId)
    fetch(`/api/hub/next-box?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { quote?: { price: number; box: { date: string } } | null; refusal?: { error: string } | null } | null) => {
        if (!live || !data) return
        if (data.quote) setQuote({ price: data.quote.price, date: data.quote.box.date })
        else if (data.refusal) setQuote({ refusal: data.refusal.error })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [active, line.productId, line.variantId])

  async function addOne() {
    if (adding) return
    setAdding(true)
    setAdded(null)
    const result = await onAddToNextBox()
    setAdded(result)
    setAdding(false)
  }

  const inNextBox = next != null && quote != null && 'date' in quote && next.date.slice(0, 10) === quote.date.slice(0, 10)

  return (
    <Modal onClose={onClose} presentation="sheet">
      <ModalHeader eyebrow={line.slotTitle} title={`Manage ${line.productTitle}`} />

      <ModalBody className="space-y-6">
        {/* What it is now, in the words used everywhere else. */}
        <div data-line-facts>
          <p style={{ ...body, color: 'var(--ink-1)' }}>
            {rhythmLabel(line.quantity, line.deliveryIntervalMonths).replace(/^./, (c) => c.toUpperCase())}
            {next ? (
              <>
                {' '}· next one <strong>{boxDateLabel(next.date)}</strong>
              </>
            ) : active ? (
              ' · not in a box in the next two years'
            ) : (
              ''
            )}
          </p>
          {lasts && (
            <p style={meta}>
              One lasts you {lasts}
              {product ? `: ${usageWords(product, subscription.routine, usage)}` : ''}.{' '}
              {product && (
                <Button variant="ghost" size="sm" fullWidth={false} className="underline -ml-1" aria-expanded={refining} onClick={() => setRefining((r) => !r)}>
                  {refining ? 'Done' : 'Refine'}
                </Button>
              )}
            </p>
          )}
          {/* The estimate, refined: how much they take each time, and the routine behind it. */}
          {refining && product && (
            <div style={{ marginTop: 'var(--space-3)' }} data-line-refine>
              <p style={heading}>How much you take each time</p>
              <div style={{ marginTop: 'var(--space-2)' }}>
                <Segmented
                  label="How much you take each time"
                  columns={3}
                  value={usage}
                  onChange={(v) => {
                    setUsage(v)
                    // A new usage gives a new "when you'd run out", and the routine's own count at a time.
                    const resized = routineRhythmFor(line, product, subscription.routine, v, config)
                    setQuantity(resized.quantity)
                  }}
                  options={USAGE_LEVELS.map((lvl) => ({ value: lvl, label: servingsLabel(servingsPerTime(product, subscription.routine, lvl), product) }))}
                />
              </div>
              {onOpenRoutine && (
                <p style={{ ...meta, marginTop: 'var(--space-2)' }}>
                  Training days and weight are your routine, for your whole plan.{' '}
                  <Button variant="ghost" size="sm" fullWidth={false} className="underline -ml-1" onClick={onOpenRoutine}>
                    Change your routine
                  </Button>
                </p>
              )}
            </div>
          )}
        </div>

        {/* How often and how many: the two things people change. */}
        <div data-line-rhythm>
          <p style={heading}>How often</p>
          <div style={{ marginTop: 'var(--space-2)' }}>
            <Segmented
              label="How often"
              columns={2}
              value={choiceValue}
              onChange={(v) => setChoice(v === routineEvery && !fractional ? 'routine' : v)}
              options={everyOptions}
            />
          </div>

          <div className="flex items-center justify-between" style={{ marginTop: 'var(--space-4)', gap: 'var(--space-3)' }}>
            <p style={heading} id={`qty-${line.id}`}>
              How many each time
            </p>
            <div className="flex items-center" style={{ gap: 'var(--space-2)' }} role="group" aria-labelledby={`qty-${line.id}`}>
              <Button variant="secondary" size="sm" icon="dash" aria-label="One fewer" disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))} />
              <span aria-live="polite" style={{ ...heading, minWidth: '2ch', textAlign: 'center' }} data-line-quantity>
                {quantity}
              </span>
              <Button variant="secondary" size="sm" icon="plus" aria-label="One more" disabled={quantity >= MAX_LINE_UNITS} onClick={() => setQuantity((q) => Math.min(MAX_LINE_UNITS, q + 1))} />
            </div>
          </div>

          {/* What that choice means, said once, from how long one lasts. */}
          <div aria-live="polite" style={{ marginTop: 'var(--space-3)' }}>
            {fit && (
              <p style={{ ...body, color: fit.kind === 'short' ? 'var(--tone-attention)' : 'var(--ink-2)' }} data-line-fit={fit.kind}>
                {supplyFitSentence(fit)}
              </p>
            )}
            <p style={meta}>
              {formatGBP(previewLine.pricePerDelivery)} a delivery
              {changed ? (
                <>
                  {' '}· your monthly {formatGBP(subscription.flatMonthly)} → <strong>{formatGBP(preview.flatMonthly)}</strong>
                  {previewNext ? ` · next one ${boxDateLabel(previewNext.date)}` : ''}
                  {rateMove ? ` · your plan saving ${ratePct(rateMove.from)} → ${ratePct(rateMove.to)}` : ''}
                </>
              ) : (
                ` · ${formatGBP(lineMonthly(line))} of your monthly`
              )}
            </p>
          </div>

          {/* Always there (disabled until something changes), so nothing jumps. */}
          <Button variant="primary" iconRight="arrow-right" onClick={() => onReviewChoice(pending)} disabled={!changed} className="mt-3">
            Review change
          </Button>
        </div>

        {/* The next one: sooner, or not this time. */}
        {active && (
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 'var(--space-2)' }}>
            <Card padding="tight">
              <p style={heading}>{inNextBox ? 'One more in your next box' : 'Need one sooner?'}</p>
              {quote && 'refusal' in quote ? (
                <p style={{ ...meta, marginTop: 'var(--space-1)' }}>{quote.refusal}</p>
              ) : quote && 'date' in quote ? (
                <>
                  <p style={{ ...meta, marginTop: 'var(--space-1)' }}>
                    {formatGBP(quote.price)}, added to the payment for your box on {boxDateLabel(quote.date)} and sent with it.
                    {!inNextBox && ` Your usual ones still come ${everyLabel(line.deliveryIntervalMonths)}.`}
                  </p>
                  <Button variant="secondary" size="sm" icon="plus" onClick={addOne} disabled={adding || added?.ok === true} className="mt-2">
                    {added?.ok ? 'Added' : adding ? 'Adding…' : 'Add one to your next box'}
                  </Button>
                </>
              ) : (
                <p style={{ ...meta, marginTop: 'var(--space-1)' }}>Checking your next box…</p>
              )}
              {added && (
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <Note tone={added.ok ? 'positive' : 'attention'} live="polite">
                    {added.message}
                  </Note>
                </div>
              )}
            </Card>
            {next && (
              <Card padding="tight">
                <p style={heading}>Skip the next one</p>
                <p style={{ ...meta, marginTop: 'var(--space-1)' }}>
                  It won’t come on {boxDateLabel(next.date)}, and {formatGBP(line.pricePerDelivery)} comes off your next payment.
                  {following ? ` The one after comes on ${boxDateLabel(following.date)}.` : ''}
                </p>
                <Button variant="secondary" size="sm" icon="skip-forward" onClick={onSkip} className="mt-2">
                  Skip the next one
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* What happens if this product becomes unavailable */}
        {onSetChangePolicy && (
          <div>
            <p style={heading}>If it&apos;s out of stock</p>
            <p style={{ ...meta, margin: 'var(--space-1) 0 var(--space-3)' }}>We&apos;ll sort it without holding up your box, and email you either way.</p>
            <ChangePolicyChoice
              policy={policyForLine(subscription, line)}
              onChange={onSetChangePolicy}
              monthly={subscription.flatMonthly}
              removesMonthly={lineMonthly(line)}
              constraintsLabel={constraintsLabel}
              variant="compact"
            />
          </div>
        )}

        {/* Remove */}
        <div>
          {!confirmRemove ? (
            <Button variant="ghost" icon="trash" onClick={() => setConfirmRemove(true)}>
              Remove from your plan
            </Button>
          ) : (
            <div
              className="rounded-2xl border p-4 space-y-3"
              style={{ borderColor: 'color-mix(in srgb, var(--tone-attention) 40%, transparent)', background: 'color-mix(in srgb, var(--tone-attention) 6%, transparent)' }}
            >
              <p style={heading}>Remove {line.productTitle}?</p>
              <BillingImpact
                monthlyBefore={removeImpact.currentMonthly}
                monthlyAfter={removeImpact.newMonthly}
                settlement={removeImpact.settlement}
                note={
                  removeImpact.settlement > 0.01
                    ? `A one-off settlement covers the box already sent that you haven’t finished paying for. Your monthly then drops to ${formatGBP(removeImpact.newMonthly)}.`
                    : `Nothing’s shipped yet, so there’s no charge. Your monthly drops to ${formatGBP(removeImpact.newMonthly)}.`
                }
              />
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setConfirmRemove(false)}>
                  Keep it
                </Button>
                <Button variant="destructive" size="sm" icon="trash" onClick={onRemove}>
                  Remove
                </Button>
              </div>
            </div>
          )}
        </div>

        {product == null && (
          <p style={meta} className="flex items-center gap-1">
            <Icon name="info" size={12} /> This product isn’t in the shop right now; it stays on your plan as it is.
          </p>
        )}
      </ModalBody>
    </Modal>
  )
}
