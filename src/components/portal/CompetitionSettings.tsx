'use client'

import { useEffect, useState } from 'react'
import type { Campaign, CampaignStatus, CompetitionState } from '@/lib/competition/campaign'
import type { CompetitionEntry, EntryState } from '@/lib/competition/entries'

/**
 * The competition, in the Founders Hub.
 *
 * ── What this screen is for ─────────────────────────────────────────────────
 * "Follow, repost, share to your story, win up to £200" is a prize draw under
 * the CAP Code, and the wording it needs — a closing date, a promoter's name and
 * address, how winners are picked, a free entry route — does not exist yet. So
 * the mechanics are built and the words live here, to be filled in when somebody
 * has written them.
 *
 * The one thing this screen refuses to do is let the promotion go **live** with
 * any of them missing. It says which, rather than refusing flatly, because a
 * checklist is the useful version of "no".
 *
 * `Test` runs the whole flow with everything visibly marked as a rehearsal and
 * entries recorded as test rows, kept out of every real draw. That is what
 * trying it before the wording exists looks like.
 */

interface Data {
  campaign: Campaign
  state: CompetitionState
  missing: string[]
  counts: Record<string, number>
  entries: CompetitionEntry[]
}

const surface = { background: 'var(--surface-1)', border: '1px solid var(--edge)' } as const
const input =
  'w-full px-3 py-2 rounded-xl text-xs outline-none bg-[var(--surface-2)] border border-[var(--edge)] text-[var(--ink-1)]'

const STATUS_COPY: Record<CampaignStatus, { label: string; desc: string }> = {
  off: { label: 'Off', desc: 'Nothing about a competition appears anywhere. The default.' },
  test: { label: 'Test', desc: 'The whole flow runs, marked as a rehearsal. Entries are kept out of any real draw.' },
  live: { label: 'Live', desc: 'A real promotion. Only available once everything below is filled in.' },
}

const FIELDS: Array<{ key: keyof Campaign; label: string; hint: string; long?: boolean }> = [
  { key: 'name', label: 'Name', hint: 'Internal and on the entry screen — e.g. “£200 Stack Giveaway”.' },
  { key: 'prize', label: 'Prize', hint: 'As advertised. “Up to £200” needs a defined structure before this can go live.' },
  { key: 'mechanic', label: 'How to enter', hint: 'Follow, repost, share to your story — in the words it appears in.' },
  { key: 'promoterName', label: 'Promoter name', hint: 'Required: the promoter has to be identifiable on the promotion.' },
  { key: 'promoterAddress', label: 'Promoter address', hint: 'Required, and it has to be a real one.', long: true },
  { key: 'winnerSelection', label: 'How winners are picked', hint: 'When, how, how they are told, and what happens if they cannot be reached.', long: true },
  { key: 'freeEntryRoute', label: 'Free entry route', hint: 'No purchase necessary, and of equal standing to entering by sharing.', long: true },
  { key: 'termsUrl', label: 'Full terms URL', hint: 'Where the complete terms live.' },
  { key: 'platformDisclaimer', label: 'Platform disclaimer', hint: 'Instagram requires the promotion to disclaim their involvement.', long: true },
]

