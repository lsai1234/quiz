'use client'

import { useState } from 'react'
import type { ImportPreview } from '@/lib/portal/import'

const ACCENT = '#00D4FF'

interface ImportResult { ok: boolean; imported: number; failed: number; source: string }

export default function ImportPage() {
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setCsv(String(reader.result ?? '')); setPreview(null); setResult(null) }
    reader.readAsText(file)
  }

  async function runPreview() {
    setBusy(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/portal/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }) })
      const d = await res.json()
      if (!res.ok) setError(d.error || 'Could not parse CSV')
      else setPreview(d.preview)
    } finally { setBusy(false) }
  }

  async function runImport() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/portal/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv, confirm: true }) })
      const d = await res.json()
      if (!res.ok) setError(d.error || 'Import failed')
      else setResult(d)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Bulk import products</h1>
      <p className="text-sm text-[var(--color-muted)] mb-4">
        Import dropship products (e.g. from Olivit) in bulk. Fill the template, upload it, review the preview, then import.
      </p>

      {/* Step 1: template */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-3">
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>1 · Get the template</p>
        <p className="text-xs text-[var(--color-muted)] mb-2 leading-relaxed">
          Columns: handle, title, description, category, price, compare_at_price, cost, sku, flavours, image_url, servings, subscription_eligible.
          Use <code>|</code> to separate multiple flavours / SKUs (e.g. <code>Berry|Original</code>).
        </p>
        <a href="/templates/olivit-import-template.csv" download className="text-xs font-bold inline-block" style={{ color: ACCENT }}>↓ Download CSV template</a>
      </div>

      {/* Step 2: upload */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-3">
        <p className="text-sm font-bold mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>2 · Upload & preview</p>
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-xs text-[var(--color-muted)] mb-2 block" />
        <textarea value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); setResult(null) }} placeholder="…or paste CSV here" rows={4} className="w-full px-3 py-2 rounded-xl text-xs font-mono outline-none mb-2" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
        <button onClick={runPreview} disabled={!csv.trim() || busy} className="text-xs font-bold px-3 py-2 rounded-xl bg-[var(--color-surface-2)] text-[var(--color-text)] border border-[var(--color-border)] disabled:opacity-40">
          {busy ? 'Working…' : 'Preview'}
        </button>
      </div>

      {error && <div className="mb-3 text-xs rounded-xl px-3 py-2" style={{ background: 'color-mix(in srgb, #f87171 12%, transparent)', border: '1px solid color-mix(in srgb, #f87171 30%, transparent)', color: '#fca5a5' }}>{error}</div>}

      {/* Step 3: preview table + import */}
      {preview && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>3 · Review</p>
            <p className="text-xs text-[var(--color-muted)]">
              <span style={{ color: '#34d399' }}>{preview.validCount} valid</span>
              {preview.errorCount > 0 && <span style={{ color: '#f87171' }}> · {preview.errorCount} with errors</span>}
            </p>
          </div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {preview.rows.map((r) => (
              <div key={r.row} className="rounded-xl border p-2 text-xs" style={{ borderColor: r.errors.length ? 'color-mix(in srgb, #f87171 40%, transparent)' : 'var(--color-border)', background: 'var(--color-surface-2)' }}>
                <div className="flex items-center justify-between">
                  <span className="font-bold" style={{ color: 'var(--color-text)' }}>{r.raw.title || r.raw.handle || `Row ${r.row}`}</span>
                  <span style={{ color: r.errors.length ? '#f87171' : '#34d399' }}>{r.errors.length ? 'error' : 'ok'}</span>
                </div>
                {r.product && r.errors.length === 0 && (
                  <p className="text-[11px] text-[var(--color-muted)]">£{r.product.basePrice.toFixed(2)} · {r.product.category} · {r.product.variants.length} variant{r.product.variants.length > 1 ? 's' : ''}</p>
                )}
                {r.errors.length > 0 && <p className="text-[11px]" style={{ color: '#fca5a5' }}>{r.errors.join('; ')}</p>}
              </div>
            ))}
          </div>
          <button onClick={runImport} disabled={preview.validCount === 0 || busy} className="mt-3 text-sm font-bold px-4 py-2.5 rounded-xl bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all disabled:opacity-40" style={{ fontFamily: 'var(--font-display)' }}>
            {busy ? 'Importing…' : `Import ${preview.validCount} product${preview.validCount === 1 ? '' : 's'}`}
          </button>
        </div>
      )}

      {result && (
        <div className="mb-3 text-xs rounded-xl px-3 py-2.5" style={{ background: 'color-mix(in srgb, #34d399 12%, transparent)', border: '1px solid color-mix(in srgb, #34d399 30%, transparent)', color: '#6ee7b7' }}>
          Imported <strong>{result.imported}</strong> product{result.imported === 1 ? '' : 's'} into {result.source === 'shopify' ? 'Shopify' : 'the mock catalogue'}
          {result.failed > 0 && <span style={{ color: '#fca5a5' }}> · {result.failed} failed</span>}. They now appear on the Dashboard.
        </div>
      )}

      {/* Coming soon: supplier sync */}
      <div className="rounded-2xl border border-dashed p-4 mt-6 opacity-80" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-bold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Supplier sync (Olivit)</p>
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 14%, transparent)` }}>Coming soon</span>
        </div>
        <p className="text-xs text-[var(--color-muted)] leading-relaxed">
          Check with the supplier to flag products that are out of date or discontinued, so you can prune the catalogue automatically. Not built yet.
        </p>
        <button disabled className="mt-2 text-xs font-bold px-3 py-2 rounded-xl bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)] cursor-not-allowed">Check supplier</button>
      </div>
    </div>
  )
}
