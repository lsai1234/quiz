'use client'

import { useEffect, useState } from 'react'
import { Button, Input, Note } from '@/components/system'
import { Outcome, ReviewMark, Section, EYEBROW, META, errorText, money, postProduct, readStream, useDraft, type Payload } from './shared'
import { invalidateCatalogue } from '@/lib/catalogue/load'
import { SUPPLIER_SETTINGS_HREF } from '@/lib/portal/product-links'
import { stopFor, type PullResult, type PullStop } from '@/components/portal/review/queue-model'

/**
 * Where to go about a refusal. The checks live on Settings → Supplier beside
 * the API user and key, so one link serves "see what PowerBody are answering"
 * and "fix the login"; the Sample supplier is switched off there too. Our own
 * server failing is not something the checks can help with.
 */
function refusalLink(stop: PullStop | null): { label: string; href: string } | null {
  if (!stop || stop.kind === 'server') return null
  return stop.kind === 'sample'
    ? { label: 'Open Settings → Supplier', href: SUPPLIER_SETTINGS_HREF }
    : { label: 'Run the checks', href: SUPPLIER_SETTINGS_HREF }
}

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
  /*
    The id and the cost are the MASTER SKU's facts, so they are read from it and
    written to it. Everything that uses them reads the SKU first — a price from
    `variant.cost ?? product.cost`, an order's PowerBody id from the SKU's own id
    — and a pull sets the product-level copies from the master SKU. Writing only
    the product-level copy, as this did, changed the line above and nothing
    else: the master kept its old cost and its rule price, orders kept going to
    the old id, and the next pull put both back.

    The STORED master (`defaultVariantId`), not `masterVariant`: that one steps
    past a sold-out master to the first SKU in stock, which is right for what
    the shop opens on and wrong for whose cost this is — the pull takes the
    product's copies from the stored one.
  */
  const master = product.variants.find((v) => v.id === product.defaultVariantId) ?? product.variants[0]
  const masterCost = master?.cost != null && master.cost > 0 ? master.cost : product.cost != null && product.cost > 0 ? product.cost : null
  const masterId = master?.supplierProductId ?? product.supplierProductId ?? null
  const { draft, set, changed, reset, saved } = useDraft({
    supplierProductId: masterId ?? '',
    cost: masterCost != null ? String(masterCost) : '',
    weightGrams: product.weightGrams != null ? String(product.weightGrams) : '',
    vatPercent: product.vatRate != null ? String(Math.round(product.vatRate * 1000) / 10) : '',
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<{ label: string; href: string } | null>(null)
  const [steps, setSteps] = useState<string[]>([])
  const [pulled, setPulled] = useState<{ changed: Record<string, string>; filled: string[]; unresolved: Array<{ sku: string; message: string }> } | null>(null)

  useEffect(() => onDirty('Supplier', changed.length > 0), [changed.length, onDirty])

  /**
   * `sent`: the draft as it was when Save was pressed (see `useDraft`).
   * `mirror`: the master SKU's name, when the edit carries the same cost or id
   * for it as for the product (see `save`).
   */
  async function send(body: Record<string, unknown>, label: string, success: string, sent?: typeof draft, mirror?: string) {
    setBusy(label)
    setDone(null)
    setError(null)
    setLink(null)
    const result = await postProduct('/api/portal/products', { id: product.id, ...body })
    setBusy(null)
    if (!result.ok) {
      /*
        The cost and the id go to the product and to its master SKU, and the
        server checks each copy, so a bad one came back twice: "PowerBody
        product id must be PowerBody’s numeric product id. P1: powerbody
        product id must be …". The SKU's copy is the same value under the same
        rule, so its sentence is dropped and the founder reads each problem once.
      */
      const once = mirror ? result.problems?.filter((p) => !p.startsWith(`${mirror}: `)) : undefined
      setError(errorText(once && once.length > 0 ? { ...result, problems: once } : result))
      setLink(result.link ?? null)
      return
    }
    onPayload(result.payload)
    if (sent) saved(sent)
    setDone(success)
  }

  function save() {
    const fields: Record<string, unknown> = {}
    const onMaster: Record<string, unknown> = {}
    for (const key of changed) {
      const value = (draft[key] as string).trim()
      if (key === 'vatPercent') fields.vatRate = value === '' ? null : Number(value) / 100
      else if (key === 'supplierProductId') fields.supplierProductId = onMaster.supplierProductId = value || null
      else if (key === 'cost') fields.cost = onMaster.cost = value === '' ? null : Number(value)
      else fields[key] = value === '' ? null : Number(value)
    }
    // One edit, one write: the master SKU, and the product-level copy with it,
    // so the two cannot disagree for even a moment. The product-level `cost` is
    // also what Review's "What we pay" check reads — typing it here is the
    // founder's word on it, exactly as before.
    const body: Record<string, unknown> = { set: fields }
    const toMaster = master != null && Object.keys(onMaster).length > 0
    if (toMaster) body.variants = [{ id: master.id, ...onMaster }]
    void send(
      body,
      'save',
      toMaster ? 'Saved — on the master SKU too, so its prices and orders use it.' : 'Saved.',
      draft,
      toMaster ? (master.sku ?? master.title) : undefined,
    )
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
    setLink(null)
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
      // Read for a refusal the same way the review queue's bulk fill does, so
      // the two never disagree about what PowerBody said.
      const stop = stopFor(result as PullResult)
      if (result.ok === false) {
        setError((result.error as string) ?? 'The pull failed.')
        // The route's hard stop before anything came back: PowerBody went
        // quiet, which the checks can show — not our server failing.
        setLink(result.timedOut === true ? { label: 'Run the checks', href: SUPPLIER_SETTINGS_HREF } : refusalLink(stop))
        return
      }
      invalidateCatalogue()
      if (result.product) onPayload(result as unknown as Payload)
      const report = {
        changed: (result.changed as Record<string, string>) ?? {},
        filled: (result.filled as string[]) ?? [],
        unresolved: (result.unresolved as Array<{ sku: string; message: string }>) ?? [],
      }
      const answered = typeof result.answered === 'number' ? result.answered : 0
      const asked = answered + report.unresolved.length
      const n = Object.keys(report.changed).length
      const updated = `${n} SKU${n === 1 ? '' : 's'} updated${report.filled.length ? `; filled ${report.filled.join(', ')}` : ''}`
      // A refusal the pull got past is not one. PowerBody's own error on the
      // batch of ids we hold does not stop it — each SKU is then looked up on
      // its own — and when every one of them answered, `refused` only records
      // what happened on the way. Read as a refusal, a full answer came out red
      // as "answered for 2 of 2 SKUs … but not for the rest".
      if (stop && report.unresolved.length > 0) {
        /*
          PowerBody refused — rate limit, DEMO sandbox, login, their error. The
          route still answers ok (it saves whatever did arrive), and this used
          to read that as a green "nothing had changed": as if the product were
          up to date, when nobody had been told anything. Their words instead,
          and where to look. The per-SKU note below would only repeat the same
          sentence once per SKU, so it lists just the SKUs left behind.
        */
        setPulled({ ...report, unresolved: report.unresolved.filter((u) => u.message !== stop.message) })
        setError(
          answered > 0
            ? `PowerBody answered for ${answered} of ${asked} SKUs (${updated}, and saved) but not for the rest. ${stop.message}`
            : `Nothing was pulled, so nothing changed. ${stop.message}`,
        )
        setLink(refusalLink(stop))
        return
      }
      setPulled(report)
      if (result.timedOut === true && typeof result.message === 'string') {
        // The route's hard stop: what PowerBody sent is saved, the rest not reached.
        setError(result.message)
        setLink({ label: 'Run the checks', href: SUPPLIER_SETTINGS_HREF })
        return
      }
      if (answered === 0) {
        // Not a refusal, and not good news either: every SKU's reason is below.
        setError(
          `PowerBody did not answer for ${asked > 0 ? `any of the ${asked} SKU${asked === 1 ? '' : 's'}` : 'any SKU'}, so nothing was changed. Why for each is below.`,
        )
        return
      }
      setDone(
        n > 0 || report.filled.length > 0
          ? `PowerBody answered for ${answered} SKU${answered === 1 ? '' : 's'}. ${updated}.`
          : `PowerBody answered for ${answered} SKU${answered === 1 ? '' : 's'} — nothing had changed.`,
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
      summary={`PowerBody ids known for ${withIds} of ${skus.length} SKU${skus.length === 1 ? '' : 's'} · the master costs ${money(masterCost)}`}
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
          hint="The master SKU’s — saved on it. Each flavour keeps its own under Flavours & sizes."
        />
        <div className="space-y-1">
          <Input
            label="What PowerBody charge us (£)"
            inputMode="decimal"
            value={draft.cost}
            onChange={(e) => set('cost', e.target.value)}
            hint="The master SKU’s cost — saved on it. Blank or 0 means not known — margins are then estimated."
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
      <Outcome done={done} error={error} link={link} />
    </Section>
  )
}