export function CompetitionSettings() {
  const [data, setData] = useState<Data | null>(null)
  const [draft, setDraft] = useState<Campaign | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [winner, setWinner] = useState<CompetitionEntry | null>(null)

  useEffect(() => {
    fetch('/api/portal/competition')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Data | null) => { if (d) { setData(d); setDraft(d.campaign) } })
      .catch(() => {})
  }, [])

  async function post(body: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/competition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.missing?.length ? `Can’t go live yet — still missing: ${json.missing.join(', ')}.` : json.error)
        return
      }
      setData(json)
      setDraft(json.campaign)
      if ('winner' in json) setWinner(json.winner)
    } catch {
      setError('Couldn’t reach the server.')
    } finally {
      setSaving(false)
    }
  }

  if (!data || !draft) return <p className="text-xs text-[var(--ink-3)]">Loading…</p>

  return (
    <div className="space-y-3">
      {/* Status */}
      <div className="rounded-2xl p-4" style={surface}>
        <p className="text-xs font-bold mb-2 text-[var(--ink-1)]">Status</p>
        <div className="flex gap-2 mb-2">
          {(Object.keys(STATUS_COPY) as CampaignStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              disabled={saving}
              onClick={() => post({ action: 'save', campaign: { ...draft, status: s } })}
              className="flex-1 py-2 rounded-xl text-xs font-bold"
              style={{
                background: data.campaign.status === s ? 'var(--accent)' : 'var(--surface-2)',
                color: data.campaign.status === s ? 'var(--ink-on-accent)' : 'var(--ink-2)',
                border: '1px solid var(--edge)',
              }}
            >
              {STATUS_COPY[s].label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[var(--ink-3)] leading-snug">{STATUS_COPY[data.campaign.status].desc}</p>

        {data.missing.length > 0 && (
          <div className="mt-3 rounded-xl p-3" style={{ background: 'var(--attention-fill)', border: '1px solid var(--attention-line)' }}>
            <p className="text-[11px] font-bold text-[var(--tone-attention)] mb-1">
              Not ready to go live — {data.missing.length} still to fill in
            </p>
            <ul className="text-[11px] text-[var(--ink-2)] list-disc pl-4 space-y-0.5">
              {data.missing.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </div>
        )}
        {error && <p className="text-[11px] mt-2" style={{ color: 'var(--tone-critical)' }}>{error}</p>}
      </div>

      {/* The wording */}
      <div className="rounded-2xl p-4 space-y-3" style={surface}>
        <div>
          <p className="text-xs font-bold text-[var(--ink-1)]">The promotion</p>
          <p className="text-[11px] text-[var(--ink-3)] leading-snug">
            Every field here is something the CAP Code requires to appear on or with a prize
            draw. Fill them in when the wording is signed off — nothing goes live without them.
          </p>
        </div>

        <div>
          <label className="text-[11px] font-bold text-[var(--ink-2)] block mb-1">Closing date</label>
          <input
            type="date"
            className={input}
            value={draft.closesAt ? draft.closesAt.slice(0, 10) : ''}
            onChange={(e) => setDraft({ ...draft, closesAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
          />
          <p className="text-[10px] text-[var(--ink-3)] mt-1 leading-snug">
            Read live, not baked into cards — a card stops advertising the draw the day it closes.
          </p>
        </div>

        {FIELDS.map(({ key, label, hint, long }) => (
          <div key={key}>
            <label className="text-[11px] font-bold text-[var(--ink-2)] block mb-1">{label}</label>
            {long ? (
              <textarea
                rows={2}
                className={input}
                value={String(draft[key] ?? '')}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            ) : (
              <input
                className={input}
                value={String(draft[key] ?? '')}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            )}
            <p className="text-[10px] text-[var(--ink-3)] mt-1 leading-snug">{hint}</p>
          </div>
        ))}

        <button
          type="button"
          disabled={saving}
          onClick={() => post({ action: 'save', campaign: draft })}
          className="w-full py-2.5 rounded-xl text-xs font-bold"
          style={{ background: 'var(--accent)', color: 'var(--ink-on-accent)' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Entries */}
      <div className="rounded-2xl p-4" style={surface}>
        <p className="text-xs font-bold text-[var(--ink-1)] mb-2">Entries</p>
        <div className="grid grid-cols-5 gap-2 mb-3">
          {(['pending', 'verified', 'rejected', 'won', 'test'] as const).map((k) => (
            <div key={k} className="rounded-xl px-2 py-2" style={{ background: 'var(--surface-2)' }}>
              <p className="text-[9px] uppercase tracking-wide text-[var(--ink-3)]">{k}</p>
              <p className="text-base font-black text-[var(--ink-1)]">{data.counts[k] ?? 0}</p>
            </div>
          ))}
        </div>

        {data.entries.length === 0 ? (
          <p className="text-[11px] text-[var(--ink-3)]">No entries yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {data.entries.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[var(--ink-1)] truncate">
                    @{e.handle}
                    {e.isTest && <span className="ml-2 text-[9px] font-bold text-[var(--tone-attention)]">TEST</span>}
                  </p>
                  <p className="text-[10px] text-[var(--ink-3)]">
                    {e.channel} · {e.route === 'free' ? 'free entry' : 'shared'} · {e.state}
                  </p>
                </div>
                {e.state === 'pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => post({ action: 'set-state', id: e.id, state: 'verified' })}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg"
                      style={{ background: 'var(--positive-fill)', color: 'var(--tone-positive)' }}
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      onClick={() => post({ action: 'set-state', id: e.id, state: 'rejected' })}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg"
                      style={{ background: 'var(--critical-fill)', color: 'var(--tone-critical)' }}
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          disabled={saving || (data.counts.verified ?? 0) === 0}
          onClick={() => post({ action: 'draw' })}
          className="w-full mt-3 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40"
          style={{ background: 'var(--surface-2)', color: 'var(--ink-1)', border: '1px solid var(--edge)' }}
        >
          Draw a winner
        </button>
        <p className="text-[10px] text-[var(--ink-3)] mt-1.5 leading-snug">
          Drawn at random from verified entries only. Test entries can never win.
        </p>
        {winner && (
          <p className="text-xs font-bold mt-2" style={{ color: 'var(--tone-positive)' }}>
            Winner: @{winner.handle} ({winner.channel})
          </p>
        )}
      </div>
    </div>
  )
}
