'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BACKLOG_APPS,
  BACKLOG_PRIORITIES,
  BACKLOG_STATUSES,
  BACKLOG_SIZES,
  type BacklogItem,
  type BacklogApp,
  type BacklogPriority,
  type BacklogStatus,
  type BacklogSize,
} from '@/lib/portal/backlog'

const ACCENT = '#00D4FF'

const STATUS_LABEL: Record<BacklogStatus, string> = {
  idea: 'Ideas', next: 'Up next', 'in-progress': 'In progress', done: 'Done',
}
const APP_COLOR: Record<BacklogApp, string> = { hub: '#a78bfa', portal: '#00D4FF', quiz: '#f59e0b' }
const PRIORITY_COLOR: Record<BacklogPriority, string> = { P0: '#f87171', P1: '#fbbf24', P2: '#60a5fa', P3: '#9ca3af' }

export default function BacklogPage() {
  const [items, setItems] = useState<BacklogItem[] | null>(null)
  const [appFilter, setAppFilter] = useState<'all' | BacklogApp>('all')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<{ title: string; detail: string; app: BacklogApp; priority: BacklogPriority }>({
    title: '', detail: '', app: 'hub', priority: 'P2',
  })

  function load() {
    fetch('/api/portal/backlog').then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => setItems([]))
  }
  useEffect(load, [])

  const visible = useMemo(() => {
    let r = items ?? []
    if (appFilter !== 'all') r = r.filter((i) => i.app === appFilter)
    if (query) r = r.filter((i) => (i.title + ' ' + i.detail).toLowerCase().includes(query.toLowerCase()))
    return r
  }, [items, appFilter, query])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    const res = await fetch('/api/portal/backlog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm({ title: '', detail: '', app: form.app, priority: 'P2' })
      setAdding(false)
      load()
    }
  }

  async function patch(id: string, p: Partial<BacklogItem>) {
    await fetch('/api/portal/backlog', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, patch: p }) })
    load()
  }

  async function reorderWithin(status: BacklogStatus, id: string, dir: -1 | 1) {
    const column = (items ?? []).filter((i) => i.status === status).sort((a, b) => a.order - b.order)
    const idx = column.findIndex((i) => i.id === id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= column.length) return
    const ids = column.map((i) => i.id)
    ;[ids[idx], ids[swap]] = [ids[swap], ids[idx]]
    await fetch('/api/portal/backlog', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderedIds: ids }) })
    load()
  }

  async function remove(id: string) {
    await fetch('/api/portal/backlog', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  function moveStatus(item: BacklogItem, dir: -1 | 1) {
    const idx = BACKLOG_STATUSES.indexOf(item.status)
    const next = BACKLOG_STATUSES[idx + dir]
    if (next) patch(item.id, { status: next })
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Improvements backlog</h1>
        <button onClick={() => setAdding((v) => !v)} className="text-xs font-bold px-3 py-2 rounded-xl bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-95 transition-all" style={{ fontFamily: 'var(--font-display)' }}>
          {adding ? 'Close' : '+ New request'}
        </button>
      </div>
      <p className="text-sm text-[var(--color-muted)] mb-4">Track improvement requests for the hub, portal and quiz. Set priority, move between columns, and re-rank.</p>

      {adding && (
        <form onSubmit={create} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-4 space-y-3">
          <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What should we improve?" className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          <textarea value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="Details (optional)" rows={2} className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          <div className="flex gap-2">
            <select value={form.app} onChange={(e) => setForm({ ...form, app: e.target.value as BacklogApp })} className="flex-1 px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              {BACKLOG_APPS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as BacklogPriority })} className="flex-1 px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              {BACKLOG_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button type="submit" disabled={!form.title.trim()} className="px-4 py-2 rounded-xl text-sm font-bold bg-[var(--color-accent)] text-[var(--color-bg)] disabled:opacity-50">Add</button>
          </div>
        </form>
      )}

      {/* Filters */}
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search backlog…" className="w-full px-3 py-2 rounded-xl text-sm outline-none mb-2" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
      <div className="flex flex-wrap gap-2 mb-4">
        {(['all', ...BACKLOG_APPS] as const).map((a) => (
          <button key={a} onClick={() => setAppFilter(a)} className="px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: appFilter === a ? 'var(--color-accent)' : 'var(--color-surface-2)', color: appFilter === a ? 'var(--color-bg)' : 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
            {a === 'all' ? `All (${items?.length ?? 0})` : a}
          </button>
        ))}
      </div>

      {items === null ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {BACKLOG_STATUSES.map((status) => {
            const column = visible.filter((i) => i.status === status).sort((a, b) => a.order - b.order)
            return (
              <div key={status} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                <p className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>
                  {STATUS_LABEL[status]} <span style={{ color: ACCENT }}>{column.length}</span>
                </p>
                <div className="space-y-2">
                  {column.length === 0 && <p className="text-[11px] text-[var(--color-muted)] py-2">Nothing here.</p>}
                  {column.map((item, idx) => (
                    <div key={item.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{item.title}</p>
                        <button onClick={() => remove(item.id)} className="text-[var(--color-muted)] text-xs hover:text-[var(--color-red)]" title="Delete">✕</button>
                      </div>
                      {item.detail && <p className="text-[11px] text-[var(--color-muted)] mt-1 leading-relaxed">{item.detail}</p>}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase" style={{ color: APP_COLOR[item.app], background: `color-mix(in srgb, ${APP_COLOR[item.app]} 14%, transparent)` }}>{item.app}</span>
                        <select value={item.priority} onChange={(e) => patch(item.id, { priority: e.target.value as BacklogPriority })} className="text-[10px] font-bold rounded-md px-1 py-0.5 outline-none" style={{ color: PRIORITY_COLOR[item.priority], background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                          {BACKLOG_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select value={item.impact ?? ''} onChange={(e) => patch(item.id, { impact: (e.target.value || undefined) as BacklogSize })} className="text-[10px] rounded-md px-1 py-0.5 outline-none text-[var(--color-muted)]" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }} title="Impact">
                          <option value="">impact</option>
                          {BACKLOG_SIZES.map((s) => <option key={s} value={s}>I:{s}</option>)}
                        </select>
                        <select value={item.effort ?? ''} onChange={(e) => patch(item.id, { effort: (e.target.value || undefined) as BacklogSize })} className="text-[10px] rounded-md px-1 py-0.5 outline-none text-[var(--color-muted)]" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }} title="Effort">
                          <option value="">effort</option>
                          {BACKLOG_SIZES.map((s) => <option key={s} value={s}>E:{s}</option>)}
                        </select>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex gap-1">
                          <button onClick={() => moveStatus(item, -1)} disabled={BACKLOG_STATUSES.indexOf(item.status) === 0} className="text-[11px] px-1.5 py-0.5 rounded-md disabled:opacity-30" style={{ border: '1px solid var(--color-border)', color: 'var(--color-muted)' }} title="Move to previous column">◀</button>
                          <button onClick={() => moveStatus(item, 1)} disabled={BACKLOG_STATUSES.indexOf(item.status) === BACKLOG_STATUSES.length - 1} className="text-[11px] px-1.5 py-0.5 rounded-md disabled:opacity-30" style={{ border: '1px solid var(--color-border)', color: 'var(--color-muted)' }} title="Move to next column">▶</button>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => reorderWithin(status, item.id, -1)} disabled={idx === 0} className="text-[11px] px-1.5 py-0.5 rounded-md disabled:opacity-30" style={{ border: '1px solid var(--color-border)', color: 'var(--color-muted)' }} title="Move up">▲</button>
                          <button onClick={() => reorderWithin(status, item.id, 1)} disabled={idx === column.length - 1} className="text-[11px] px-1.5 py-0.5 rounded-md disabled:opacity-30" style={{ border: '1px solid var(--color-border)', color: 'var(--color-muted)' }} title="Move down">▼</button>
                        </div>
                      </div>
                      <p className="text-[10px] text-[var(--color-muted)] mt-1.5">by {item.createdBy}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
