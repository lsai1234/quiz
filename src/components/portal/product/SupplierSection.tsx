'use client'

import { useEffect, useState } from 'react'
import { Button, Input, Note } from '@/components/system'
import { Outcome, ReviewMark, Section, EYEBROW, META, errorText, money, postProduct, readStream, useDraft, type Payload } from './shared'
import { invalidateCatalogue } from '@/lib/catalogue/load'

/**
 * Supplier — PowerBody's side of the product: their id for it, what they
 * charge us, its weight and VAT, and the button that asks them for all of it.
 *
 * PowerBody's RRP is shown, not edited. It is their number, for reference; the
 * struck-through "was" price a customer sees is set per SKU under Flavours &
 * sizes. Editing an "RRP" here and seeing nothing change on the card was the
 * old confusion between the two.
 */
export function SupplierSection({
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
    supplierProductId: product.supplierProductId ?? '',
    cost: product.cost != null && product.cost > 0 ? String(product.cost) : '',
    weightGrams: product.weightGrams != null ? String(product.weightGrams) : '',
    vatPercent: product.vatRate != null ? String(Math.round(product.vatRate * 1000) / 10) : '',
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<string[]>([])
  const [pulled, setPulled] = useState<{ changed: Record<string, string>; filled: string[]; unresolved: Array<{ sku: string; message: string }> } | null>(null)

  useEffect(() => onDirty('Supplier', changed.length > 0), [changed.length, onDirty])

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
    onPayload(result.payload)
    setDone(success)
  }

  function save() {
    const fields: Record<string, unknown> = {}
    for (const key of changed) {
      const value = (draft[key] as string).trim()
      if (key === 'vatPercent') fields.vatRate = value === '' ? null : Number(value) / 100
      else if (key === 'supplierProductId') fields.supplierProductId = value || null
      else fields[key] = value === '' ? null : Number(value)
    }
    void send({ set: fields }, 'save', 'Saved.')
  }

  /**
   * Ask PowerBody about every SKU of this product. Streams what it is doing,
   * because finding an id PowerBody's list cannot reach can take a minute or
   * two — and a button that shows nothing for a minute looks broken.
   */
  async function pull() {
    setBusy('pull')
    setDone(null)
    setError(null)
    setSteps([])
    setPulled(null)
    try {
      const res = await fetch('/api/portal/products/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, stream: true }),
      })
      if (!res.ok && res.headers.get('content-type')?.includes('json')) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `The pull failed (HTTP ${res.status}).`)
        return
      }
      const result = await readStream(res, (line) => {
        if (typeof line.message === 'string') setSteps((s) => [...s.slice(-7), line.message as string])
      })
      if (!result) {
        // The request was cut off before it could answer — our time limit,
        // not PowerBody's silence. What it found so far is kept.
        setError('The pull ran out of time before finishing. Press it again — it carries on from what it found.')
        return
      }
      if (result.ok === false) {
        setError((result.error as string) ?? 'The pull failed.')
        return
      }
      invalidateCatalogue()
      if (result.product) onPayload(result as unknown as Payload)
      const report = {
        changed: (result.changed as Record<string, string>) ?? {},
        filled: (result.filled as string[]) ?? [],
        unresolved: (result.unresolved as Array<{ sku: string; message: string }>) ?? [],
      }
      setPulled(report)
      const n = Object.keys(report.changed).length
      setDone(
        n > 0 || report.filled.length > 0
          ? `PowerBody answered for ${result.answered} SKU${result.answered === 1 ? '' : 's'}. ${n} SKU${n === 1 ? '' : 's'} updated${report.filled.length ? `; filled ${report.filled.join(', ')}` : ''}.`
          : `PowerBody answered for ${result.answered} SKU${result.answered === 1 ? '' : 's'} — nothing had changed.`,
      )
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(null)
    }
  }

  const confirm = (field: string) => void send({ confirm: [field] }, `confirm:${field}`, 'Checked.')
  const skus = product.variants.filter((v) => v.sku)
  const withIds = skus.filter((v) => v.supplierProductId || (product.variants.length === 1 && product.supplierProductId)).length

  return (
    <Section
      id="supplier"
      title="Supplier"
      summary={`PowerBody ids known for ${withIds} of ${skus.length} SKU${skus.length === 1 ? '' : 's'} · costs ${money(product.cost && product.cost > 0 ? product.cost : null)}`}
      tone={payload.remaining.some((k) => k === 'cost' || k === 'weightGrams') ? 'attention' : undefined}
    >
      <div className="space-y-2">
        <p style={EYEBROW}>Pull from PowerBody</p>
        <p style={META}>
          Asks PowerBody about every SKU: what they charge us, their RRP, servings, size, picture and id. Prices you set by hand
          are never changed, and nothing you wrote is overwritten — a picture or description is only filled in where there is none.
        </p>
        <Button variant="secondary" size="sm" loading={busy === 'pull'} disabled={skus.length === 0 || busy !== null} onClick={() => void pull()}>
          {skus.length === 0 ? 'No PowerBody SKUs to ask about' : `Pull ${skus.length} SKU${skus.length === 1 ? '' : 's'} from PowerBody`}
        </Button>
        {busy === 'pull' && steps.length > 0 && (
          <ul aria-live="polite" style={{ ...META, listStyle: 'none', margin: 0, padding: 0 }}>
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
        {pulled && Object.keys(pulled.changed).length > 0 && (
          <ul style={{ ...META, listStyle: 'none', margin: 0, padding: 0 }}>
            {Object.entries(pulled.changed).map(([sku, note]) => (
              <li key={sku}>
                {sku}: {note}
              </li>
            ))}
          </ul>
        )}
        {pulled && pulled.unresolved.length > 0 && (
          <Note tone="attention">
            {pulled.unresolved.map((u) => `${u.sku}: ${u.message}`).join(' ')}
          </Note>
        )}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}>
        <Input
          label="PowerBody product id"
          inputMode="numeric"
          value={draft.supplierProductId}
          onChange={(e) => set('supplierProductId', e.target.value)}
          hint="The master SKU's. Each flavour keeps its own under Flavours & sizes."
        />
        <div className="space-y-1">
          <Input
            label="What PowerBody charge us (£)"
            inputMode="decimal"
            value={draft.cost}
            onChange={(e) => set('cost', e.target.value)}
            hint="The master SKU's cost. Blank or 0 means not known — margins are then estimated."
          />
          <ReviewMark field="cost" payload={payload} onConfirm={confirm} busy={busy === 'confirm:cost'} />
        </div>
        <div className="space-y-1">
          <Input
            label="Shipped weight (g)"
            inputMode="numeric"
            value={draft.weightGrams}
            onChange={(e) => set('weightGrams', e.target.value)}
            hint="Sets PowerBody's delivery band. Their API does not send it."
          />
          <ReviewMark field="weightGrams" payload={payload} onConfirm={confirm} busy={busy === 'confirm:weightGrams'} />
        </div>
        <Input
          label="VAT rate (%)"
          inputMode="decimal"
          value={draft.vatPercent}
          onChange={(e) => set('vatPercent', e.target.value)}
          hint="Blank is the standard rate. 0 for zero-rated food."
        />
      </div>
      <p style={META}>
        PowerBody’s RRP: {money(product.supplierRrp ?? null)} — for reference, not shown in the shop. The “was” price a customer
        sees is set per SKU under Flavours & sizes.
      </p>

      <div className="flex items-center flex-wrap gap-2">
        <Button variant="primary" size="sm" loading={busy === 'save'} disabled={changed.length === 0 || busy !== null} onClick={save}>
          {changed.length === 0 ? 'Saved' : `Save ${changed.length} change${changed.length === 1 ? '' : 's'}`}
        </Button>
        {changed.length > 0 && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Undo changes
          </Button>
        )}
      </div>
      <Outcome done={done} error={error} />
    </Section>
  )
}
