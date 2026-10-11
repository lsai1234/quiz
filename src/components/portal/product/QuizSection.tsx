'use client'

import { useEffect, useState } from 'react'
import { Button, Checkbox, Input, Note, Select } from '@/components/system'
import {
  AS_NEEDED_TRIGGERS,
  EFFECT_ONSETS,
  SAFETY_FLAGS,
  SLOT_LABELS,
  STACK_SLOTS,
  SWAP_GROUPS,
  type CatalogueProduct,
  type StackSlot,
} from '@/lib/catalogue/types'
import { ALL_GOALS, type Goal } from '@/lib/types'
import { GOAL_LABELS } from '@/lib/quiz-goals'
import { liveServings } from '@/lib/catalogue/servings'
import { masterVariant } from '@/lib/catalogue/master'
import { labelsOf } from '@/lib/catalogue/line-variant'
import { Outcome, ReviewMark, Section, EYEBROW, META, errorText, postProduct, useDraft, type Payload } from './shared'

const CADENCE_LABEL = { daily: 'Every day', 'per-workout': 'On training days', 'as-needed': 'When needed' } as const
const TRIGGER_LABEL = { sweat: 'Sweating', sleep: 'Sleep', stress: 'Stress', immunity: 'Feeling run down', digestion: 'Digestion' } as const
const ANCHOR_LABEL = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
  'pre-workout': 'Before training',
  'post-workout': 'After training',
  'hot-days': 'Hot days',
  'wind-down': 'Winding down',
  'run-down': 'When run down',
} as const
const ONSET_LABEL = { immediate: 'Straight away', short: 'Within 1–3 weeks', long: 'After 6–12 weeks', none: 'Never consciously felt' } as const
const FLAG_LABEL = { pregnancy: 'Pregnant or breastfeeding', medication: 'On prescription medication', shellfish: 'Shellfish allergy' } as const

function seedFor(p: CatalogueProduct) {
  const plan = p.consumption
  return {
    stackSlots: p.stackSlots,
    goals: p.goals,
    swapGroup: p.swapGroup as string,
    subscriptionEligible: p.subscriptionEligible,
    cadence: (plan?.cadence ?? '') as string,
    daysPerWeek: String(plan?.daysPerWeek ?? 7),
    trigger: (plan?.asNeededTrigger ?? '') as string,
    anchor: (plan?.anchor ?? '') as string,
    // Blank = follows the master SKU's servings; a number = the founder's own.
    planServings: plan && plan.servingsPerUnit !== liveServings(p) ? String(plan.servingsPerUnit) : '',
    subscriptionProductId: p.subscriptionProductId ?? '',
    isSubscriptionOnly: p.isSubscriptionOnly ?? false,
    minSubscriptionMonths: p.minSubscriptionMonths != null ? String(p.minSubscriptionMonths) : '',
    recommendationBasis: (p.recommendationBasis ?? '') as string,
    effectOnset: (p.effectOnset ?? '') as string,
    recommendationPriority: String(p.recommendationPriority),
    marginPriority: String(p.marginPriority),
    isCoreEligible: p.isCoreEligible,
    isBoosterEligible: p.isBoosterEligible,
    contraindications: (p.contraindications ?? []) as string[],
    actives: (p.actives ?? []).map((a) => ({ name: a.name, mg: a.mg != null ? String(a.mg) : '' })),
  }
}

const CONSUMPTION_KEYS = ['cadence', 'daysPerWeek', 'trigger', 'anchor', 'planServings']

/**
 * Quiz & subscription — who the quiz recommends this to, and how a monthly plan
 * of it is sized.
 *
 * Servings are NOT edited here. The shelf's serving count is each SKU's own,
 * set under Flavours & sizes; this section says, read-only, which number the
 * shelf shows and which one sizes a plan, and lets the plan's be overridden on
 * purpose (a half-scoop dose, say). Two editable servings boxes on one page was
 * how a founder could set one, see the other, and believe neither.
 */
