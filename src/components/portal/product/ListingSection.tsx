'use client'

import { useEffect, useState } from 'react'
import { Button, Checkbox, Input, Textarea } from '@/components/system'
import { ImageField } from '@/components/portal/ImageField'
import { DIETARY_TAGS, type DietaryTag } from '@/lib/catalogue/types'
import { Outcome, ReviewMark, Section, META, errorText, postProduct, useDraft, type Payload } from './shared'

const DIETARY_LABEL: Record<DietaryTag, string> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  'gluten-free': 'Gluten free',
  'dairy-free': 'Dairy free',
  'nut-free': 'Nut free',
  halal: 'Halal',
  'keto-friendly': 'Keto friendly',
}

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean)
const words = (text: string) => text.split(',').map((l) => l.trim()).filter(Boolean)

/**
 * Shop listing — everything a customer READS about the product.
 *
 * The product's name lives here and only here. Its flavours' names are under
 * Flavours & sizes, and the naming helpers there save straight away, so there is
 * never a second unsaved copy of the title on the page to send back over this one.
 */
export function ListingSection({
  payload,
  onPayload,
  onDirty,
}: {
  payload: Payload
  onPayload: (p: Payload) => void
  onDirty: (section: string, dirty: boolean) => void
}) {
  const { product } = payload
  const { draft, set, changed, reset } = useDraft({
    title: product.title,
    shortName: product.shortName ?? '',
    brand: product.brand ?? '',
    category: product.category,
    description: product.description,
    shortReason: product.shortReason,
    imageUrl: product.imageUrl ?? '',
    dietaryTags: product.dietaryTags,
    formats: product.formats.join(', '),
    hasStimulants: product.hasStimulants,
    warnings: product.warnings.join('\n'),
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => onDirty('Shop listing', changed.length > 0), [changed.length, onDirty])

  async function send(body: Record<string, unknown>, label: string, success: string) {
    setBusy(label)
    setDone(null)
    setError(null)
    const result = await postProduct('/api/portal/products', { id: product.id, ...body })
    setBusy(null)
    if (!result.ok) {
      setError(errorText(result))
      return false
    }
    onPayload(result.payload)
    setDone(success)
    return true
  }

  function save() {
    const fields: Record<string, unknown> = {}
    for (const key of changed) {
      if (key === 'formats') fields.formats = words(draft.formats)
      else if (key === 'warnings') fields.warnings = lines(draft.warnings)
      else if (key === 'shortName' || key === 'brand' || key === 'imageUrl') fields[key] = (draft[key] as string).trim() || null
      else fields[key] = draft[key]
    }
    void send({ set: fields }, 'save', 'Saved — the shop shows it now.')
  }

  /** Short names come from the server: the derivation and the AI pass both live there. */
  async function shortName(ai: boolean) {
    setBusy(ai ? 'ai-name' : 'derive-name')
    setDone(null)
    setError(null)
    try {
      const res = await fetch('/api/portal/product-short-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [product.id], ai }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        setError(data.error ?? `Could not write a short name (HTTP ${res.status}).`)
        return
      }
      const change = (data.changes ?? [])[0]
      if (change?.reason && !change.after) setError(`No short name written: ${change.reason}`)
      const fresh = await fetch(`/api/portal/products?id=${encodeURIComponent(product.id)}`).then((r) => r.json())
      if (fresh?.product) onPayload(fresh)
      setDone(change?.after ? `Short name: “${change.after}”.` : 'Nothing changed.')
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(null)
    }
  }

  const confirm = (field: string) => void send({ confirm: [field] }, `confirm:${field}`, 'Checked.')
  const mark = (field: string) => <ReviewMark field={field} payload={payload} onConfirm={confirm} busy={busy === `confirm:${field}`} />
  const pendingBlanks = payload.state === 'pending' && (!product.shortReason?.trim() || product.dietaryTags.length === 0 || product.formats.length === 0)

  return (
    <Section
      id="listing"
      title="Shop listing"
      summary="The name, picture and words a customer reads — on the card, the product page and every receipt."
      tone={payload.remaining.some((k) => ['title', 'imageUrl', 'description', 'category', 'shortName', 'shortReason', 'dietaryTags', 'formats', 'warnings', 'hasStimulants'].includes(k)) ? 'attention' : undefined}
    >
      <div className="space-y-1">
        <Input label="Product name" value={draft.title} onChange={(e) => set('title', e.target.value)} hint="On the card, the product page, the basket and every receipt." />
        {mark('title')}
      </div>

      <div className="space-y-1">
        <Input
          label="Short name"
          value={draft.shortName}
          onChange={(e) => set('shortName', e.target.value)}
          hint="Two or three words for tight spaces — the share poster, list rows. Blank means it is worked out from the name."
        />
        <div className="flex items-center flex-wrap gap-2">
          <Button size="sm" variant="ghost" loading={busy === 'derive-name'} onClick={() => void shortName(false)}>
            Work it out from the name
          </Button>
          <Button size="sm" variant="ghost" loading={busy === 'ai-name'} onClick={() => void shortName(true)}>
            Write it with AI
          </Button>
          {mark('shortName')}
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}>
        <Input label="Brand" value={draft.brand} onChange={(e) => set('brand', e.target.value)} hint="Shown above the name on the card." />
        <div className="space-y-1">
          <Input label="Category" value={draft.category} onChange={(e) => set('category', e.target.value)} hint="The shelf it sits on." />
          {mark('category')}
        </div>
      </div>

      <div className="space-y-1">
        <ImageField
          id={`product:${product.id}`}
          label="Picture"
          hint="The product's main photograph. Each flavour can have its own under Flavours & sizes."
          value={draft.imageUrl}
          onChange={(url) => set('imageUrl', url)}
        />
        {mark('imageUrl')}
      </div>

      <div className="space-y-1">
        <Textarea label="Description" rows={5} value={draft.description} onChange={(e) => set('description', e.target.value)} hint="On the product page. Plain text." />
        {mark('description')}
      </div>

      <div className="space-y-1">
        <Textarea
          label="Card copy"
          rows={2}
          value={draft.shortReason}
          onChange={(e) => set('shortReason', e.target.value)}
          hint="One sentence on the card. It is a claim, so keep it to what the product can honestly say."
        />
        {mark('shortReason')}
      </div>

      <fieldset className="space-y-2">
        <legend style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-1)' }}>Dietary tags</legend>
        <p style={META}>Wrong here means someone is sold something they can’t take — the shop filters and the quiz both read these.</p>
        <div className="flex flex-wrap gap-3">
          {DIETARY_TAGS.map((tag) => (
            <Checkbox
              key={tag}
              label={DIETARY_LABEL[tag]}
              checked={draft.dietaryTags.includes(tag)}
              onChange={(e) =>
                set('dietaryTags', e.target.checked ? [...draft.dietaryTags, tag] : draft.dietaryTags.filter((t) => t !== tag))
              }
            />
          ))}
        </div>
        {mark('dietaryTags')}
      </fieldset>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}>
        <div className="space-y-1">
          <Input label="Formats" value={draft.formats} onChange={(e) => set('formats', e.target.value)} hint="Comma separated: powder, capsule, liquid…" />
          {mark('formats')}
        </div>
        <div className="space-y-1">
          <Checkbox label="Contains stimulants" checked={draft.hasStimulants} onChange={(e) => set('hasStimulants', e.target.checked)} />
          <p style={META}>Kept out of stim-free stacks.</p>
          {mark('hasStimulants')}
        </div>
      </div>

      <div className="space-y-1">
        <Textarea label="Warnings" rows={3} value={draft.warnings} onChange={(e) => set('warnings', e.target.value)} hint="One per line. Fine print on the product page." />
        {mark('warnings')}
      </div>

      <div className="flex items-center flex-wrap gap-2">
        <Button variant="primary" size="sm" loading={busy === 'save'} disabled={changed.length === 0 || busy !== null} onClick={save}>
          {changed.length === 0 ? 'Saved' : `Save ${changed.length} change${changed.length === 1 ? '' : 's'}`}
        </Button>
        {changed.length > 0 && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Undo changes
          </Button>
        )}
        {pendingBlanks && (
          <Button
            variant="secondary"
            size="sm"
            loading={busy === 'fill'}
            onClick={() => void send({ action: 'fill-blanks' }, 'fill', 'Filled what was blank. Each is marked as written by the model — check it.')}
          >
            Fill the blanks with AI
          </Button>
        )}
      </div>
      <Outcome done={done} error={error} />
    </Section>
  )
}