export function QuizSection({
  payload,
  onPayload,
  onDirty,
}: {
  payload: Payload
  onPayload: (p: Payload) => void
  onDirty: (section: string, dirty: boolean) => void
}) {
  const { product } = payload
  const { draft, set, setDraft, changed, reset } = useDraft(seedFor(product))
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const [suggested, setSuggested] = useState<string[]>([])
  const [others, setOthers] = useState<Array<{ id: string; title: string }> | null>(null)

  useEffect(() => onDirty('Quiz & subscription', changed.length > 0), [changed.length, onDirty])

  // The refill picker offers the WHOLE catalogue — the old editor only offered
  // whatever list it was opened from, so from Top 25 a refill could only be one
  // of those 25.
  useEffect(() => {
    if (!advanced || others) return
    fetch('/api/portal/products?all=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setOthers(
          (d?.products ?? [])
            .filter((e: { state: string; product: { id: string } }) => e.state !== 'removed' && e.product.id !== product.id)
            .map((e: { product: { id: string; title: string } }) => ({ id: e.product.id, title: e.product.title })),
        ),
      )
      .catch(() => setOthers([]))
  }, [advanced, others, product.id])

  async function send(body: Record<string, unknown>, label: string, success: string) {
    setBusy(label)
    setDone(null)
    setError(null)
    const result = await postProduct('/api/portal/products', { id: product.id, ...body })
    setBusy(null)
    if (!result.ok) {
      setError(errorText(result))
      return
    }
    setSuggested([])
    onPayload(result.payload)
    setDone(success)
  }

  function save() {
    const fields: Record<string, unknown> = {}
    for (const key of changed) {
      if (CONSUMPTION_KEYS.includes(key)) continue
      const value = draft[key]
      if (key === 'minSubscriptionMonths') fields[key] = value === '' ? null : Number(value)
      else if (key === 'recommendationBasis' || key === 'effectOnset' || key === 'subscriptionProductId') fields[key] = value === '' ? null : value
      else if (key === 'recommendationPriority' || key === 'marginPriority') fields[key] = Number(value)
      else if (key === 'actives') {
        fields.actives = draft.actives
          .filter((a) => a.name.trim())
          .map((a) => (a.mg.trim() ? { name: a.name.trim(), mg: Number(a.mg) } : { name: a.name.trim() }))
      } else fields[key] = value
    }
    if (changed.some((k) => CONSUMPTION_KEYS.includes(k))) {
      // "Auto" really clears it: the plan is then worked out from the stack
      // slot and the master's servings, which is what Auto has always meant.
      if (!draft.cadence) fields.consumption = null
      else {
        const servings = draft.planServings.trim() ? Number(draft.planServings) : liveServings(product)
        fields.consumption = {
          cadence: draft.cadence,
          servingsPerUnit: servings,
          ...(draft.cadence === 'daily' && Number(draft.daysPerWeek) !== 7 ? { daysPerWeek: Number(draft.daysPerWeek) } : {}),
          ...(draft.cadence === 'as-needed' && draft.trigger ? { asNeededTrigger: draft.trigger } : {}),
          ...(draft.anchor ? { anchor: draft.anchor } : {}),
        }
      }
    }
    void send({ set: fields }, 'save', 'Saved — the quiz uses it from the next recommendation.')
  }

  /**
   * Suggest, for a product on sale: the model's answers fill only the BLANK
   * fields of this form, marked as suggestions, and nothing reaches the shop
   * until Save. (For one waiting for review, "Fill the blanks" writes them
   * straight to the product as unconfirmed — the review then checks them.)
   */
  async function suggest() {
    setBusy('suggest')
    setDone(null)
    setError(null)
    try {
      const res = await fetch('/api/portal/ai-classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [product.id], apply: false }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        setError(data?.error ?? `The suggestion failed (HTTP ${res.status}).`)
        return
      }
      const patch = (data.results?.[0]?.patch ?? {}) as Partial<CatalogueProduct>
      const filled: string[] = []
      setDraft((d) => {
        const next = { ...d }
        if (patch.stackSlots?.length && d.stackSlots.length === 0) { next.stackSlots = patch.stackSlots; filled.push('stack slots') }
        if (patch.goals?.length && d.goals.length === 0) { next.goals = patch.goals; filled.push('goals') }
        if (patch.swapGroup && (d.swapGroup === 'general' || !d.swapGroup)) { next.swapGroup = patch.swapGroup; filled.push('swap group') }
        return next
      })
      setSuggested(filled)
      if (filled.length === 0) setDone('Nothing to suggest — every field it can answer is already filled in.')
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(null)
    }
  }

  const confirm = (field: string) => void send({ confirm: [field] }, `confirm:${field}`, 'Checked.')
  const mark = (field: string) => <ReviewMark field={field} payload={payload} onConfirm={confirm} busy={busy === `confirm:${field}`} />

  const master = masterVariant(product)
  const shelf = liveServings(product)
  const plan = draft.planServings.trim() ? Number(draft.planServings) : shelf

  return (
    <Section
      id="quiz"
      title="Quiz & subscription"
      summary="Who the quiz recommends it to, what it can swap with, and how a monthly plan of it is sized."
      tone={payload.remaining.some((k) => ['stackSlots', 'goals', 'swapGroup'].includes(k)) ? 'attention' : undefined}
    >
      <fieldset className="space-y-2">
        <legend style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>Stack slots</legend>
        <p style={META}>The jobs it can do in a stack. This decides who gets recommended it.</p>
        <div className="flex flex-wrap gap-3">
          {STACK_SLOTS.map((slot) => (
            <Checkbox
              key={slot}
              label={SLOT_LABELS[slot]}
              checked={draft.stackSlots.includes(slot)}
              onChange={(e) => set('stackSlots', e.target.checked ? [...draft.stackSlots, slot] : draft.stackSlots.filter((s: StackSlot) => s !== slot))}
            />
          ))}
        </div>
        {mark('stackSlots')}
      </fieldset>

      <fieldset className="space-y-2">
        <legend style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>Goals</legend>
        <div className="flex flex-wrap gap-3">
          {ALL_GOALS.map((goal) => (
            <Checkbox
              key={goal}
              label={GOAL_LABELS[goal] ?? goal}
              checked={draft.goals.includes(goal)}
              onChange={(e) => set('goals', e.target.checked ? [...draft.goals, goal] : draft.goals.filter((g: Goal) => g !== goal))}
            />
          ))}
        </div>
        {mark('goals')}
      </fieldset>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))' }}>
        <div className="space-y-1">
          <Select label="Swap group" value={draft.swapGroup} onChange={(e) => set('swapGroup', e.target.value)} hint="What it can be swapped for in a stack. “General” means nothing — and no alternatives.">
            {SWAP_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          {mark('swapGroup')}
        </div>
        <div className="space-y-1" style={{ paddingTop: 'var(--space-5)' }}>
          <Checkbox label="Can be a monthly subscription" checked={draft.subscriptionEligible} onChange={(e) => set('subscriptionEligible', e.target.checked)} />
        </div>
      </div>

      <div className="space-y-2">
        <p style={EYEBROW}>How it is taken</p>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}>
          <Select label="Taken" value={draft.cadence} onChange={(e) => set('cadence', e.target.value)} hint="Auto works it out from the stack slot.">
            <option value="">Auto</option>
            {(Object.keys(CADENCE_LABEL) as Array<keyof typeof CADENCE_LABEL>).map((c) => (
              <option key={c} value={c}>
                {CADENCE_LABEL[c]}
              </option>
            ))}
          </Select>
          {draft.cadence === 'daily' && (
            <Select label="Days a week" value={draft.daysPerWeek} onChange={(e) => set('daysPerWeek', e.target.value)}>
              {[7, 6, 5, 4, 3, 2, 1].map((d) => (
                <option key={d} value={String(d)}>
                  {d === 7 ? 'Every day' : `${d} days`}
                </option>
              ))}
            </Select>
          )}
          {draft.cadence === 'as-needed' && (
            <Select label="Needed when" value={draft.trigger} onChange={(e) => set('trigger', e.target.value)}>
              <option value="">Not set</option>
              {AS_NEEDED_TRIGGERS.map((t) => (
                <option key={t} value={t}>
                  {TRIGGER_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
          {draft.cadence && (
            <Select label="Best taken" value={draft.anchor} onChange={(e) => set('anchor', e.target.value)}>
              <option value="">Any time</option>
              {(Object.keys(ANCHOR_LABEL) as Array<keyof typeof ANCHOR_LABEL>).map((a) => (
                <option key={a} value={a}>
                  {ANCHOR_LABEL[a]}
                </option>
              ))}
            </Select>
          )}
        </div>
        <p style={META}>
          The shelf shows {shelf} servings — the master SKU{master ? ` (${labelsOf(master)[0]})` : ''}’s own count; change it under
          Flavours & sizes. A monthly plan is sized on {plan} servings
          {draft.planServings.trim() ? ', your own number below.' : ', following the master.'}
        </p>
      </div>

      <div className="space-y-1">
        <Button size="sm" variant="ghost" aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)}>
          {advanced ? 'Hide' : 'Show'} the finer settings
        </Button>
      </div>
      <div hidden={!advanced} className="space-y-3">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))' }}>
          <Input
            label="Servings a plan is sized on"
            inputMode="decimal"
            value={draft.planServings}
            onChange={(e) => set('planServings', e.target.value)}
            hint={`Blank follows the master (${shelf}). Set it when a dose is not one scoop.`}
          />
          <Select
            label="Monthly refill product"
            value={draft.subscriptionProductId}
            onChange={(e) => set('subscriptionProductId', e.target.value)}
            hint="Shipped instead when this lasts longer than a month."
          >
            <option value="">None — subscribes as itself</option>
            {(others ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
            {draft.subscriptionProductId && !(others ?? []).some((o) => o.id === draft.subscriptionProductId) && (
              <option value={draft.subscriptionProductId}>{draft.subscriptionProductId}</option>
            )}
          </Select>
          <Input
            label="Minimum term (months)"
            inputMode="numeric"
            value={draft.minSubscriptionMonths}
            onChange={(e) => set('minSubscriptionMonths', e.target.value)}
            hint="Blank uses the shop-wide default."
          />
          <Select label="Keep-or-change advice" value={draft.recommendationBasis} onChange={(e) => set('recommendationBasis', e.target.value)} hint="Whether how it feels should decide a change.">
            <option value="">Auto</option>
            <option value="objective">By need — not felt (protein, vitamins)</option>
            <option value="subjective">By feel (sleep, energy)</option>
          </Select>
          <Select label="When it is felt" value={draft.effectOnset} onChange={(e) => set('effectOnset', e.target.value)}>
            <option value="">Auto</option>
            {EFFECT_ONSETS.map((o) => (
              <option key={o} value={o}>
                {ONSET_LABEL[o]}
              </option>
            ))}
          </Select>
          <Input label="Recommendation priority (1–10)" inputMode="numeric" value={draft.recommendationPriority} onChange={(e) => set('recommendationPriority', e.target.value)} />
          <Input label="Margin priority (1–10)" inputMode="numeric" value={draft.marginPriority} onChange={(e) => set('marginPriority', e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Checkbox label="Hidden refill product (only ever shipped as another’s refill)" checked={draft.isSubscriptionOnly} onChange={(e) => set('isSubscriptionOnly', e.target.checked)} />
          <Checkbox label="Can be in the core stack" checked={draft.isCoreEligible} onChange={(e) => set('isCoreEligible', e.target.checked)} />
          <Checkbox label="Can be suggested as an add-on" checked={draft.isBoosterEligible} onChange={(e) => set('isBoosterEligible', e.target.checked)} />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>Not for</legend>
        <p style={META}>The quiz never recommends it to anyone who ticks these on the safety questions.</p>
        <div className="flex flex-wrap gap-3">
          {SAFETY_FLAGS.map((flag) => (
            <Checkbox
              key={flag}
              label={FLAG_LABEL[flag]}
              checked={draft.contraindications.includes(flag)}
              onChange={(e) =>
                set('contraindications', e.target.checked ? [...draft.contraindications, flag] : draft.contraindications.filter((f) => f !== flag))
              }
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>Active ingredients</legend>
        <p style={META}>Per serving. Names should match across products — they are how a stack avoids doubling a dose.</p>
        {draft.actives.map((a, i) => (
          <div key={i} className="flex items-end flex-wrap gap-2">
            <Input
              label={`Ingredient ${i + 1}`}
              compact
              className="flex-1 min-w-0"
              value={a.name}
              onChange={(e) => set('actives', draft.actives.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <Input
              label={`Ingredient ${i + 1} mg`}
              compact
              align="right"
              suffix="mg"
              inputMode="decimal"
              value={a.mg}
              onChange={(e) => set('actives', draft.actives.map((x, j) => (j === i ? { ...x, mg: e.target.value } : x)))}
            />
            <Button size="sm" variant="ghost" aria-label={`Remove ingredient ${i + 1}`} onClick={() => set('actives', draft.actives.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => set('actives', [...draft.actives, { name: '', mg: '' }])}>
          Add an ingredient
        </Button>
      </fieldset>

      {suggested.length > 0 && (
        <Note tone="info" live="polite">
          Suggested, not saved: {suggested.join(', ')}. Check them, then Save.
        </Note>
      )}

      <div className="flex items-center flex-wrap gap-2">
        <Button variant="primary" size="sm" loading={busy === 'save'} disabled={changed.length === 0 || busy !== null} onClick={save}>
          {changed.length === 0 ? 'Saved' : `Save ${changed.length} change${changed.length === 1 ? '' : 's'}`}
        </Button>
        {changed.length > 0 && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Undo changes
          </Button>
        )}
        {payload.state === 'pending' ? (
          <Button
            variant="secondary"
            size="sm"
            loading={busy === 'fill'}
            onClick={() => void send({ action: 'fill-blanks' }, 'fill', 'Filled what was blank. Each is marked as written by the model — check it.')}
          >
            Fill the blanks with AI
          </Button>
        ) : (
          <Button variant="secondary" size="sm" loading={busy === 'suggest'} onClick={() => void suggest()}>
            Suggest tags
          </Button>
        )}
      </div>
      <Outcome done={done} error={error} />
    </Section>
  )
}


